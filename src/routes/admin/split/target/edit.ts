import Router from "@koa/router";
import { StateWithTarget } from "../../../params.js";

export const editTargetRouter = new Router();

// edit target
editTargetRouter.get<StateWithTarget>("/", (ctx) => {
  return ctx.render("admin/split/target/edit");
});
editTargetRouter.post<StateWithTarget>("/", async (ctx) => {
  const split = ctx.state.split;
  const target = ctx.state.target;

  const weight = parseInt(ctx.request.body.weight);
  const payoutThreshold = parseInt(ctx.request.body.payoutThreshold);
  const input = ctx.request.body.input;
  const forwardComment = !!ctx.request.body.forwardComment;
  const fixed = !!ctx.request.body.fixed;
  const enabled = !!ctx.request.body.enabled;

  await split.updateTarget(target.id, input, {
    weight,
    forwardComment,
    fixed,
    payoutThreshold,
    enabled,
  });

  await ctx.redirect(ctx.state.targetHref);
});
