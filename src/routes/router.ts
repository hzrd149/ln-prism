import Router from "@koa/router";
import { publicDomain, publicUrl } from "../env.js";
import { loadSplit } from "../db.js";

export const router = new Router();

router.use((ctx, next) => {
  ctx.state.path = ctx.path;
  ctx.state.publicDomain = publicDomain;
  ctx.state.publicUrl = publicUrl;
  return next();
});

router.param("splitId", async (id, ctx, next) => {
  const split = await loadSplit(id);

  if (!split) {
    ctx.body = "no split with id " + id;
    ctx.status = 404;
    return;
  }

  ctx.state.split = split;
  ctx.state.splitAddress = split.name + "@" + publicDomain;
  const url = new URL(`/lnurlp/${split.name}`, publicUrl);
  ctx.state.splitLnurlp = `lnurlp://${url.hostname + url.pathname}`;

  return next();
});
