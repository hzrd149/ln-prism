import Router from "@koa/router";
import { StateWithSplit } from "../../params.js";
import { BadRequestError } from "../../../helpers/errors.js";

export const editSplitRouter = new Router();

editSplitRouter.get<StateWithSplit>("/", (ctx) => ctx.render("admin/split/edit"));
editSplitRouter.post<StateWithSplit>("/", async (ctx) => {
  const split = ctx.state.split;
  const name = ctx.request.body.name as string;
  const domain = ctx.request.body.domain as string;
  const enableNostrZaps = !!ctx.request.body.enableNostrZaps;
  const enableNostrProfile = !!ctx.request.body.enableNostrProfile;
  if (!name || !domain) throw new BadRequestError();

  split.name = name;
  split.domain = domain;
  split.enableNostrZaps = enableNostrZaps;
  split.enableNostrProfile = enableNostrProfile;

  await split.updateNostrProfile();

  await ctx.redirect(`/admin/split/${split.id}`);
});
