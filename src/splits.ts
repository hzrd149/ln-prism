import lnbits from "./lnbits/client.js";
import { ADMIN_KEY, LNBITS_URL } from "./env.js";
import { AddressPayout, Split, SplitTarget, db } from "./db.js";
import { satsToMsats, roundToSats, msatsToSats } from "./helpers.js";
import { nanoid } from "nanoid";
import { estimatedFee, getAddressMetadata } from "./helpers/ln-address.js";
import { LNURLPayMetadata } from "./types.js";

type LNURLpayRequest = {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
};

export async function createSplit(name: string) {
  const split: Split = {
    name,
    payouts: [],
  };

  db.data.splits[name] = split;

  return split;
}

export async function getMinSendable(split: Split) {
  let minSendable = 0;
  for (const { address } of split.payouts) {
    const metadata = await getAddressMetadata(address);

    minSendable += estimatedFee(address);
    if (metadata.minSendable) {
      minSendable += metadata.minSendable;
    }
  }

  return minSendable;
}
export function getMaxSendable(split: Split) {
  return satsToMsats(100000); // 100,000 sats
}

export async function createSplitTarget(
  address: string,
  weight: number
): Promise<SplitTarget> {
  return {
    address,
    weight,
  };
}

export function buildLNURLpMetadata(
  split: Split,
  hostname: string
): LNURLPayMetadata {
  return [["text/plain", split.name + "@" + hostname]];
}

export async function createPayouts(
  split: Split,
  amount: number,
  comment?: string
) {
  const totalWeight = split.payouts.reduce(
    (total, { weight }) => total + weight,
    0
  );

  for (const { address, weight } of split.payouts) {
    const payoutAmount = Math.round((weight / totalWeight) * amount);

    const payout: AddressPayout = {
      address,
      weight,
      amount: payoutAmount,
      split: split.name,
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

  // payout amount - estimated fees and round to the nearest sat (since most LN nodes dont support msats)
  const estFee = estimatedFee(payout.address);
  const amount = roundToSats(payout.amount - estFee);

  console.log(
    `Paying ${payout.address} ${msatsToSats(amount)} sats from split "${
      payout.split
    }" with estimated fee of ${estFee / 1000} sats`
  );

  try {
    let [name, domain] = payout.address.split("@");
    const lnurl = `https://${domain}/.well-known/lnurlp/${name}`;

    const metadata = (await fetch(lnurl).then((res) =>
      res.json()
    )) as LNURLpayRequest;

    if (metadata.minSendable && amount < metadata.minSendable)
      throw new Error("Cant send payment: amount lower than minSendable");
    if (metadata.maxSendable && amount > metadata.maxSendable)
      throw new Error("Cant send payment: amount greater than maxSendable");

    const callbackUrl = new URL(metadata.callback);
    callbackUrl.searchParams.append("amount", String(amount));

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
        "X-Api-Key": ADMIN_KEY,
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

  const url = new URL(`/api/v1/payments/${paymentHash}`, LNBITS_URL);
  const details = (await fetch(url, {
    headers: { "X-Api-Key": ADMIN_KEY },
  }).then((res) => res.json())) as PaymentDetails;

  db.data.addressFees[payout.address] =
    db.data.addressFees[payout.address] || [];

  db.data.addressFees[payout.address].push(details.details.fee);

  webhooks.delete(id);
}
