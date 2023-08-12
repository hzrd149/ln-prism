import { Event, Kind, finishEvent, generatePrivateKey, getPublicKey, nip19, nip57 } from "nostr-tools";
import { nanoid } from "nanoid";
import { Debugger } from "debug";
import dayjs from "dayjs";

import { satsToMsats, msatsToSats } from "../helpers/sats.js";
import { ConflictError } from "../helpers/errors.js";
import { connect, publish } from "../relays.js";
import { NOSTR_RELAYS } from "../env.js";
import { lightning } from "../backend/index.js";
import Target, { OutgoingPaymentStatus, TargetJSON } from "./targets/target.js";
import { appDebug } from "../debug.js";
import { getTargetType } from "./targets/index.js";
import { InvoiceStatus } from "../backend/type.js";
import { db } from "../db.js";

export enum IncomingPaymentStatus {
  Pending = "pending",
  Received = "received",
  Complete = "complete",
  Expired = "expired",
}

export type IncomingPayment = {
  /** uuid */
  id: string;
  /** the split this applies to */
  split: string;
  /** status of the split */
  status: IncomingPaymentStatus;
  /** bolt11 payment hash */
  paymentHash: string;
  /** bolt11 */
  paymentRequest: string;
  /** amount in msats */
  amount: number;
  /** lnurl comment or zapRequest.content */
  comment?: string;
  /** LN Address or pubkey */
  identifier?: string;
  /** the zap request event for the zap receipt */
  zapRequest?: string;
  /** and array of outgoing payments create from this invoice */
  outgoing: string[];
};

type SplitJson = {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  targets: TargetJSON[];
  enableNostrZaps: boolean;
  privateKey: string;
  enableNostrProfile: boolean;
};

export class Split {
  privateKey: string;
  enableNostrZaps: boolean = true;
  enableNostrProfile: boolean = true;
  id: string;
  name: string;
  domain: string;
  targets: Target[] = [];
  log: Debugger;

  apiKey = nanoid();

  constructor(name: string, domain: string, privateKey?: string) {
    this.id = nanoid();
    this.privateKey = privateKey || generatePrivateKey();
    this.domain = domain;
    this.name = name;

    this.log = appDebug.extend(this.address);
  }

  get incoming() {
    return db.data.incoming.filter((incoming) => incoming.split === this.id);
  }
  get incomingPending() {
    return db.data.incoming.filter(
      (incoming) =>
        incoming.split === this.id &&
        (incoming.status === IncomingPaymentStatus.Pending || incoming.status === IncomingPaymentStatus.Received)
    );
  }
  get incomingComplete() {
    return db.data.incoming.filter(
      (incoming) =>
        incoming.split === this.id &&
        (incoming.status === IncomingPaymentStatus.Complete || incoming.status === IncomingPaymentStatus.Expired)
    );
  }

  get address() {
    return this.name + "@" + this.domain;
  }
  get nprofile() {
    return nip19.nprofileEncode({
      pubkey: getPublicKey(this.privateKey),
      relays: [NOSTR_RELAYS[0]],
    });
  }
  get pubkey() {
    return getPublicKey(this.privateKey);
  }
  get npub() {
    return nip19.npubEncode(getPublicKey(this.privateKey));
  }
  get nsec() {
    return nip19.nsecEncode(this.privateKey);
  }
  get lnurlp() {
    return `lnurlp://${this.domain}/lnurlp/${this.name}`;
  }

  async updateNostrProfile() {
    if (!this.enableNostrProfile) return;

    const percentages = this.getSplitPercentages();
    const targets = this.targets
      .map((target) => {
        const percent = (percentages[target.id] * 100).toFixed(2);
        return `${target.link} ${percent}%`;
      })
      .join("\n");

    const metadata = {
      name: this.address,
      lud16: this.address,
      about: targets,
    };

    const kind0 = finishEvent(
      {
        kind: Kind.Metadata,
        content: JSON.stringify(metadata),
        created_at: dayjs().unix(),
        tags: [],
      },
      this.privateKey
    );

    const relays = finishEvent(
      {
        kind: Kind.RelayList,
        content: "",
        tags: NOSTR_RELAYS.map((url) => ["r", url]),
        created_at: dayjs().unix(),
      },
      this.privateKey
    );

    await connect(NOSTR_RELAYS);

    await publish(NOSTR_RELAYS, kind0);
    await publish(NOSTR_RELAYS, relays);

    this.log(`Updated nostr profile ${this.npub}`);
  }

