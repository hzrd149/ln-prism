import Router from "@koa/router";
import { deleteSplitRouter } from "./delete.js";
import { splitTargetRouter } from "./target.js";
import { StateWithSplit } from "../../params.js";
import { editSplitRouter } from "./edit.js";

export const adminSplitRouter = new Router();

adminSplitRouter.get<StateWithSplit>("/", (ctx) => {
  const split = ctx.state.split;

  ctx.state.ogTitle = split.address;

  return ctx.render("admin/split/index", {
    totalWeight: split.targets.reduce((v, p) => v + p.weight, 0),
    failedPayouts: Array.from(split.targets.map((t) => t.pending))
      .flat()
      .filter((p) => p.failed),
  });
});

adminSplitRouter.post<StateWithSplit>("/retry-failed", async (ctx) => {
  const split = ctx.state.split;

  for (const target of split.targets) {
    for (const pending of target.pending) {
      delete pending.failed;
    }
  }

  await ctx.redirect(`/admin/split/${split.id}`);
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
  splitTargetRouter.routes(),
  splitTargetRouter.allowedMethods()
);
