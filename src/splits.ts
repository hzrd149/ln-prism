import lnbits from "./lnbits/client.js";
import { adminKey } from "./env.js";
import { LNURLPayMetadata } from "./types.js";

function humanFriendlyId(size: number) {
  const parts = "abcdefghijklmnopqrstuvqwxyz0123456789";
  var id = "";
  while (id.length < size) {
    id += parts[Math.floor(Math.random() * parts.length)];
  }
  return id;
}

export type Split = {
  id: string;
  title: string;
  amount: number;
  payouts: [string, number][];
  metadata: LNURLPayMetadata;
};
const splits = new Map<string, Split>();

export async function createSplit(
  title: string,
  amount: number,
  payouts: [string, number][]
) {
  const id = humanFriendlyId(6);
  const split: Split = {
    id,
    title,
    amount,
    payouts,
    metadata: [["text/plain", `Split: ${id}`]],
  };

  splits.set(split.id, split);

  return split;
}

export async function payoutSplit(id: string, amount: number) {
  const split = await getSplit(id);
  if (!id) throw new Error(`no split with id ${id}`);

  console.log(`Start payout ${id}`);

  for (const [address, percent] of split.payouts) {
    const payoutAmount = Math.floor(amount * (percent / 100));
    console.log(`Paying ${address} ${percent}% (${payoutAmount} sats)`);

    let [name, domain] = address.split("@");
    const lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
    const metadata = await fetch(lnurl).then((res) => res.json());
    const callbackUrl = new URL(metadata.callback);
    callbackUrl.searchParams.append("amount", String(payoutAmount * 1000));
    const { pr: payRequest } = await fetch(callbackUrl).then((res) =>
      res.json()
    );
    console.log("invoice", payRequest);
    const { error, data } = await lnbits.post("/api/v1/payments", {
      headers: {
        "X-Api-Key": adminKey,
      },
      params: {},
      body: {
        out: true,
        memo: `Split: ${id}, Paying ${address} ${percent}%`,
        bolt11: payRequest,
      },
    });
    if (error) {
      console.log(`Failed to pay ${address}`);
      console.log(error);
    } else console.log("Paid", data);
  }

  console.log(`Finished payout ${id}`);
}

export async function deleteSplit(id: string) {
  splits.delete(id);
}
export async function listSplits() {
  return Array.from(splits.values());
}
export async function getSplit(id: string) {
  return splits.get(id);
}
