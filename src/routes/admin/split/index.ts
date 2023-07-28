import Router from "@koa/router";
import { deleteSplitRouter } from "./delete.js";
import { StateWithSplit } from "../../params.js";
import { editSplitRouter } from "./edit.js";
import { targetRouter } from "./target/index.js";
import { addTargetRouter } from "./add.js";

export const adminSplitRouter = new Router();

// details page
adminSplitRouter.get<StateWithSplit>("/", (ctx) => {
  const split = ctx.state.split;

  ctx.state.ogTitle = split.address;

  return ctx.render("admin/split/index");
});

// pending payments
adminSplitRouter.get<StateWithSplit>("/pending", (ctx) => {
  const split = ctx.state.split;
  ctx.state.ogTitle = "Pending - " + split.address;
  return ctx.render("admin/split/pending");
});

// history
adminSplitRouter.get<StateWithSplit>("/history", (ctx) => {
  const split = ctx.state.split;
  ctx.state.ogTitle = "History - " + split.address;
  return ctx.render("admin/split/history");
});

adminSplitRouter.use("/delete", deleteSplitRouter.routes(), deleteSplitRouter.allowedMethods());
adminSplitRouter.use("/edit", editSplitRouter.routes(), editSplitRouter.allowedMethods());
adminSplitRouter.use("/add", addTargetRouter.routes(), addTargetRouter.allowedMethods());
adminSplitRouter.use("/target/:targetId", targetRouter.routes(), targetRouter.allowedMethods());
