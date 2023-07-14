import Router from "@koa/router";
import { StateWithSplit } from "../../params.js";
import { removeSplit } from "../../../splits/splits.js";

export const deleteSplitRouter = new Router();

deleteSplitRouter.get<StateWithSplit>("/admin/split/:splitId/delete", (ctx) =>
  ctx.render("admin/split/delete")
);
deleteSplitRouter.post<StateWithSplit>(
  "/admin/split/:splitId/delete",
  async (ctx) => {
    await removeSplit(ctx.state.split.id);
    await ctx.redirect("/admin");
  }
);
