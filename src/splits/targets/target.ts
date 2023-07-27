import { nanoid } from "nanoid";
import { appDebug } from "../../debug.js";
import type { Split } from "../split.js";
import { satsToMsats } from "../../helpers/sats.js";
import dayjs from "dayjs";
import { db } from "../../db.js";

export class RetryOnNextError extends Error {
  retryOnNextPayment = true;
  constructor(msg) {
    super(msg);
  }
}

export type TargetJSON = {
  id: string;
  type: string;
  input: string;
  weight: number;
  fixed: boolean;
  forwardComment: boolean;
  payoutThreshold: number;
};

export enum OutgoingPaymentStatus {
  Pending = "pending",
  Paying = "paying",
  Failed = "failed",
  Complete = "complete",
}

export type OutgoingPayment = {
  id: string;
  /** the target this was created for */
  target: string;
  /** current status */
  status: OutgoingPaymentStatus;
  /** amount in msats */
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
  payoutThreshold = 90;

  log = appDebug.extend("target");

  private retryOnNextPayout = false;
  private retries = 0;
  private retryTimestamp = dayjs().unix();

  constructor(id = nanoid()) {
    this.id = id;
  }

  // Override methods
  get displayName() {
    return "Target";
  }
  get link() {
    return "about:blank";
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
  async getInvoice(amount: number, comment?: string, identifier?: string): Promise<string> {
    throw new Error("Not implemented");
  }
  getEstimatedFee(): number {
    throw new Error("Not implemented");
  }
  async payPending(pending: OutgoingPayment) {
    throw new Error("Not implemented");
  }

  get outgoing() {
    return db.data.outgoing.filter((out) => out.target === this.id);
  }
  get outgoingPending() {
    return db.data.outgoing.filter(
      (out) =>
        out.target === this.id &&
        (out.status === OutgoingPaymentStatus.Pending ||
          out.status === OutgoingPaymentStatus.Paying ||
          out.status === OutgoingPaymentStatus.Failed)
    );
  }
  get outgoingComplete() {
    return db.data.outgoing.filter((out) => out.target === this.id && out.status === OutgoingPaymentStatus.Complete);
  }

  private _parentSplit: Split;
  get parentSplit() {
    return this._parentSplit;
  }
  set parentSplit(split: Split) {
    this._parentSplit = split;
    this.log = split.log.extend(this.displayName);
  }

  getPayout(id: string): OutgoingPayment | undefined {
    return db.data.outgoing.find((out) => out.id === id && out.target === this.id);
  }
  addPayout(amount: number, comment?: string, identifier?: string) {
    const payout: OutgoingPayment = {
      id: nanoid(),
      target: this.id,
      status: OutgoingPaymentStatus.Pending,
      amount,
      comment,
      identifier,
    };
    db.data.outgoing.push(payout);

    if (this.retryOnNextPayout) {
      this.retryTimestamp = dayjs().unix();
    }

    return payout;
  }

  async payNext() {
    const payouts = this.outgoing;
    if (payouts.length === 0) return;
    if (this.retryTimestamp > dayjs().unix()) return;

    const MAX_COMMENT_LENGTH = 250;
    const MAX_SENDABLE = satsToMsats(10000);

    let batchedAmount = 0;
    let batchedComment = "";

    const batched: OutgoingPayment[] = [];
    while (true) {
      const payout = payouts.shift();
      if (!payout) break;

      // skip this payout if its complete or being paid
      if (payout.status === OutgoingPaymentStatus.Complete || payout.status === OutgoingPaymentStatus.Paying) continue;

      // stop baching if this amount puts the total over max
      if (batchedAmount + payout.amount > MAX_SENDABLE) break;

      if (this.forwardComment && payout.comment) {
        let comment = payout.comment;
        if (payout.identifier) {
          comment = `${payout.identifier}: ${payout.comment}`;
        }

        // stop batching if the comment gets too long
        if (batchedComment.length + comment.length > MAX_COMMENT_LENGTH) break;

        if (!batchedComment) batchedComment = comment;
        else batchedComment += comment;
      }

      batchedAmount += payout.amount;

      payout.status = OutgoingPaymentStatus.Paying;
      batched.push(payout);
    }

    if (batched.length === 0) return;

    try {
      const payout = {
        id: nanoid(),
        target: this.id,
        status: OutgoingPaymentStatus.Pending,
        amount: batchedAmount,
        comment: batchedComment,
      };

      const fee = this.getEstimatedFee();
      if ((1 - fee / payout.amount) * 100 < this.payoutThreshold)
        throw new RetryOnNextError("Fee to amount radio below threshold");

      await this.payPending(payout);

      for (const payout of batched) {
        payout.status = OutgoingPaymentStatus.Complete;
        delete payout.failed;
      }
    } catch (e) {
      this.log("Failed to batch:", e.message);

      for (const payout of batched) {
        payout.status = OutgoingPaymentStatus.Failed;
        payout.failed = e.message;
      }

      this.retries = (this.retries || 0) + 1;
      if (e instanceof RetryOnNextError) {
        this.retryOnNextPayout = true;
        this.retryTimestamp = dayjs().add(1, "year").unix();
      } else {
        this.retryTimestamp = dayjs().add(this.retries, "minutes").unix();
      }
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
      payoutThreshold: this.payoutThreshold,
    };
  }
}
