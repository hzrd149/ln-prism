import Router from "@koa/router";
import { LOGIN_PASSWORD, LOGIN_USER } from "../../env.js";
import { StateWithSplit } from "../params.js";
import { Split } from "../../splits/split.js";
import { createSplit, removeSplit } from "../../splits/splits.js";

const { default: auth } = await import("koa-basic-auth");

export const apiRouter = new Router();

if (LOGIN_USER && LOGIN_PASSWORD) {
  apiRouter.use(auth({ name: LOGIN_USER, pass: LOGIN_PASSWORD }));
}

function formatSplit(split: Split) {
  return {
    id: split.id,
    name: split.name,
    domain: split.domain,
    address: split.address,
    lnurl: split.lnurlp,
    npub: split.npub,
    nprofile: split.nprofile,
    targets: split.targets,
  };
}

// create
apiRouter.post("/api/split", async (ctx) => {
  const split = await createSplit(
    ctx.request.body.name,
    ctx.request.body.domain || ctx.hostname,
    ctx.request.body.privateKey
  );
  ctx.body = formatSplit(split);
});

// get split
apiRouter.get<StateWithSplit>("/api/split/:splitId", (ctx) => {
  const split = ctx.state.split;
  ctx.body = formatSplit(split);
});

// delete
apiRouter.delete<StateWithSplit>("/api/split/:splitId", async (ctx) => {
  const split = ctx.state.split;
  await removeSplit(split.id);

  ctx.status = 200;
  ctx.body = {
    success: true,
  };
});

// update split
apiRouter.patch<StateWithSplit>("/api/split/:splitId", async (ctx) => {
  const split = ctx.state.split;

  if (ctx.request.body.targets) {
    const targets = ctx.request.body.targets as {
      address: string;
      weight: number;
    }[];

    if (!Array.isArray(targets)) throw new Error("targets must be an array");

    await split.replaceTargets(targets);
  }

  ctx.body = formatSplit(split);
});