  async getMinSendable() {
    return satsToMsats(1);
  }
  async getMaxSendable() {
    return satsToMsats(500000); // 500,000 sats
  }
  async getMaxComment(): Promise<number | undefined> {
    const targetsMaxComments = await Promise.all(
      this.targets.filter((t) => t.forwardComment).map((t) => t.getMaxComment())
    );

    let maxLength: number | undefined = undefined;
    for (const length of targetsMaxComments) {
      if (length !== undefined) {
        // find the shortest max length
        maxLength = Math.min(length, maxLength ?? 255);
      }
    }
    return maxLength;
  }

  getSplitPercentages() {
    const percentages: Record<string, number> = {};

    // start at 100%
    let remainingPercent = 1;

    const fixed = this.targets.filter((t) => t.fixed);
    for (const target of fixed) {
      const percent = target.weight / 100;
      if (remainingPercent >= percent) {
        percentages[target.id] = percent;
        remainingPercent -= percent;
      } else percentages[target.id] = 0;
    }

    const floating = this.targets.filter((t) => !t.fixed);
    const floatingTotal = floating.reduce((v, t) => v + t.weight, 0);
    for (const target of floating) {
      percentages[target.id] = Math.max(0, remainingPercent * (target.weight / floatingTotal));
    }

    return percentages;
  }

  getTarget(id: string): Target | undefined {
    return this.targets.find((target) => target.id == id);
  }
  getTargetByInput(input: string): Target | undefined {
    return this.targets.find((t) => t.input === input);
  }

  async addTarget(target: Target) {
    if (this.getTargetByInput(target.input)) throw new ConflictError(`A target with ${target.input} already exists`);

    this.targets.push(target);
    target.parentSplit = this;

    this.updateNostrProfile();
  }
  async removeTarget(id: string) {
    this.targets = this.targets.filter((target) => target.id !== id);

    this.updateNostrProfile();
  }
  async updateTarget(
    id: string,
    input: string,
    {
      weight,
      forwardComment,
      fixed,
      payoutThreshold,
    }: { weight?: number; forwardComment?: boolean; fixed?: boolean; payoutThreshold?: number }
  ) {
    const target = this.getTarget(id);
    if (!target) throw new Error(`No target with id, ${id}`);

    await target.setInput(input);
    if (weight) target.weight = weight;
    if (payoutThreshold !== undefined) target.payoutThreshold = payoutThreshold;
    if (forwardComment !== undefined) target.forwardComment = forwardComment;
    if (fixed !== undefined) target.fixed = fixed;

    this.updateNostrProfile();
  }

  async createInvoice(
    amount: number,
    {
      description,
      lnurlComment,
      lnurlIdentifier,
      zapRequest,
    }: {
      description?: string;
      lnurlComment?: string;
      lnurlIdentifier?: string;
      zapRequest?: string;
    }
  ) {
    const id = nanoid();
    const invoice = await lightning.createInvoice(
      amount,
      description,
      `https://${this.domain}/webhook/${this.id}/${id}`
    );

    if (!invoice.paymentHash) throw new Error("Missing paymentHash");

    let comment: string;
    let identifier: string;
    if (zapRequest) {
      const parsed = JSON.parse(zapRequest) as Event;
      comment = parsed.content;
      identifier = parsed.pubkey;
    } else {
      comment = lnurlComment;
      identifier = lnurlIdentifier;
    }

    const incoming: IncomingPayment = {
      id,
      split: this.id,
      status: IncomingPaymentStatus.Pending,
      amount,
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      comment,
      identifier,
      zapRequest,
      outgoing: [],
    };

    db.data.incoming.push(incoming);

    return invoice;
  }

