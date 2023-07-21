import { nanoid } from "nanoid";
import { appDebug } from "../../debug.js";
import type { Split } from "../split.js";

export type TargetJSON = {
  id: string;
  type: string;
  input: string;
  weight: number;
  fixed: boolean;
  forwardComment: boolean;
  pending: OutgoingPayment[];
};

export type OutgoingPayment = {
  /** amount in msat */
  amount: number;
  /** lnurl comment or zapRequest.content */
  comment?: string;
  /** LN Address or pubkey */
  identifier?: string;
  /** failure message */
  failed?: string;
};

export default class Target {
  id: string;
  type = "null";
  input: string;

  weight: number;
  fixed = false;
  forwardComment = true;

  log = appDebug.extend("target");
  pending: OutgoingPayment[] = [];

  get displayName() {
    return "Target";
  }
  get link() {
    return "about:blank";
  }

  private _parentSplit: Split;
  get parentSplit() {
    return this._parentSplit;
  }
  set parentSplit(split: Split) {
    this._parentSplit = split;
    this.log = split.log.extend(this.displayName);
  }

  constructor(id = nanoid()) {
    this.id = id;
  }

  async setInput(input: string) {
    throw new Error("Not implemented");
  }
  async getMinSendable(): Promise<number> {
    throw new Error("Not implemented");
  }
  async getMaxSendable(): Promise<number> {
    throw new Error("Not implemented");
  }
  async getInvoice(
    amount: number,
    comment?: string,
    identifier?: string
  ): Promise<string> {
    throw new Error("Not implemented");
  }
  getAverageFee(): number | undefined {
    throw new Error("Not implemented");
  }
  addPayout(amount: number, comment?: string, identifier?: string) {
    this.pending.push({ amount, comment, identifier });
  }

  async payPending(pending: OutgoingPayment) {
    throw new Error("Not implemented");
  }
  async payNext() {
    const payout = this.pending.find((p) => !p.failed);
    if (!payout) return;

    // remove the payout from the array
    const idx = this.pending.indexOf(payout);
    if (idx > -1) this.pending.splice(idx, 1);

    try {
      await this.payPending(payout);
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
      this.pending.push(payout);
    }
  }

  toJSON(): TargetJSON {
    return {
      id: this.id,
      type: this.type,
      input: this.input,
      weight: this.weight,
      fixed: this.fixed,
      forwardComment: this.forwardComment,
      pending: this.pending,
    };
  }
}
