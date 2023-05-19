import lnbits from "./lnbits/client.js";
import { adminKey } from "./env.js";
import { LNURLPayMetadata } from "./types.js";
import { db } from "./db.js";
import { milisats } from "./helpers.js";

function humanFriendlyId(size: number) {
  const parts = "abcdefghijklmnopqrstuvqwxyz0123456789";
  var id = "";
  while (id.length < size) {
    id += parts[Math.floor(Math.random() * parts.length)];
  }
  return id;
}

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

export async function payNextPayout() {
  const payout = db.data.pendingPayouts.find((p) => !p.failed);
  if (!payout) return;

  const idx = db.data.pendingPayouts.indexOf(payout);
  if (idx > -1) db.data.pendingPayouts.splice(idx, 1);

  console.log(
    `Paying ${payout.address} from split ${payout.split} ${payout.amount} sats`
  );

  try {
    await payAddress(
      payout.address,
      payout.amount,
      `${payout.split} ${payout.weight}`,
      payout.comment
    );
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

async function payAddress(
  address: string,
  amount: number,
  memo: string,
  comment?: string
) {
  const msatAmount = milisats(amount);

  let [name, domain] = address.split("@");
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

  if (metadata.commentAllowed && comment) {
    if (comment.length > metadata.commentAllowed)
      throw new Error("comment too long");
    callbackUrl.searchParams.append("comment", comment);
  }

  const {
    pr: payRequest,
    status,
    reason,
  } = await fetch(callbackUrl).then((res) => res.json());

  if (status === "ERROR") throw new Error(reason);

  const { error, data } = await lnbits.post("/api/v1/payments", {
    headers: {
      "X-Api-Key": adminKey,
    },
    params: {},
    body: {
      out: true,
      memo,
      bolt11: payRequest,
    },
  });

  if (error) throw new Error("failed to create invoice");

  const result = data as { payment_hash: string; checking_id: string };
  console.log(result.payment_hash);

  return data;
}
