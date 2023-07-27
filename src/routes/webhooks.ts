import Router from "@koa/router";
import { StateWithSplit } from "./params.js";

export const webhookRouter = new Router();

webhookRouter.all<StateWithSplit, { id: string }>("/:splitId/:invoice", async (ctx) => {
  const id = ctx.params.invoice;
  const split = ctx.state.split;

  await split.handlePaid(id);

  ctx.body = "success";
});
