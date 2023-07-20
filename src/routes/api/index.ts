import Router from "@koa/router";
import { StateWithSplit } from "../params.js";
import { Split } from "../../splits/split.js";
import { createSplit, removeSplit } from "../../splits/splits.js";
import { UnauthorizedError } from "../../helpers/errors.js";
import { db } from "../../db.js";

export const apiRouter = new Router();

// error handler
apiRouter.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (!err.status) {
      console.log(err);
    }

    ctx.status = err.statusCode || err.status || 500;
    ctx.body = { success: false, status: err.status, message: err.message };
  }
});

function formatSplit(split: Split) {
  return {
    id: split.id,
    name: split.name,
    domain: split.domain,
    address: split.address,
    lnurl: split.lnurlp,
    npub: split.npub,
    nprofile: split.nprofile,
    targets: split.targets.map((t) => t.toJSON()),
  };
}

// create
apiRouter.post("/split", async (ctx) => {
  const apiKey = ctx.request.headers["x-api-key"];
  if (apiKey !== db.data.rootApiKey)
    throw new UnauthorizedError("invalid x-api-key");

  const split = await createSplit(
    ctx.request.body.name,
    ctx.request.body.domain || ctx.hostname,
    ctx.request.body.privateKey
  );
  ctx.body = formatSplit(split);
});

// get split
apiRouter.get<StateWithSplit>("/split/:splitId", (ctx) => {
  const split = ctx.state.split;
  ctx.body = formatSplit(split);
});

// delete
apiRouter.delete<StateWithSplit>("/split/:splitId", async (ctx) => {
  const split = ctx.state.split;
  const apiKey = ctx.request.headers["x-api-key"];
  if (apiKey !== split.apiKey && apiKey !== db.data.rootApiKey)
    throw new UnauthorizedError("x-api-key did not match");

  await removeSplit(split.id);

  ctx.status = 200;
  ctx.body = {
    success: true,
  };
});

// update split
apiRouter.patch<StateWithSplit>("/split/:splitId", async (ctx) => {
  const split = ctx.state.split;
  const apiKey = ctx.request.headers["x-api-key"];
  if (apiKey !== split.apiKey && apiKey !== db.data.rootApiKey)
    throw new UnauthorizedError("x-api-key did not match");

  if (ctx.request.body.targets) {
    const targets = ctx.request.body.targets as {
      input: string;
      weight: number;
    }[];

    if (!Array.isArray(targets)) throw new Error("targets must be an array");

    await split.replaceTargets(targets);
  }

  ctx.body = formatSplit(split);
});
