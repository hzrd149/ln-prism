import { createPngQrCode, createSvgQrCode } from "../helpers/qrcode.js";
import { createInvoiceForSplit } from "./lnurl.js";
import Router from "@koa/router";

const routes = new Router();

routes.get("/", (ctx) => ctx.render("index"));

routes.get("/split/:splitId", async (ctx) => {
  await ctx.render("split/index", {
    ogImage: new URL(
      `/split/${ctx.state.split.name}/address.png`,
      ctx.state.publicUrl
    ),
  });
});

routes.get("/split/:splitId/invoice", async (ctx) => {
  const amount = Math.round(parseInt(ctx.query.amount as string));
  if (!amount) throw new Error("missing amount");
  const { payment_request, payment_hash } = await createInvoiceForSplit(
    ctx.state.split,
    amount,
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
