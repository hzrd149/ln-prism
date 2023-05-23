import Router from "@koa/router";
import { db } from "../db.js";
import { averageFee, estimatedFee } from "../helpers/ln-address.js";
import { NotFountError } from "../helpers/errors.js";

export function setupParams(router: Router) {
  router.use((ctx, next) => {
    ctx.state.path = ctx.path;
    ctx.state.publicDomain = ctx.hostname;
    ctx.state.publicUrl = "https://" + ctx.hostname;

    ctx.state.ogTitle = "LN Address Splitter";
    ctx.state.ogDescription = "A lightning address that splits payments";
    ctx.state.ogUrl = ctx.state.publicUrl;
    ctx.state.ogImage = new URL("/icon.svg", ctx.origin);

    return next();
  });

  router.param("splitId", async (name, ctx, next) => {
    const split = db.data.splits[name];

    if (!split)
      throw new NotFountError(name + "@" + ctx.hostname + " dose not exist");

    ctx.state.split = split;
    ctx.state.splitAddress = split.name + "@" + ctx.hostname;
    const url = new URL(`/lnurlp/${split.name}`, ctx.state.publicUrl);
    ctx.state.splitLnurlp = `lnurlp://${url.hostname + url.pathname}`;

    ctx.state.addressAvgFee = {};
    for (const { address } of split.payouts) {
      ctx.state.addressAvgFee[address] = averageFee(address);
    }
    ctx.state.addressEstFee = {};
    for (const { address } of split.payouts) {
      ctx.state.addressEstFee[address] = estimatedFee(address);
    }

    return next();
  });
}
