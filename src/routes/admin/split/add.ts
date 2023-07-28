import Router from "@koa/router";
import { StateWithSplit } from "../../params.js";
import { getTargetType } from "../../../splits/targets/index.js";

export const addTargetRouter = new Router();

// add target
addTargetRouter.get("/", (ctx) => ctx.render("admin/split/add"));
addTargetRouter.post<StateWithSplit>("/", async (ctx) => {
  const { split } = ctx.state;

  const weight = parseInt(ctx.request.body.weight);
  const payoutThreshold = parseInt(ctx.request.body.payoutThreshold);
  const type = ctx.request.body.type;
  const input = ctx.request.body.input;
  const forwardComment = !!ctx.request.body.forwardComment;
  const fixed = !!ctx.request.body.fixed;

  if (input && weight) {
    const Type = getTargetType(type);
    const target = new Type();
    await target.setInput(input);
    target.weight = weight;
    target.payoutThreshold = payoutThreshold;
    target.forwardComment = forwardComment;
    target.fixed = fixed;

    await split.addTarget(target);
  }

  await ctx.redirect(ctx.state.splitHref);
});
