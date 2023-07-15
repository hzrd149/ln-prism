import Router from "@koa/router";
import { StateWithSplit } from "../../params.js";
import { removeSplit } from "../../../splits/splits.js";

export const deleteSplitRouter = new Router();

deleteSplitRouter.get<StateWithSplit>("/", (ctx) =>
  ctx.render("admin/split/delete")
);
deleteSplitRouter.post<StateWithSplit>("/", async (ctx) => {
  await removeSplit(ctx.state.split.id);
  await ctx.redirect("/admin");
});
