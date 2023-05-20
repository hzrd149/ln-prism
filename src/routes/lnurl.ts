import { nanoid } from "nanoid";
import { adminKey } from "../env.js";
import lnbits from "../lnbits/client.js";
import { createHash } from "node:crypto";
import {
  createPayouts,
  getLNURLpMetadata,
  getMaxSendable,
  getMinSendable,
} from "../splits.js";
import Router from "@koa/router";
import { Split } from "../db.js";
import { LNURLPayMetadata } from "../types.js";
import { msatsToSats, roundToSats } from "../helpers.js";

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
  const hostname = new URL(origin).hostname;
  const metadata = getLNURLpMetadata(split, hostname);
  const metadataString = JSON.stringify(metadata);
  const hash = createHash("sha256");
  hash.update(metadataString);

  const webhookId = nanoid();
  webhooks.set(webhookId, {
    split: split.name,
    amount: roundToSats(amount),
    comment,
  });

  const encoder = new TextEncoder();
  const view = encoder.encode(metadataString);
  const unhashedDescription = Buffer.from(view).toString("hex");

  const { data, error } = await lnbits.post("/api/v1/payments", {
    headers: { "X-Api-Key": adminKey },
    params: {},
    body: {
      out: false,
      amount: msatsToSats(amount),
      memo: split.name + "@" + hostname,
      internal: false,
      description_hash: hash.digest("hex"),
      unhashed_description: unhashedDescription,
      webhook: new URL(`/webhook/in/${webhookId}`, origin).toString(),
    },
  });
  if (error) throw new Error("failed to create invoice: " + error.detail);

  return data as {
    payment_request: string;
    payment_hash: string;
    checking_id: string;
  };
}

routes.all("/webhook/in/:webhookId", async (ctx) => {
  console.log(ctx.href);

  const id = ctx.params.webhookId as string;
  if (!webhooks.has(id)) return;

  const { split, amount, comment } = webhooks.get(id);
  console.log(`Received ${msatsToSats(amount)} sats on ${split}`);

  await createPayouts(split, amount, comment);
  ctx.body = "success";
});

routes.get(
  ["/lnurlp/:splitId", "/.well-known/lnurlp/:splitId"],
  async (ctx) => {
    console.log(ctx.href);
    const split = ctx.state.split as Split;
    const metadata = getLNURLpMetadata(
      split,
      new URL(ctx.state.publicUrl).hostname
    );

    ctx.body = {
      callback: new URL(
        `/lnurlp-callback/${split.name}`,
        ctx.state.publicUrl
      ).toString(),
      minSendable: getMinSendable(split),
      maxSendable: getMaxSendable(split),
      metadata: JSON.stringify(metadata),
      tag: "payRequest",
    };
  }
);

routes.get("/lnurlp-callback/:splitId", async (ctx) => {
  console.log(ctx.href);
  const split = ctx.state.split;
  const amount = Math.round(parseInt(ctx.query.amount as string) / 1000);
  const comment = ctx.query.comment as string | undefined;

  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }
  if (amount < split.minSendable) {
    ctx.body = { status: "ERROR", reason: "amount less than minSendable" };
    ctx.status = 400;
    return;
  }
  if (amount > split.maxSendable) {
    ctx.body = { status: "ERROR", reason: "amount greater than maxSendable" };
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
