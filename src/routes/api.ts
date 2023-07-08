import Router from "@koa/router";
import { Split, SplitTarget, db } from "../db.js";
import { getAddressMetadata } from "../helpers/ln-address.js";
import { createSplit } from "../splits.js";
import { LOGIN_PASSWORD, LOGIN_USER } from "../env.js";
import { BadRequestError, ConflictError } from "../helpers/errors.js";

const { default: auth } = await import("koa-basic-auth");

const routes = new Router();

if (LOGIN_USER && LOGIN_PASSWORD) {
  routes.use(auth({ name: LOGIN_USER, pass: LOGIN_PASSWORD }));
}

// create
routes.post("/api/split", async (ctx) => {
  const name = ctx.request.body.name;
  if (db.data.splits[name]) {
    throw new ConflictError("A split with that name already exists");
  }

  const split = await createSplit(ctx.request.body.name);
  ctx.body = split;
});

// get split
routes.get("/api/split/:splitId", (ctx) => {
  const split = ctx.state.split as Split;
  ctx.body = split;
});

// delete
routes.delete("/api/split/:splitId", async (ctx) => {
  const split = ctx.state.split as Split;

  delete db.data.splits[split.name];
  db.data.pendingPayouts = db.data.pendingPayouts.filter(
    (p) => p.split !== split.name
  );

  ctx.status = 200;
  ctx.body = {
    success: true,
  };
});

// update split
routes.patch("/api/split/:splitId", async (ctx) => {
  const split = ctx.state.split as Split;

  if (ctx.request.body.payouts) {
    const payouts = ctx.request.body.payouts as SplitTarget[];

    for (const { address } of payouts) {
      if (!(await getAddressMetadata(address)))
        throw new BadRequestError(`Unreachable address ${address}`);
    }

    // pick only the address and weight fields of the body
    split.payouts = payouts.map((p) => ({
      address: p.address,
      weight: p.weight,
    }));
  }

  ctx.body = split;
});

export default routes;
