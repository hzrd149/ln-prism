import Router from "@koa/router";
import { Split, removeSplit } from "../../../splits.js";
import { db } from "../../../db.js";

export const deleteSplitRouter = new Router();

deleteSplitRouter.get("/admin/split/:splitId/delete", (ctx) =>
  ctx.render("admin/split/delete")
);
deleteSplitRouter.post("/admin/split/:splitId/delete", async (ctx) => {
  const split = ctx.state.split as Split;
  await removeSplit(split.id);
  await ctx.redirect("/admin");
});
