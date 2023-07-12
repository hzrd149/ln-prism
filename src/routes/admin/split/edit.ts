import Router from "@koa/router";
import { removeSplit } from "../../../splits.js";
import { StateWithSplit } from "../../params.js";

export const deleteSplitRouter = new Router();

deleteSplitRouter.get<StateWithSplit>("/admin/split/:splitId/edit", (ctx) =>
  ctx.render("admin/split/edit")
);
deleteSplitRouter.post<StateWithSplit>(
  "/admin/split/:splitId/edit",
  async (ctx) => {
    await removeSplit(ctx.state.split.id);
    await ctx.redirect("/admin");
  }
);
