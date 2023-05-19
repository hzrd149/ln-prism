import { handleWebhook } from "../splits.js";
import Router from "@koa/router";

const routes = new Router();

routes.all("/webhook/out/:webhookId", async (ctx) => {
  console.log(ctx.path);

  try {
    await handleWebhook(ctx.params.webhookId);
    ctx.body = "success";
  } catch (e) {
    ctx.status = 500;
    ctx.body = e.message;
  }
});

export default routes;
