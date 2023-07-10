import Router from "@koa/router";
import { NotFountError } from "../helpers/errors.js";
import { getSplitById, getSplitByName } from "../splits.js";

export function setupParams(router: Router) {
  router.use((ctx, next) => {
    ctx.state.path = ctx.path;
    ctx.state.hostname = ctx.hostname;

    ctx.state.ogTitle = "LN Address Splitter";
    ctx.state.ogDescription = "A simple lightning prisim server";
    ctx.state.ogUrl = "https://" + ctx.hostname;
    ctx.state.ogImage = new URL("/icon.svg", ctx.origin);

    return next();
  });

  router.param("splitName", async (name, ctx, next) => {
    const split = getSplitByName(name, ctx.hostname);

    if (!split)
      throw new NotFountError(name + "@" + ctx.hostname + " dose not exist");

    ctx.state.split = split;

    return next();
  });
  router.param("splitId", async (id, ctx, next) => {
    const split = getSplitById(id);

    if (!split) throw new NotFountError(id + " dose not exist");

    ctx.state.split = split;

    return next();
  });
}
