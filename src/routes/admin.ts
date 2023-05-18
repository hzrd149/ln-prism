import Router from "@koa/router";
import { deleteSplit, listSplits, loadSplit, saveSplit } from "../db.js";
import { isValidAddress } from "../helpers/ln-address.js";
import { Split, createSplit } from "../splits.js";
import { loginPassword, loginUser } from "../env.js";

const { default: auth } = await import("koa-basic-auth");

const routes = new Router();

if (loginUser && loginPassword) {
  routes.use(auth({ name: loginUser, pass: loginPassword }));
}

routes.get("/admin", async (ctx) => {
  const splits = await listSplits();
  await ctx.render("admin/index", { splits });
});

routes.get("/admin/create", (ctx) => ctx.render("admin/create"));
routes.post("/admin/create", async (ctx) => {
  const name = ctx.request.body.name;
  if (await loadSplit(name)) {
    throw new Error("a split with that name already exists");
  }

  const split = await createSplit(ctx.request.body.name, []);

  ctx.redirect(`/admin/split/${split.name}`);
});

routes.get("/admin/split/:splitId", (ctx, next) => {
  ctx.state.ogTitle = ctx.state.splitAddress;
  return next();
});

routes.get("/admin/split/:splitId", (ctx) => {
  return ctx.render("admin/split/index", {
    totalWeight: ctx.state.split.payouts.reduce((v, p) => v + p[1], 0),
  });
});

// delete
routes.get("/admin/split/:splitId/delete", (ctx) =>
  ctx.render("admin/split/delete")
);
routes.post("/admin/split/:splitId/delete", async (ctx) => {
  await deleteSplit(ctx.state.split.name);
  await ctx.redirect("/admin");
});

// add address
routes.get("/admin/split/:splitId/add", (ctx) => ctx.render("admin/split/add"));
routes.post("/admin/split/:splitId/add", async (ctx) => {
  const split = ctx.state.split as Split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  if (split.payouts.find((p) => p[0] === address)) {
    ctx.body = "That address already exists";
    ctx.status = 409;
    return;
  }

  // test address
  if (!(await isValidAddress(address))) {
    ctx.body = "Invalid address";
    ctx.status = 400;
    return;
  }

  if (address && weight) {
    split.payouts.push([address, weight]);
  }

  await saveSplit(split);

  await ctx.redirect(`/admin/split/${split.name}`);
});

// remove address
routes.get("/admin/split/:splitId/remove/:address", async (ctx) => {
  await ctx.render("admin/split/remove", { address: ctx.params.address });
});
routes.post("/admin/split/:splitId/remove/:address", async (ctx) => {
  const split = ctx.state.split;
  split.payouts = split.payouts.filter((p) => p[0] !== ctx.params.address);
  await saveSplit(split);
  await ctx.redirect(`/admin/split/${split.name}`);
});

export default routes;
