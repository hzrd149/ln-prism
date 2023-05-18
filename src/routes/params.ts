import Router from "@koa/router";
import { loadSplit } from "../db.js";

export function setupParams(router: Router) {
  router.use((ctx, next) => {
    ctx.state.path = ctx.path;
    ctx.state.publicDomain = ctx.hostname;
    ctx.state.publicUrl = "https://" + ctx.hostname;
    return next();
  });

  router.param("splitId", async (name, ctx, next) => {
    const split = await loadSplit(name);

    if (!split) {
      ctx.body = "no split with name " + name;
      ctx.status = 404;
      return;
    }

    ctx.state.split = split;
    ctx.state.splitAddress = split.name + "@" + ctx.hostname;
    const url = new URL(`/lnurlp/${split.name}`, ctx.state.publicUrl);
    ctx.state.splitLnurlp = `lnurlp://${url.hostname + url.pathname}`;

    return next();
  });
}
