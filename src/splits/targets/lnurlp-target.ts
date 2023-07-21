import { lightning } from "../../backend/index.js";
import { averageFee, recordFee } from "../../fees.js";
import { BadRequestError } from "../../helpers/errors.js";
import {
  getInvoiceFromLNURL,
  getLNURLPMetadata,
  lnAddressToLNURLP,
} from "../../helpers/lnurl.js";
import { msatsToSats, roundToSats, satsToMsats } from "../../helpers/sats.js";
import Target, { OutgoingPayment } from "./target.js";

export default class LNURLPTarget extends Target {
  type = "lnurlp";

  get displayName() {
    return this.address || this.lnurlp;
  }
  get link() {
    return `lightning:${this.address || this.lnurlp}`;
  }
  get lnurlp() {
    if (this.input.startsWith("lnurlp://")) {
      return this.input;
    } else {
      return lnAddressToLNURLP(this.input);
    }
  }
  get address() {
    return this.input.includes("@") ? this.input : null;
  }

  async setInput(input: string) {
    let metadata;

    if (input.split("@").length === 2) {
      metadata = await getLNURLPMetadata(lnAddressToLNURLP(input));
    } else {
      metadata = await getLNURLPMetadata(input);
    }

    if (!metadata) throw new BadRequestError(`Unreachable LNURLP ${input}`);
    this.input = input;
  }

  async getMinSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata?.minSendable ?? 0;
  }
  async getMaxSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata.maxSendable ?? satsToMsats(500000); // 500,000 sats
  }
  getAverageFee() {
    return averageFee(this.lnurlp);
  }
  async getInvoice(amount: number, comment?: string, identifier?: string) {
    // TODO: send identifier along to lnurlp endpoint
    return await getInvoiceFromLNURL(this.lnurlp, amount, { comment });
  }

  static isLNURLPTarget(target: Target): target is LNURLPTarget {
    return target.type === "lnurlp";
  }

  async payPending(payout: OutgoingPayment) {
    // payout amount - estimated fees and round to the nearest sat (since most LN nodes don't support msats)
    const estFee = this.getAverageFee() ?? 1000;
    const amount = roundToSats(payout.amount - estFee);

    const payRequest = await this.getInvoice(
      amount,
      payout.comment,
      payout.identifier
    );
    const { fee } = await lightning.payInvoice(payRequest);

    this.log(
      `Paid ${this.address || this.lnurlp} ${msatsToSats(amount)} sats ( fee: ${
        fee / 1000
      }, est fee: ${estFee / 1000} )`
    );

    recordFee(this.lnurlp, fee);
  }
}
