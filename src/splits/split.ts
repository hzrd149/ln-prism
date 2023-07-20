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

import { satsToMsats, roundToSats, msatsToSats } from "../helpers/sats.js";
import { getAddressMetadata } from "../helpers/lightning-address.js";
import { ConflictError } from "../helpers/errors.js";
import { averageFee, estimatedFee, recordFee } from "../fees.js";
import { getInvoiceFromLNAddress } from "../helpers/lnurl.js";
import { connect, publish } from "../relays.js";
import { NOSTR_RELAYS } from "../env.js";
import { lightning } from "../backend/index.js";
import Target from "./target.js";
import { appDebug } from "../debug.js";

type PendingInvoice = {
  id: string;
  paymentHash: string;
  paymentRequest: string;
  amount: number;
  zapRequest?: string;
  lnurlComment?: string;
};
type PendingPayout = {
  address: string;
  pubkey?: string;
  amount: number;
  weight: number;
  lnurlComment?: string;
  failed?: string;
  zapRequest?: string;
};

type SplitJson = {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  targets: ReturnType<Target["toJSON"]>[];
  invoices: PendingInvoice[];
  payouts: PendingPayout[];
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
  invoices: PendingInvoice[] = [];
  payouts: PendingPayout[] = [];
  log: Debugger;

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
      fees[target.id] = {
        estimate: estimatedFee(target.address),
        average: averageFee(target.address),
      };
    }

    return fees;
  }

  async updateNostrProfile() {
    if (!this.enableNostr) return;

    const targets = this.targets
      .map((t) => {
        const target = t.pubkey
          ? `nostr:${nip19.npubEncode(t.pubkey)}`
          : t.address;
        const percent = ((t.weight / this.totalWeight) * 100).toFixed(2);
        return `${target} ${percent}%`;
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
    for (const { address, weight } of this.targets) {
      const metadata = await getAddressMetadata(address);

      const fee = estimatedFee(address);
      estFees += fee;

      if (metadata.minSendable) {
        maxMinSendable = Math.max(
          maxMinSendable,
          metadata.minSendable * (totalWeight / weight)
        );
      }
    }

    return maxMinSendable + estFees;
  }
  async getMaxSendable() {
    return satsToMsats(100000); // 100,000 sats
  }

  getTarget(id: string): Target | undefined {
    return this.targets.find((target) => target.id == id);
  }
  getTargetByInput(input: string): Target | undefined {
    return this.targets.find((t) => t.input === input);
  }

  async addTarget(input: string, weight: number) {
    if (this.getTargetByInput(input))
      throw new ConflictError(`A target with ${input} already exists`);

    this.targets.push(await Target.fromInput(input, weight));

    await this.updateNostrProfile();
  }
  async removeTarget(id: string) {
    this.targets = this.targets.filter((target) => target.id !== id);

    await this.updateNostrProfile();
  }
  async replaceTargets(targets: { input: string; weight: number }[]) {
    this.targets = [];
    for (const { input, weight } of targets) {
      this.targets.push(await Target.fromInput(input, weight));
    }

    await this.updateNostrProfile();
  }
  async updateTarget(id: string, input: string, weight?: number) {
    const target = this.getTarget(id);
    if (!target) throw new Error(`No target with id, ${id}`);

    await target.update(input, weight);

    await this.updateNostrProfile();
  }

  async createInvoice(
    amount: number,
    description?: string,
    lnurlComment?: string,
    zapRequest?: string
  ) {
    const id = nanoid();
    const invoice = await lightning.createInvoice(
      amount,
      description,
      `https://${this.domain}/webhook/${this.id}/${id}`
    );

    if (!invoice.paymentHash) throw new Error("missing paymentHash");

    this.invoices.push({
      id,
      amount,
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      lnurlComment,
      zapRequest,
    });

    return invoice;
  }

  async handleInvoicePaid(id: string) {
    const invoice = this.invoices.find((p) => p.id === id);
    this.invoices = this.invoices.filter((p) => p.id !== id);

    const totalWeight = this.totalWeight;
    this.log(`Received ${msatsToSats(invoice.amount)} sats`);

    const newPayouts: PendingPayout[] = [];
    for (const { address, weight, pubkey } of this.targets) {
      const payoutAmount = Math.round((weight / totalWeight) * invoice.amount);

      const payout: PendingPayout = {
        address,
        weight,
        amount: payoutAmount,
        lnurlComment: invoice.lnurlComment,
        zapRequest: invoice.zapRequest,
        pubkey,
      };

      newPayouts.push(payout);
    }

    // add payouts to list after all have been created
    for (const payout of newPayouts) {
      this.payouts.push(payout);
    }

    // publish zap receipt
    if (invoice.zapRequest && this.privateKey) {
      const parsed = JSON.parse(invoice.zapRequest) as Event;
      const [_, ...relays] = parsed.tags.find((t) => t[0] === "relays") ?? [];

      const zap = nip57.makeZapReceipt({
        zapRequest: invoice.zapRequest,
        bolt11: invoice.paymentRequest,
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
    const payout = this.payouts.find((p) => !p.failed);
    if (!payout) return;

    // remove the payout from the array
    const idx = this.payouts.indexOf(payout);
    if (idx > -1) this.payouts.splice(idx, 1);

    // payout amount - estimated fees and round to the nearest sat (since most LN nodes don't support msats)
    const estFee = estimatedFee(payout.address);
    const amount = roundToSats(payout.amount - estFee);

    try {
      let zapRequest: Event;

      // create zap requests for each payout pubkey
      if (this.enableNostr && payout.zapRequest && payout.pubkey) {
        const parsed = JSON.parse(payout.zapRequest) as Event;
        const relays = parsed.tags.find((t) => t[0] === "relays").slice(1);

        const event = nip57.makeZapRequest({
          profile: payout.pubkey,
          event: null,
          amount,
          comment: `Zap from nostr:${nip19.npubEncode(parsed.pubkey)} ${
            parsed.content
          }`.trim(),
          relays,
        });

        zapRequest = finishEvent(event, this.privateKey);
      }

      const payRequest = await getInvoiceFromLNAddress(
        payout.address,
        amount,
        payout.lnurlComment,
        zapRequest && JSON.stringify(zapRequest)
      );

      const { paymentHash, fee } = await lightning.payInvoice(payRequest);

      this.log(
        `${zapRequest ? "Zapped" : "Paid"} ${payout.address} ${msatsToSats(
          amount
        )} sats ( fee: ${fee / 1000}, est fee: ${estFee / 1000} )`
      );

      recordFee(payout.address, fee);

      return paymentHash;
    } catch (e) {
      // log error
      if (e instanceof Error) {
        this.log("Failed:" + e.message);
        payout.failed = e.message;
      } else {
        this.log(e);
        payout.failed = "unknown";
      }

      // add the payout back into the array
      this.payouts.push(payout);
    }
  }

  // manually check if pending invoices are complete
  async manualCheck() {
    for (const { paymentHash, id } of this.invoices) {
      try {
        this.log(`Checking ${paymentHash}`);
        const complete = await lightning.checkInvoiceComplete(paymentHash);

        if (complete) {
          await this.handleInvoicePaid(id);
        }
      } catch (e) {
        this.log(`Failed to check invoice ${id}`);
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
      invoices: this.invoices,
      payouts: this.payouts,
      enableNostr: this.enableNostr,
    };
  }
  static fromJSON(json: SplitJson) {
    const split = new Split(json.name, json.domain, json.privateKey);
    split.id = json.id;
    split.apiKey = json.apiKey;
    split.targets = json.targets.map((tJson) => Target.fromJSON(tJson));
    split.invoices = json.invoices;
    split.payouts = json.payouts;
    split.enableNostr = json.enableNostr;
    return split;
  }
}
