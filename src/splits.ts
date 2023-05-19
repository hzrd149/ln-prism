import lnbits from "./lnbits/client.js";
import { adminKey, lnbitsUrl } from "./env.js";
import { LNURLPayMetadata } from "./types.js";
import { db } from "./db.js";
import { milisats } from "./helpers.js";
import { nanoid } from "nanoid";

type LNURLpMetadata = {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
};

export type Split = {
  name: string;
  payouts: [string, number][];
  metadata: LNURLPayMetadata;
};
export type AddressPayout = {
  address: string;
  split: string;
  amount: number;
  weight: number;
  comment?: string;
  failed?: string;
};

export async function createSplit(name: string, payouts: [string, number][]) {
  const split: Split = {
    name,
    payouts,
    metadata: [["text/plain", `Split: ${name}`]],
  };

  db.data.splits[name] = split;

  return split;
}

export async function createPayouts(
  name: string,
  amount: number,
  comment?: string
) {
  const split = db.data.splits[name];
  if (!split) throw new Error(`no split: ${name}`);

  const totalWeight = split.payouts.reduce((v, [_a, w]) => v + w, 0);

  for (const [address, weight] of split.payouts) {
    const payoutAmount = Math.floor((weight / totalWeight) * amount);

    const payout: AddressPayout = {
      address,
      weight,
      amount: payoutAmount,
      split: name,
      comment,
    };

    db.data.pendingPayouts.push(payout);
  }
}

const webhooks = new Map<
  string,
  { payout: AddressPayout; paymentHash: string }
>();

export async function payNextPayout() {
  const payout = db.data.pendingPayouts.find((p) => !p.failed);
  if (!payout) return;

  const idx = db.data.pendingPayouts.indexOf(payout);
  if (idx > -1) db.data.pendingPayouts.splice(idx, 1);

  console.log(
    `Paying ${payout.address} from split ${payout.split} ${payout.amount} sats`
  );

  try {
    const msatAmount = milisats(payout.amount);

    let [name, domain] = payout.address.split("@");
    const lnurl = `https://${domain}/.well-known/lnurlp/${name}`;

    const metadata = (await fetch(lnurl).then((res) =>
      res.json()
    )) as LNURLpMetadata;

    if (metadata.minSendable && msatAmount < metadata.minSendable)
      throw new Error("Cant send payment: amount lower than minSendable");
    if (metadata.maxSendable && msatAmount > metadata.maxSendable)
      throw new Error("Cant send payment: amount greater than maxSendable");

    const callbackUrl = new URL(metadata.callback);
    callbackUrl.searchParams.append("amount", String(msatAmount));

    if (metadata.commentAllowed && payout.comment) {
      if (payout.comment.length > metadata.commentAllowed)
        throw new Error("comment too long");
      callbackUrl.searchParams.append("comment", payout.comment);
    }

    const {
      pr: payRequest,
      status,
      reason,
    } = await fetch(callbackUrl).then((res) => res.json());

    if (status === "ERROR") throw new Error(reason);

    const invoiceId = nanoid();
    const { error, data } = await lnbits.post("/api/v1/payments", {
      headers: {
        "X-Api-Key": adminKey,
      },
      params: {},
      body: {
        out: true,
        memo: `${payout.split} ${payout.weight}`,
        bolt11: payRequest,
        // webhook: new URL(`/webhook/out/${invoiceId}`, webhookUrl).toString(),
      },
    });

    if (error) throw new Error("Failed to create invoice");
    const result = data as { payment_hash: string; checking_id: string };

    webhooks.set(invoiceId, {
      payout,
      paymentHash: result.payment_hash,
    });

    await handleWebhook(invoiceId);

    return result.payment_hash;
  } catch (e) {
    if (e instanceof Error) {
      console.log("Failed:", e.message);
      payout.failed = e.message;
    } else {
      console.log(e);
      payout.failed = "unknown";
    }

    db.data.pendingPayouts.push(payout);
  }
}

type PaymentDetails = {
  paid: boolean;
  preimage: string;
  details: {
    checking_id: string;
    pending: boolean;
    amount: number;
    fee: number;
    payment_hash: string;
    wallet_id: string;
  };
};

export async function handleWebhook(id: string) {
  const webhook = webhooks.get(id);
  if (!webhook) return;

  const { paymentHash, payout } = webhook;

  console.log(`Checking fees for ${paymentHash}`);

  const url = new URL(`/api/v1/payments/${paymentHash}`, lnbitsUrl);
  const details = (await fetch(url, {
    headers: { "X-Api-Key": adminKey },
  }).then((res) => res.json())) as PaymentDetails;

  db.data.addressFees[payout.address] =
    db.data.addressFees[payout.address] || [];

  db.data.addressFees[payout.address].push(details.details.fee);

  console.log("Fee: " + details.details.fee);

  webhooks.delete(id);
}
