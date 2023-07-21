import { satsToMsats, msatsToSats } from "../../helpers/sats.js";
import { BadRequestError } from "../../helpers/errors.js";
import Router from "@koa/router";
import { StateWithSplit } from "../params.js";

export const splitRouter = new Router();

splitRouter.get("/", (ctx) => ctx.render("index"));

splitRouter.get<StateWithSplit>("/split/:splitName", async (ctx) => {
  const split = ctx.state.split;

  await ctx.render("split/index", {
    totalWeight: split.targets.reduce((v, p) => v + p.weight, 0),
    ogTitle: ctx.state.splitAddress,
    ogImage: `https://${split.domain}/split/${split.id}/address.png`,
    minSendable: msatsToSats(await split.getMinSendable()),
    maxSendable: msatsToSats(await split.getMaxSendable()),
  });
});

splitRouter.get<StateWithSplit>("/split/:splitName/invoice", async (ctx) => {
  const split = ctx.state.split;

  const amount = parseInt(ctx.query.amount as string);
  if (!amount) throw new BadRequestError("missing amount");

  const { paymentRequest, paymentHash } = await split.createInvoice(
    satsToMsats(amount),
    {}
  );

  await ctx.render("split/invoice", {
    invoice: paymentRequest,
    hash: paymentHash,
  });
});