  async handlePaid(id: string) {
    const incoming = db.data.incoming.find((i) => i.id === id);

    if (incoming.split !== this.id) return;
    if (incoming.status !== IncomingPaymentStatus.Pending)
      throw new Error(`Payouts already created for ${incoming.id}`);

    const percentages = this.getSplitPercentages();
    this.log(`Received ${msatsToSats(incoming.amount)} sats`);

    // create payouts
    for (const target of this.targets) {
      const payoutAmount = Math.round(percentages[target.id] * incoming.amount);

      const payout = target.forwardComment
        ? target.addPayout(payoutAmount, incoming.comment, incoming.identifier)
        : target.addPayout(payoutAmount);

      incoming.outgoing.push(payout.id);
    }

    incoming.status = IncomingPaymentStatus.Received;

    // publish zap receipt
    if (incoming.zapRequest && db.data.privateKey) {
      const parsed = JSON.parse(incoming.zapRequest) as Event;
      const [_, ...relays] = parsed.tags.find((t) => t[0] === "relays") ?? [];

      const zap = nip57.makeZapReceipt({
        zapRequest: incoming.zapRequest,
        bolt11: incoming.paymentRequest,
        paidAt: new Date(),
      });

      const signed = finishEvent(zap, db.data.privateKey);

      try {
        await connect(relays);
        await publish(relays, signed);
        this.log("Published zap receipt");
      } catch (e) {
        this.log("Failed to publish zap receipt");
      }
    }
  }

  private updatePendingStatuses() {
    for (const incoming of this.incomingPending) {
      if (incoming.status === IncomingPaymentStatus.Received) {
        let incomplete = false;

        for (const id of incoming.outgoing) {
          const payout = db.data.outgoing.find((out) => out.id === id);
          if (payout && payout.status !== OutgoingPaymentStatus.Complete) {
            incomplete = true;
            break;
          }
        }

        if (!incomplete) {
          incoming.status = IncomingPaymentStatus.Complete;
        }
      }
    }
  }

  async payNext() {
    for (const target of this.targets) {
      await target.payNext();
    }

    this.updatePendingStatuses();
  }

  // manually check if pending invoices are complete
  async manualCheck() {
    for (const incoming of this.incomingPending) {
      if (incoming.status !== IncomingPaymentStatus.Pending) continue;

      try {
        this.log(`Checking ${incoming.paymentHash}`);
        const status = await lightning.getInvoiceStatus(incoming.paymentHash);

        if (status === InvoiceStatus.PAID) {
          await this.handlePaid(incoming.id);
        } else if (status === InvoiceStatus.EXPIRED) {
          this.log(`Invoice ${incoming.paymentHash} expired`);
          incoming.status = IncomingPaymentStatus.Expired;
        }
      } catch (e) {
        this.log(`Failed to check invoice ${incoming.paymentHash}`);
        this.log(e);
      }
    }
  }

  getChartData() {
    const percentages = this.getSplitPercentages();
    return {
      address: this.address,
      npub: this.npub,
      pubkey: this.pubkey,
      targets: this.targets.map((t) => ({
        type: t.type,
        displayName: t.displayName,
        percent: percentages[t.id],
      })),
    };
  }

  getMermaidFlow() {
    const percentages = this.getSplitPercentages();
    const lines = ["flowchart TD"];
    let lastId = 0;

    const renderSplit = (split: Split, sId = "S" + lastId++) => {
      const pId = "P" + lastId++;
      lines.push(`${sId}("${split.address}") --> ${pId}{Prism}`);

      for (const target of split.targets) {
        const tId = "T" + lastId++;
        lines.push(`${pId} --> |${(percentages[target.id] * 100).toFixed(2)}%| ${tId}("${target.displayName}")`);

        // TODO: if target is a child split. call renderSplit again with tId
      }
    };

    renderSplit(this);

    return lines.join("\n");
  }

  toJSON(): SplitJson {
    return {
      id: this.id,
      name: this.name,
      domain: this.domain,
      apiKey: this.apiKey,
      privateKey: this.privateKey,
      targets: this.targets.map((t) => t.toJSON()),
      enableNostrZaps: this.enableNostrZaps,
      enableNostrProfile: this.enableNostrProfile,
    };
  }
  static async fromJSON(json: SplitJson) {
    const split = new Split(json.name, json.domain, json.privateKey);
    split.id = json.id;
    split.apiKey = json.apiKey ?? nanoid();
    split.targets = [];
    for (const targetJson of json.targets) {
      const Type = getTargetType(targetJson.type);

      const target = new Type(targetJson.id);
      await target.setInput(targetJson.input);
      target.weight = targetJson.weight ?? 10;
      target.fixed = targetJson.fixed ?? false;
      target.forwardComment = targetJson.forwardComment ?? true;
      target.payoutThreshold = targetJson.payoutThreshold ?? 90;

      split.targets.push(target);
      target.parentSplit = split;
    }
    split.enableNostrZaps = json.enableNostrZaps ?? false;
    split.enableNostrProfile = json.enableNostrProfile ?? false;
    return split;
  }
}
