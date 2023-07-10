import Router from "@koa/router";
import { deleteSplitRouter } from "./delete.js";
import { splitAddressRouter } from "./target.js";
import { Split } from "../../../splits.js";

export const adminSplitRouter = new Router();

adminSplitRouter.get("/admin/split/:splitId", (ctx) => {
  const split = ctx.state.split as Split;

  ctx.state.ogTitle = split.address;

  return ctx.render("admin/split/index", {
    totalWeight: split.targets.reduce((v, p) => v + p.weight, 0),
    failedPayouts: split.payouts.filter((p) => p.failed),
  });
});

adminSplitRouter.use(
  deleteSplitRouter.routes(),
  deleteSplitRouter.allowedMethods()
);
adminSplitRouter.use(
  splitAddressRouter.routes(),
  splitAddressRouter.allowedMethods()
);
