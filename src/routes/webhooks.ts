import Router from "@koa/router";
import { StateWithSplit } from "./params.js";

export const webhookRouter = new Router();

webhookRouter.all<StateWithSplit, { id: string }>(
  "/webhook/:splitId/:id",
  async (ctx) => {
    const id = ctx.params.id;
    const split = ctx.state.split;

    await split.handlePaid(id);

    ctx.body = "success";
  }
);
