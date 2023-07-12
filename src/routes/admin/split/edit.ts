import Router from "@koa/router";
import { StateWithSplit } from "../../params.js";
import { BadRequestError } from "../../../helpers/errors.js";

export const editSplitRouter = new Router();

editSplitRouter.get<StateWithSplit>("/admin/split/:splitId/edit", (ctx) =>
  ctx.render("admin/split/edit")
);
editSplitRouter.post<StateWithSplit>(
  "/admin/split/:splitId/edit",
  async (ctx) => {
    const split = ctx.state.split;
    const name = ctx.request.body.name as string;
    const domain = ctx.request.body.domain as string;
    if (!name || !domain) throw new BadRequestError();

    split.name = name;
    split.domain = domain;

    await ctx.redirect(`/admin/split/${split.id}`);
  }
);
