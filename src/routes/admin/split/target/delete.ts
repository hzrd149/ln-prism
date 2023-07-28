import Router from "@koa/router";
import { StateWithTarget } from "../../../params.js";

export const deleteTargetRouter = new Router();

// remove target
deleteTargetRouter.get<StateWithTarget>("/", async (ctx) => {
  await ctx.render("admin/split/target/delete");
});
deleteTargetRouter.post<StateWithTarget>("/", async (ctx) => {
  const { split, target } = ctx.state;
  split.removeTarget(target.id);

  await ctx.redirect(ctx.state.stateHref);
});
