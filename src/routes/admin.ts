import Router from "@koa/router";
import { Split, db } from "../db.js";
import { getAddressMetadata } from "../helpers/ln-address.js";
import { createSplit, createSplitTarget } from "../splits.js";
import { loginPassword, loginUser } from "../env.js";

const { default: auth } = await import("koa-basic-auth");

const routes = new Router();

if (loginUser && loginPassword) {
  routes.use(auth({ name: loginUser, pass: loginPassword }));
}

routes.get("/admin", async (ctx) => {
  const splits = Array.from(Object.values(db.data.splits));
  await ctx.render("admin/index", { splits });
});

routes.get("/admin/create", (ctx) => ctx.render("admin/create"));
routes.post("/admin/create", async (ctx) => {
  const name = ctx.request.body.name;
  if (db.data.splits[name]) {
    throw new Error("a split with that name already exists");
  }

  const split = await createSplit(ctx.request.body.name);

  ctx.redirect(`/admin/split/${split.name}`);
});

routes.get("/admin/split/:splitId", (ctx, next) => {
  ctx.state.ogTitle = ctx.state.splitAddress;
  return next();
});

routes.get("/admin/split/:splitId", (ctx) => {
  const split = ctx.state.split as Split;

  return ctx.render("admin/split/index", {
    totalWeight: split.payouts.reduce((v, p) => v + p.weight, 0),
    failedPayouts: db.data.pendingPayouts.filter(
      (p) => p.failed && p.split === split.name
    ),
  });
});

// delete
routes.get("/admin/split/:splitId/delete", (ctx) =>
  ctx.render("admin/split/delete")
);
routes.post("/admin/split/:splitId/delete", async (ctx) => {
  const split = ctx.state.split as Split;
  delete db.data.splits[split.name];
  db.data.pendingPayouts = db.data.pendingPayouts.filter(
    (p) => p.split !== split.name
  );

  await ctx.redirect("/admin");
});

// add address
routes.get("/admin/split/:splitId/add", (ctx) => ctx.render("admin/split/add"));
routes.post("/admin/split/:splitId/add", async (ctx) => {
  const split = ctx.state.split as Split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  if (split.payouts.find((p) => p.address === address)) {
    ctx.body = "That address already exists";
    ctx.status = 409;
    return;
  }

  // test address
  if (!(await getAddressMetadata(address))) {
    ctx.body = "Invalid address";
    ctx.status = 400;
    return;
  }

  if (address && weight) {
    const target = await createSplitTarget(address, weight);
    split.payouts.push(target);
  }

  await ctx.redirect(`/admin/split/${split.name}`);
});

// edit address
routes.get("/admin/split/:splitId/edit/:address", (ctx) => {
  const split = ctx.state.split as Split;
  const payout = split.payouts.find((p) => p.address === ctx.params.address);
  if (!payout) throw new Error("No payout with that address");
  return ctx.render("admin/split/edit", { payout });
});
routes.post("/admin/split/:splitId/edit/:address", async (ctx) => {
  const split = ctx.state.split as Split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  split.payouts = split.payouts.map((p) => {
    if (p.address === address) {
      return { address, weight };
    }
    return p;
  });

  await ctx.redirect(`/admin/split/${split.name}`);
});

// remove address
routes.get("/admin/split/:splitId/remove/:address", async (ctx) => {
  await ctx.render("admin/split/remove", { address: ctx.params.address });
});
routes.post("/admin/split/:splitId/remove/:address", async (ctx) => {
  const split = ctx.state.split as Split;
  split.payouts = split.payouts.filter((p) => p.address !== ctx.params.address);

  await ctx.redirect(`/admin/split/${split.name}`);
});

export default routes;
