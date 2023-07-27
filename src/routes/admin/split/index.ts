import Router from "@koa/router";
import { deleteSplitRouter } from "./delete.js";
import { splitTargetRouter } from "./target.js";
import { StateWithSplit } from "../../params.js";
import { editSplitRouter } from "./edit.js";

export const adminSplitRouter = new Router();

adminSplitRouter.get<StateWithSplit>("/", (ctx) => {
  const split = ctx.state.split;

  ctx.state.ogTitle = split.address;

  return ctx.render("admin/split/index");
});
adminSplitRouter.get<StateWithSplit>("/pending", (ctx) => {
  const split = ctx.state.split;
  ctx.state.ogTitle = "Pending - " + split.address;
  return ctx.render("admin/split/pending");
});
adminSplitRouter.get<StateWithSplit>("/history", (ctx) => {
  const split = ctx.state.split;
  ctx.state.ogTitle = "History - " + split.address;
  return ctx.render("admin/split/history");
});

adminSplitRouter.use("/delete", deleteSplitRouter.routes(), deleteSplitRouter.allowedMethods());
adminSplitRouter.use("/edit", editSplitRouter.routes(), editSplitRouter.allowedMethods());
adminSplitRouter.use(splitTargetRouter.routes(), splitTargetRouter.allowedMethods());
