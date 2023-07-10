import Router from "@koa/router";
import { Split } from "../splits.js";

export const webhookRouter = new Router();

webhookRouter.all("/webhook/:splitId/:id", async (ctx) => {
  console.log(ctx.href);

  const id = ctx.params.id as string;
  const split = ctx.state.split as Split;

  await split.handleInvoicePaid(id);

  ctx.body = "success";
});
