import { nanoid } from "nanoid";
import { adminKey, publicUrl } from "../env.js";
import lnbits from "../lnbits/client.js";
import { router } from "./router.js";
import { createHash } from "node:crypto";
import { Split, payoutSplit } from "../splits.js";
import { milisats } from "../helpers.js";
import { loadSplit } from "../db.js";

const webhooks = new Map<string, { split: string; amount: number }>();

export async function createInvoiceForSplit(split: Split, amount: number) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(split.metadata));

  const webhookId = nanoid();
  webhooks.set(webhookId, { split: split.name, amount });

  const { data, error } = await lnbits.post("/api/v1/payments", {
    headers: { "X-Api-Key": adminKey },
    params: {},
    body: {
      out: false,
      amount,
      memo: split.name,
      internal: false,
      description_hash: hash.digest("hex"),
      webhook: new URL(`/invoice/paid/${webhookId}`, publicUrl).toString(),
    },
  });
  if (error) {
    throw new Error("failed to create invoice: " + error.detail);
  }

  return data as {
    payment_request: string;
    payment_hash: string;
    checking_id: string;
  };
}

router.all("/invoice/paid/:webhookId", async (ctx) => {
  const id = ctx.params.webhookId as string;
  if (!webhooks.has(id)) return;
  try {
    const { split, amount } = webhooks.get(id);
    await payoutSplit(split, amount);
    ctx.body = "success";
  } catch (e) {
    console.log("Failed to payout split");
    console.log(e);
    ctx.body = "failed";
  }
});

router.get(
  ["/lnurlp/:splitId", "/.well-known/lnurlp/:splitId"],
  async (ctx) => {
    console.log(ctx.path, ctx.params);
    const split = ctx.state.split;

    ctx.body = {
      callback: new URL(`/lnurlp-callback/${split.name}`, publicUrl).toString(),
      maxSendable: milisats(100000),
      minSendable: milisats(split.payouts.length * 2),
      metadata: JSON.stringify(split.metadata),
      tag: "payRequest",
    };
  }
);

router.get("/lnurlp-callback/:splitId", async (ctx) => {
  console.log(ctx.path, ctx.params, ctx.query);
  const split = ctx.state.split;
  const amount = Math.round(parseInt(ctx.query.amount as string) / 1000);
  // const comment = ctx.query.comment as string;

  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }

  try {
    const { payment_request, payment_hash } = await createInvoiceForSplit(
      split,
      amount
    );
    ctx.body = {
      pr: payment_request,
      routes: [],
    };
    ctx.status = 200;
  } catch (e) {
    ctx.body = {
      status: "ERROR",
      reason: e.message,
    };
    ctx.status = 500;
    return;
  }
});
