import Router from "@koa/router";
import { imageRouter } from "./images.js";
import { splitRouter } from "./split.js";

export const publicRouter = new Router();

// error handler
publicRouter.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (!err.status) {
      console.log(err);
    }

    ctx.status = err.statusCode || err.status || 500;
    return ctx.render("error", { error: err });
  }
});

publicRouter.use(imageRouter.routes(), imageRouter.allowedMethods());
publicRouter.use(splitRouter.routes(), splitRouter.allowedMethods());
