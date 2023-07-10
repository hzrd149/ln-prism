import { Split } from "../splits.js";
import Router from "@koa/router";
import { roundToSats } from "../helpers/sats.js";
import { LNURLPayMetadata, LNURLpayRequest } from "../types.js";
import { BadRequestError } from "../helpers/errors.js";

export const lnurlRouter = new Router();

export function buildLNURLpMetadata(split: Split): LNURLPayMetadata {
  const total = split.totalWeight;

  return [
    ["text/plain", split.address],
    [
      "text/long-desc",
      split.targets
        .map((t) => `${t.address}: ${((t.weight / total) * 100).toFixed(2)}%`)
        .join("\n"),
    ],
  ];
}

lnurlRouter.get(
  ["/lnurlp/:splitName", "/.well-known/lnurlp/:splitName"],
  async (ctx) => {
    console.log(ctx.href);
    const split = ctx.state.split as Split;
    const metadata = buildLNURLpMetadata(split);

    ctx.body = {
      callback: `https://${split.domain}/lnurlp-callback/${split.name}`,
      minSendable: roundToSats(await split.getMinSendable()),
      maxSendable: roundToSats(await split.getMaxSendable()),
      metadata: JSON.stringify(metadata),
      commentAllowed: 256,
      tag: "payRequest",
    } as LNURLpayRequest;
  }
);

lnurlRouter.get("/lnurlp-callback/:splitName", async (ctx) => {
  console.log(ctx.href);

  try {
    const split = ctx.state.split as Split;
    const amount = parseInt(ctx.query.amount as string);
    const metadata = buildLNURLpMetadata(split);
    const comment = ctx.query.comment as string | undefined;

    const minSendable = roundToSats(await split.getMinSendable());
    const maxSendable = roundToSats(await split.getMaxSendable());
    if (!Number.isFinite(amount)) throw new BadRequestError("missing amount");
    if (amount < minSendable)
      throw new BadRequestError("amount less than minSendable");
    if (amount > maxSendable)
      throw new BadRequestError("amount greater than maxSendable");

    const { paymentRequest } = await split.createInvoice(
      amount,
      JSON.stringify(metadata),
      comment
    );

    ctx.body = {
      pr: paymentRequest,
      routes: [],
    };
    ctx.status = 200;
  } catch (e) {
    ctx.body = {
      status: "ERROR",
      reason: e.message,
    };
    ctx.status = e.status || 500;

    return;
  }
});
