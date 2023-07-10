import Router from "@koa/router";
import { createSplit } from "../../splits.js";
import { ConflictError } from "../../helpers/errors.js";
import { db } from "../../db.js";

export const createSplitRouter = new Router();

createSplitRouter.get("/admin/create", (ctx) => ctx.render("admin/create"));
createSplitRouter.post("/admin/create", async (ctx) => {
  const name = ctx.request.body.name;
  const domain = ctx.request.body.domain;

  const split = await createSplit(name, domain);

  return ctx.redirect(`/admin/split/${split.id}`);
});
