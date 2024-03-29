import Router from "@koa/router";
import { NotFountError } from "../../../helpers/errors.js";
import { StateWithSplit } from "../../params.js";
import { getTargetType } from "../../../splits/targets/index.js";

export const splitTargetRouter = new Router();

// add target
splitTargetRouter.get("/add", (ctx) => ctx.render("admin/split/target/add"));
splitTargetRouter.post<StateWithSplit>("/add", async (ctx) => {
  const split = ctx.state.split;
  const weight = parseInt(ctx.request.body.weight);
  const type = ctx.request.body.type;
  const input = ctx.request.body.input;
  const forwardComment = !!ctx.request.body.forwardComment;

  if (input && weight) {
    const Type = getTargetType(type);
    const target = new Type();
    await target.setInput(input);
    target.weight = weight;
    target.forwardComment = forwardComment;

    await split.addTarget(target);
  }

  await ctx.redirect(`/admin/split/${split.id}`);
});

// edit target
splitTargetRouter.get<StateWithSplit>("/edit/:id", (ctx) => {
  const split = ctx.state.split;
  const target = split.targets.find((target) => target.id === ctx.params.id);
  if (!target) throw new NotFountError("No payout with that address");
  return ctx.render("admin/split/target/edit", { target });
});
splitTargetRouter.post<StateWithSplit>("/edit/:id", async (ctx) => {
  const split = ctx.state.split;
  const weight = parseInt(ctx.request.body.weight);
  const input = ctx.request.body.input;
  const forwardComment = !!ctx.request.body.forwardComment;

  await split.updateTarget(ctx.params.id, input, { weight, forwardComment });

  await ctx.redirect(`/admin/split/${split.id}`);
});

// remove target
splitTargetRouter.get<StateWithSplit>("/remove/:id", async (ctx) => {
  const split = ctx.state.split;
  const target = split.getTarget(ctx.params.id);

  if (!target)
    throw new NotFountError(`No target ${ctx.params.id} on ${split.address}`);

  await ctx.render("admin/split/target/remove", { target });
});
splitTargetRouter.post<StateWithSplit>("/remove/:id", async (ctx) => {
  const split = ctx.state.split;
  split.removeTarget(ctx.params.id);

  await ctx.redirect(`/admin/split/${split.id}`);
});
