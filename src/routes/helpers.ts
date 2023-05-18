import Router from "@koa/router";
import { createSvgQrCode } from "../helpers/qrcode.js";

const routes = new Router();

routes.get("qr", "/qr/:data", async (ctx) => {
  let border = parseInt((ctx.query.border as string) ?? "2");

  ctx.response.set("content-type", "image/svg+xml");
  ctx.body = createSvgQrCode(ctx.params.data, border);
});

export default routes;
