import Router from "@koa/router";
import { LOGIN_PASSWORD, LOGIN_USER } from "../../env.js";
import { adminSplitRouter } from "./split/index.js";
import { createSplitRouter } from "./create.js";
import { getSplits } from "../../splits/splits.js";
import { db } from "../../db.js";

const { default: auth } = await import("koa-basic-auth");

export const adminRouter = new Router();

if (LOGIN_USER && LOGIN_PASSWORD) {
  adminRouter.use(auth({ name: LOGIN_USER, pass: LOGIN_PASSWORD }));
}

adminRouter.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.log(err);
    if (err.status === 401) {
      ctx.set("WWW-Authenticate", "Basic");
    }

    ctx.status = err.statusCode || err.status || 500;
    return ctx.render("error", { error: err });
  }
});

adminRouter.get("/", async (ctx) => {
  const splits = getSplits();
  await ctx.render("admin/index", { splits, rootApiKey: db.data.rootApiKey });
});

adminRouter.use(createSplitRouter.routes(), createSplitRouter.allowedMethods());
adminRouter.use("/split/:splitId", adminSplitRouter.routes(), adminSplitRouter.allowedMethods());
