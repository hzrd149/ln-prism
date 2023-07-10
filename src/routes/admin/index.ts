import Router from "@koa/router";
import { db } from "../../db.js";
import { LOGIN_PASSWORD, LOGIN_USER } from "../../env.js";
import { adminSplitRouter } from "./split/index.js";
import { createSplitRouter } from "./create.js";

const { default: auth } = await import("koa-basic-auth");

export const adminRouter = new Router();

if (LOGIN_USER && LOGIN_PASSWORD) {
  adminRouter.use(auth({ name: LOGIN_USER, pass: LOGIN_PASSWORD }));
}

adminRouter.get("/admin", async (ctx) => {
  const splits = Array.from(Object.values(db.data.splits));
  await ctx.render("admin/index", { splits });
});

adminRouter.use(createSplitRouter.routes(), createSplitRouter.allowedMethods());
adminRouter.use(adminSplitRouter.routes(), adminSplitRouter.allowedMethods());
