import Router from "@koa/router";
import { imageRouter } from "./images.js";
import { splitRouter } from "./split.js";

export const publicRouter = new Router();

publicRouter.use(imageRouter.routes(), imageRouter.allowedMethods());
publicRouter.use(splitRouter.routes(), splitRouter.allowedMethods());
