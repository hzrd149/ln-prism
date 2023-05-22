import { nanoid } from "nanoid";
import { adminKey } from "../env.js";
import lnbits from "../lnbits/client.js";
import { createHash } from "node:crypto";
import {
  createPayouts,
  buildLNURLpMetadata,
  getMaxSendable,
  getMinSendable,
} from "../splits.js";
import Router from "@koa/router";
import { Split, db } from "../db.js";
import { msatsToSats, roundToSats } from "../helpers.js";
import { LNURLpayRequest } from "../types.js";

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
  const metadata = buildLNURLpMetadata(split, hostname);
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
      amount: msatsToSats(amount), //convert amount to sats, since LNBits only takes sats
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

  const { split: splitName, amount, comment } = webhooks.get(id);

  const split = db.data.splits[splitName];
  if (!split) throw new Error(`unknown split ${splitName}`);

  console.log(`Received ${msatsToSats(amount)} sats on ${splitName}`);

  const fullComment = [split.name + "@" + ctx.hostname, comment]
    .filter(Boolean)
    .join("\n").trim();

  await createPayouts(split, amount, fullComment);
  ctx.body = "success";
});

routes.get(
  ["/lnurlp/:splitId", "/.well-known/lnurlp/:splitId"],
  async (ctx) => {
    console.log(ctx.href);
    const split = ctx.state.split as Split;
    const metadata = buildLNURLpMetadata(
      split,
      new URL(ctx.state.publicUrl).hostname
    );

    ctx.body = {
      callback: new URL(
        `/lnurlp-callback/${split.name}`,
        ctx.state.publicUrl
      ).toString(),
      minSendable: roundToSats(await getMinSendable(split)),
      maxSendable: roundToSats(await getMaxSendable(split)),
      metadata: JSON.stringify(metadata),
      commentAllowed: 256,
      tag: "payRequest",
    } as LNURLpayRequest;
  }
);

routes.get("/lnurlp-callback/:splitId", async (ctx) => {
  console.log(ctx.href);
  const split = ctx.state.split as Split;
  const amount = parseInt(ctx.query.amount as string);
  const comment = ctx.query.comment as string | undefined;

  const minSendable = roundToSats(await getMinSendable(split));
  const maxSendable = roundToSats(await getMaxSendable(split));
  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }
  if (amount < minSendable) {
    ctx.body = { status: "ERROR", reason: "amount less than minSendable" };
    ctx.status = 400;
    return;
  }
  if (amount > maxSendable) {
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
