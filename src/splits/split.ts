import {
  Event,
  Kind,
  finishEvent,
  generatePrivateKey,
  getPublicKey,
  nip19,
  nip57,
} from "nostr-tools";
import { nanoid } from "nanoid";
import { Debugger } from "debug";
import dayjs from "dayjs";

import { satsToMsats, msatsToSats, roundToSats } from "../helpers/sats.js";
import { ConflictError } from "../helpers/errors.js";
import { connect, publish } from "../relays.js";
import { NOSTR_RELAYS } from "../env.js";
import { lightning } from "../backend/index.js";
import Target, { TargetJSON } from "./targets/target.js";
import { appDebug } from "../debug.js";
import { getTargetType } from "./targets/index.js";
import { InvoiceStatus } from "../backend/type.js";

type IncomingPayment = {
  /** uuid */
  id: string;
  /** bolt11 payment hash */
  paymentHash: string;
  /** bolt11 */
  paymentRequest: string;
  /** amount in msat */
  amount: number;
  /** lnurl comment or zapRequest.content */
  comment?: string;
  /** LN Address or pubkey */
  identifier?: string;
  /** the zap request event for the zap receipt */
  zapRequest?: string;
};

type SplitJson = {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  targets: TargetJSON[];
  pending: IncomingPayment[];
  enableNostr: boolean;
  privateKey: string;
};

export class Split {
  privateKey: string;
  enableNostr: boolean = true;
  id: string;
  name: string;
  domain: string;
  targets: Target[] = [];
  log: Debugger;

  pending: IncomingPayment[] = [];

  apiKey = nanoid();

  constructor(name: string, domain: string, privateKey?: string) {
    this.id = nanoid();
    this.privateKey = privateKey || generatePrivateKey();
    this.domain = domain;
    this.name = name;

    this.log = appDebug.extend(this.address);
  }

  get address() {
    return this.name + "@" + this.domain;
  }
  get totalWeight() {
    return this.targets.reduce((v, t) => v + t.weight, 0);
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
  get targetFees() {
    const fees: Record<string, { estimate: number; average?: number }> = {};
    for (const target of this.targets) {
      const avg = target.getAverageFee();
      fees[target.id] = {
        estimate: avg ?? 1000,
        average: avg,
      };
    }

    return fees;
  }
  get estimatedFee() {
    return msatsToSats(
      this.targets.reduce(
        (fee, target) => fee + (target.getAverageFee() ?? 1000),
        0
      )
    );
  }

  async updateNostrProfile() {
    if (!this.enableNostr) return;

    const targets = this.targets
      .map((target) => {
        const percent = ((target.weight / this.totalWeight) * 100).toFixed(2);
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
    const totalWeight = this.totalWeight;

    let estFees = 0;
    let maxMinSendable = 0;
    for (const target of this.targets) {
      const min = await target.getMinSendable();

      estFees += target.getAverageFee() ?? 1000;

      maxMinSendable = Math.max(
        maxMinSendable,
        min * (totalWeight / target.weight)
      );
    }

    return maxMinSendable + estFees;
  }
  async getMaxSendable() {
    return satsToMsats(500000); // 500,000 sats
  }

  getTarget(id: string): Target | undefined {
    return this.targets.find((target) => target.id == id);
  }
  getTargetByInput(input: string): Target | undefined {
    return this.targets.find((t) => t.input === input);
  }

  async addTarget(target: Target) {
    if (this.getTargetByInput(target.input))
      throw new ConflictError(`A target with ${target.input} already exists`);

    this.targets.push(target);
    target.parentSplit = this;

    await this.updateNostrProfile();
  }
  async removeTarget(id: string) {
    this.targets = this.targets.filter((target) => target.id !== id);

    await this.updateNostrProfile();
  }
  // async replaceTargets(targets: { input: string; weight: number }[]) {
  //   this.targets = [];
  //   for (const { input, weight } of targets) {
  //     this.targets.push(await Target.fromInput(input, weight));
  //   }

  //   await this.updateNostrProfile();
  // }
  async updateTarget(
    id: string,
    input: string,
    { weight, forwardComment }: { weight?: number; forwardComment?: boolean }
  ) {
    const target = this.getTarget(id);
    if (!target) throw new Error(`No target with id, ${id}`);

    await target.setInput(input);
    if (weight) target.weight = weight;
    if (forwardComment !== undefined) target.forwardComment = forwardComment;

    await this.updateNostrProfile();
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

    this.pending.push({
      id,
      amount,
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      comment,
      identifier,
      zapRequest,
    });

    return invoice;
  }

  async handlePaid(id: string) {
    const incoming = this.pending.find((o) => o.id === id);

    // remove it from the array
    this.pending = this.pending.filter((p) => p.id !== id);

    const totalWeight = this.totalWeight;
    this.log(`Received ${msatsToSats(incoming.amount)} sats`);

    for (const target of this.targets) {
      const payoutAmount = Math.round(
        (target.weight / totalWeight) * incoming.amount
      );

      if (target.forwardComment) {
        target.addPayout(payoutAmount, incoming.comment, incoming.identifier);
      } else {
        target.addPayout(payoutAmount, this.address);
      }
    }

    // publish zap receipt
    if (incoming.zapRequest && this.privateKey) {
      const parsed = JSON.parse(incoming.zapRequest) as Event;
      const [_, ...relays] = parsed.tags.find((t) => t[0] === "relays") ?? [];

      const zap = nip57.makeZapReceipt({
        zapRequest: incoming.zapRequest,
        bolt11: incoming.paymentRequest,
        paidAt: new Date(),
      });

      const signed = finishEvent(zap, this.privateKey);

      try {
        await connect(relays);
        await publish(relays, signed);
        this.log("Published zap receipt");
      } catch (e) {
        this.log("Failed to publish zap receipt");
      }
    }
  }

  async payNext() {
    for (const target of this.targets) {
      await target.payNext();
    }
  }

  // manually check if pending invoices are complete
  async manualCheck() {
    for (const { paymentHash, id } of this.pending) {
      try {
        this.log(`Checking ${paymentHash}`);
        const status = await lightning.getInvoiceStatus(paymentHash);

        if (status === InvoiceStatus.PAID) {
          await this.handlePaid(id);
        } else if (status === InvoiceStatus.EXPIRED) {
          // remove the invoice from the pending array
          this.log(`Invoice ${paymentHash} expired`);
          this.pending = this.pending.filter((i) => i.id !== id);
        }
      } catch (e) {
        this.log(`Failed to check invoice ${paymentHash}`);
        this.log(e);
      }
    }
  }

  toJSON(): SplitJson {
    return {
      id: this.id,
      name: this.name,
      domain: this.domain,
      apiKey: this.apiKey,
      privateKey: this.privateKey,
      targets: this.targets.map((t) => t.toJSON()),
      pending: this.pending,
      enableNostr: this.enableNostr,
    };
  }
  static async fromJSON(json: SplitJson) {
    const split = new Split(json.name, json.domain, json.privateKey);
    split.id = json.id;
    split.apiKey = json.apiKey;
    split.targets = [];
    for (const targetJson of json.targets) {
      const Type = getTargetType(targetJson.type);

      const target = new Type(targetJson.id);
      await target.setInput(targetJson.input);
      target.weight = targetJson.weight;
      target.fixed = targetJson.fixed;
      target.forwardComment = targetJson.forwardComment;
      target.pending = targetJson.pending;

      split.targets.push(target);
      target.parentSplit = split;
    }
    split.pending = json.pending;
    split.enableNostr = json.enableNostr;
    return split;
  }
}
