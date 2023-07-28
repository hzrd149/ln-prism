import Router from "@koa/router";
import { StateWithSplit } from "../../../params.js";
import { editTargetRouter } from "./edit.js";
import { deleteTargetRouter } from "./delete.js";

export const targetRouter = new Router();

// details page
targetRouter.get<StateWithSplit>("/", (ctx) => {
  return ctx.render("admin/split/target/index");
});

// history
targetRouter.get<StateWithSplit>("/history", (ctx) => {
  return ctx.render("admin/split/target/history");
});

targetRouter.use("/edit", editTargetRouter.routes(), editTargetRouter.allowedMethods());
targetRouter.use("/delete", deleteTargetRouter.routes(), deleteTargetRouter.allowedMethods());
