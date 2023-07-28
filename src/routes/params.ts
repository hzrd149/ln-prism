import Router from "@koa/router";
import { NotFountError } from "../helpers/errors.js";
import { Split } from "../splits/split.js";
import { getSplitById, getSplitByName } from "../splits/splits.js";
import Target from "../splits/targets/target.js";

export type CustomState = {
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
};
export type StateWithSplit = CustomState & {
  split: Split;
};
export type StateWithTarget = StateWithSplit & {
  target: Target;
};

export function setupParams(router: Router) {
  router.use((ctx, next) => {
    ctx.state.path = ctx.path;
    ctx.state.hostname = ctx.hostname;

    ctx.state.ogTitle = "LN Prism";
    ctx.state.ogDescription = "A simple lightning prisim server";
    ctx.state.ogUrl = "https://" + ctx.hostname;
    ctx.state.ogImage = new URL("/icon.svg", ctx.origin);

    return next();
  });

  router.param<{ splitName: string }>("splitName", async (name, ctx, next) => {
    const split = getSplitByName(name, ctx.hostname);

    if (!split) throw new NotFountError(name + "@" + ctx.hostname + " dose not exist");
    ctx.state.split = split;

    return next();
  });
  router.param<{ splitId: string }>("splitId", async (id, ctx, next) => {
    const split = getSplitById(id);

    if (!split) throw new NotFountError(id + " dose not exist");
    ctx.state.split = split;
    ctx.state.splitHref = `/admin/split/${ctx.state.split.id}`

    return next();
  });

  router.param<{ targetId: string }>("targetId", async (id, ctx, next) => {
    const target = ctx.state.split.targets.find((target) => target.id === id);

    if (!target) throw new NotFountError(id + " dose not exist");
    ctx.state.target = target;
    ctx.state.targetHref = `${ctx.state.splitHref}/target/${target.id}`

    return next();
  });
}
