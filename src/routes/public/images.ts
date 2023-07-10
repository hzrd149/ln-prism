import { createPngQrCode, createSvgQrCode } from "../../helpers/qrcode.js";
import Router from "@koa/router";

export const imageRouter = new Router();

imageRouter.get("/split/:splitId/address.svg", (ctx) => {
  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.state.split.address);
});
imageRouter.get("/split/:splitId/lnurl.svg", (ctx) => {
  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.state.split.lnurlp);
});
imageRouter.get("/split/:splitId/nostr.svg", (ctx) => {
  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.state.split.nprofile);
});
imageRouter.get("/split/:splitId/address.png", (ctx) => {
  ctx.response.set("content-type", "image/png");
  ctx.body = createPngQrCode(ctx.state.split.address);
});
imageRouter.get("/split/:splitId/lnurl.png", (ctx) => {
  ctx.response.set("content-type", "image/png");
  ctx.body = createPngQrCode(ctx.state.split.lnurlp);
});
imageRouter.get("/split/:splitId/nostr.png", (ctx) => {
  ctx.response.set("content-type", "image/png");
  ctx.body = createPngQrCode(ctx.state.split.nprofile);
});

imageRouter.get("/qr/:data", async (ctx) => {
  let border = parseInt((ctx.query.border as string) ?? "2");

  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.params.data, border);
});
