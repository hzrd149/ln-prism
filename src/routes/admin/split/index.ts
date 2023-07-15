import Router from "@koa/router";
import { deleteSplitRouter } from "./delete.js";
import { splitAddressRouter } from "./target.js";
import { StateWithSplit } from "../../params.js";
import { editSplitRouter } from "./edit.js";

export const adminSplitRouter = new Router();

adminSplitRouter.get<StateWithSplit>("/", (ctx) => {
  const split = ctx.state.split;

  ctx.state.ogTitle = split.address;

  return ctx.render("admin/split/index", {
    totalWeight: split.targets.reduce((v, p) => v + p.weight, 0),
    failedPayouts: split.payouts.filter((p) => p.failed),
  });
});

adminSplitRouter.use(
  "/delete",
  deleteSplitRouter.routes(),
  deleteSplitRouter.allowedMethods()
);
adminSplitRouter.use(
  "/edit",
  editSplitRouter.routes(),
  editSplitRouter.allowedMethods()
);
adminSplitRouter.use(
  splitAddressRouter.routes(),
  splitAddressRouter.allowedMethods()
);
