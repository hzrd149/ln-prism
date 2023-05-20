import { Split } from "../db.js";
import { satsToMsats, msatsToSats } from "../helpers.js";
import { estimatedFee } from "../helpers/ln-address.js";
import { createPngQrCode, createSvgQrCode } from "../helpers/qrcode.js";
import { getMaxSendable, getMinSendable } from "../splits.js";
import { createInvoiceForSplit } from "./lnurl.js";
import Router from "@koa/router";

const routes = new Router();

routes.get("/", (ctx) => ctx.render("index"));

routes.get("/split/:splitId", async (ctx) => {
  const split = ctx.state.split as Split;

  await ctx.render("split/index", {
    totalWeight: split.payouts.reduce((v, p) => v + p.weight, 0),
    ogTitle: ctx.state.splitAddress,
    ogImage: new URL(`/split/${split.name}/address.png`, ctx.state.publicUrl),
    minSendable: msatsToSats(getMinSendable(split)),
    maxSendable: msatsToSats(getMaxSendable(split)),
    estimatedFees: msatsToSats(
      split.payouts.reduce((v, p) => v + estimatedFee(p.address), 0)
    ),
  });
});

routes.get("/split/:splitId/invoice", async (ctx) => {
  const amount = parseInt(ctx.query.amount as string);
  if (!amount) throw new Error("missing amount");
  const { payment_request, payment_hash } = await createInvoiceForSplit(
    ctx.state.split,
    satsToMsats(amount),
    ctx.state.publicUrl
  );

  await ctx.render("split/invoice", {
    invoice: payment_request,
    hash: payment_hash,
  });
});

routes.get("/split/:splitId/address.svg", (ctx) => {
  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.state.splitAddress);
});
routes.get("/split/:splitId/lnurl.svg", (ctx) => {
  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.state.splitLnurlp);
});
routes.get("/split/:splitId/address.png", (ctx) => {
  ctx.response.set("content-type", "image/png");
  ctx.body = createPngQrCode(ctx.state.splitAddress);
});
routes.get("/split/:splitId/lnurl.png", (ctx) => {
  ctx.response.set("content-type", "image/png");
  ctx.body = createPngQrCode(ctx.state.splitLnurlp);
});

export default routes;
