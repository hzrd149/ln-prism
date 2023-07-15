import Router from "@koa/router";
import {
  BadRequestError,
  ConflictError,
  NotFountError,
} from "../../../helpers/errors.js";
import { getAddressMetadata } from "../../../helpers/lightning-address.js";
import { StateWithSplit } from "../../params.js";

export const splitAddressRouter = new Router();

// add address
splitAddressRouter.get("/add", (ctx) => ctx.render("admin/split/target/add"));
splitAddressRouter.post<StateWithSplit>("/add", async (ctx) => {
  const split = ctx.state.split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  if (split.targets.find((p) => p.address === address))
    throw new ConflictError("That address already exists");

  // test address
  if (!(await getAddressMetadata(address)))
    throw new BadRequestError(`Unreachable address ${address}`);

  if (address && weight) {
    await split.addTarget(address, weight);
  }

  await ctx.redirect(`/admin/split/${split.id}`);
});

// edit address
splitAddressRouter.get<StateWithSplit>("/edit/:id", (ctx) => {
  const split = ctx.state.split;
  const target = split.targets.find((target) => target.id === ctx.params.id);
  if (!target) throw new NotFountError("No payout with that address");
  return ctx.render("admin/split/target/edit", { target });
});
splitAddressRouter.post<StateWithSplit>("/edit/:id", async (ctx) => {
  const split = ctx.state.split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  await split.updateTarget(ctx.params.id, { address, weight });

  await ctx.redirect(`/admin/split/${split.id}`);
});

// remove address
splitAddressRouter.get<StateWithSplit>("/remove/:id", async (ctx) => {
  const split = ctx.state.split;
  const target = split.getTarget(ctx.params.id);

  if (!target)
    throw new NotFountError(`No target ${ctx.params.id} on ${split.address}`);

  await ctx.render("admin/split/target/remove", { target });
});
splitAddressRouter.post<StateWithSplit>("/remove/:id", async (ctx) => {
  const split = ctx.state.split;
  split.targets = split.targets.filter((target) => target.id !== ctx.params.id);

  await ctx.redirect(`/admin/split/${split.id}`);
});
