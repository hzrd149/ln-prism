import { nanoid } from "nanoid";
import { adminKey } from "../env.js";
import lnbits from "../lnbits/client.js";
import { createHash } from "node:crypto";
import { Split, createPayouts } from "../splits.js";
import { milisats } from "../helpers.js";
import Router from "@koa/router";

const routes = new Router();

const webhooks = new Map<
  string,
  { split: string; amount: number; comment?: string }
>();

export async function createInvoiceForSplit(
  split: Split,
  amount: number,
  origin: string,
  comment?: string
) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(split.metadata));

  const webhookId = nanoid();
  webhooks.set(webhookId, { split: split.name, amount, comment });

  const encoder = new TextEncoder();
  const view = encoder.encode(JSON.stringify(split.metadata));
  const unhashedDescription = Buffer.from(view).toString("hex");

  const { data, error } = await lnbits.post("/api/v1/payments", {
    headers: { "X-Api-Key": adminKey },
    params: {},
    body: {
      out: false,
      amount,
      // memo: split.name,
      internal: false,
      description_hash: hash.digest("hex"),
      unhashed_description: unhashedDescription,
      webhook: new URL(`/invoice/paid/${webhookId}`, origin).toString(),
    },
  });
  if (error) throw new Error("failed to create invoice: " + error.detail);

  return data as {
    payment_request: string;
    payment_hash: string;
    checking_id: string;
  };
}

routes.all("/invoice/paid/:webhookId", async (ctx) => {
  console.log(ctx.path);

  const id = ctx.params.webhookId as string;
  if (!webhooks.has(id)) return;

  const { split, amount, comment } = webhooks.get(id);
  console.log(`Received ${amount} sats on ${split}`);

  await createPayouts(split, amount, comment);
  ctx.body = "success";
});

routes.get(
  ["/lnurlp/:splitId", "/.well-known/lnurlp/:splitId"],
  async (ctx) => {
    console.log(ctx.path);
    const split = ctx.state.split;

    ctx.body = {
      callback: new URL(
        `/lnurlp-callback/${split.name}`,
        ctx.state.publicUrl
      ).toString(),
      maxSendable: milisats(100000),
      minSendable: milisats(split.payouts.length * 2),
      metadata: JSON.stringify(split.metadata),
      tag: "payRequest",
    };
  }
);

routes.get("/lnurlp-callback/:splitId", async (ctx) => {
  console.log(ctx.path);
  const split = ctx.state.split;
  const amount = Math.round(parseInt(ctx.query.amount as string) / 1000);
  const comment = ctx.query.comment as string | undefined;

  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }

  try {
    const { payment_request, payment_hash } = await createInvoiceForSplit(
      split,
      amount,
      ctx.state.publicUrl,
      comment
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

export default routes;
