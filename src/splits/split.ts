import {
  Kind,
  finishEvent,
  generatePrivateKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { nanoid } from "nanoid";
import debug, { Debugger } from "debug";
import { satsToMsats, roundToSats, msatsToSats } from "../helpers/sats.js";
import { getAddressMetadata } from "../helpers/lightning-address.js";
import { nowUnix } from "../helpers/nostr.js";
import { BadRequestError, ConflictError } from "../helpers/errors.js";
import { averageFee, estimatedFee, recordFee } from "../fees.js";
import { getInvoiceFromLNAddress } from "../helpers/lnurl.js";
import { connect, relayPool } from "../relay-pool.js";
import { NOSTR_RELAYS } from "../env.js";
import { lightning } from "../backend/index.js";

type SplitTarget = {
  id: string;
  address: string;
  weight: number;
};
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
  amount: number;
  weight: number;
  lnurlComment?: string;
  failed?: string;
};

export type SplitJson = {
  privateKey: string;
  id: string;
  name: string;
  domain: string;
  targets: SplitTarget[];
  invoices: PendingInvoice[];
  payouts: PendingPayout[];
};

export class Split {
  privateKey: string;
  id: string;
  name: string;
  domain: string;
  targets: SplitTarget[] = [];
  invoices: PendingInvoice[] = [];
  payouts: PendingPayout[] = [];
  log: Debugger;

  constructor(name: string, domain: string, privateKey?: string) {
    this.id = nanoid();
    this.privateKey = privateKey || generatePrivateKey();
    this.domain = domain;
    this.name = name;

    this.log = debug("prism:" + this.address);
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
  get npub() {
    return nip19.npubEncode(getPublicKey(this.privateKey));
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
    const targets = this.targets
      .map(
        (t) =>
          `${t.address}: ${((t.weight / this.totalWeight) * 100).toFixed(2)}%`
      )
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
        created_at: nowUnix(),
        tags: [],
      },
      this.privateKey
    );

    await connect(NOSTR_RELAYS);
    const pub = relayPool.publish(NOSTR_RELAYS, kind0);

    this.log(`Updated nostr profile`);
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

  getTarget(id: string): SplitTarget | undefined {
    return this.targets.find((target) => target.id == id);
  }
  hasTarget(address: string) {
    return this.targets.some((t) => t.address === address);
  }
  async addTarget(address: string, weight: number) {
    if (this.targets.find((p) => p.address === address))
      throw new ConflictError("That address already exists");

    // test address
    if (!(await getAddressMetadata(address)))
      throw new BadRequestError(`Unreachable address ${address}`);

    this.targets.push({ id: nanoid(), address, weight });

    await this.updateNostrProfile();
  }
  async removeTarget(id: string) {
    this.targets = this.targets.filter((target) => target.id !== id);

    await this.updateNostrProfile();
  }
  async replaceTargets(targets: { address: string; weight: number }[]) {
    const dedupe: Record<string, number> = {};
    for (const { address, weight } of targets) {
      dedupe[address] = weight;
    }

    this.targets = [];
    for (const [address, weight] of Object.entries(dedupe)) {
      if (!(await getAddressMetadata(address)))
        throw new BadRequestError(`Unreachable address ${address}`);
      this.targets.push({ id: nanoid(), address, weight });
    }

    await this.updateNostrProfile();
  }
  async updateTarget(
    id: string,
    fields: { address?: string; weight?: number }
  ) {
    const target = this.getTarget(id);

    if (!target) throw new Error(`no target with id, ${id}`);

    Object.assign(target, fields);
    await this.updateNostrProfile();
  }

  async createInvoice(
    amount: number,
    description?: string,
    lnurlComment?: string
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
    });

    return invoice;
  }

  async handleInvoicePaid(id: string) {
    const invoice = this.invoices.find((p) => p.id === id);
    this.invoices = this.invoices.filter((p) => p.id !== id);

    const totalWeight = this.totalWeight;
    this.log(`Received ${msatsToSats(invoice.amount)} sats`);

    for (const { address, weight } of this.targets) {
      const payoutAmount = Math.round((weight / totalWeight) * invoice.amount);

      const payout: PendingPayout = {
        address,
        weight,
        amount: payoutAmount,
        lnurlComment: invoice.lnurlComment,
      };

      this.payouts.push(payout);
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
      const payRequest = await getInvoiceFromLNAddress(
        payout.address,
        amount,
        payout.lnurlComment
      );

      const { paymentHash, fee } = await lightning.payInvoice(payRequest);

      this.log(
        `Paid ${payout.address} ${msatsToSats(amount)} sats ( fee: ${
          fee / 1000
        }, est fee: ${estFee / 1000} )`
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
      this.log(`Checking ${paymentHash}`);
      const complete = await lightning.checkInvoiceComplete(paymentHash);

      if (complete) {
        await this.handleInvoicePaid(id);
      }
    }
  }
}
