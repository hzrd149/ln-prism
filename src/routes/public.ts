import { router } from "./router.js";
import { createInvoiceForSplit } from "./lnurl.js";

router.get("/", (ctx) => ctx.render("index"));

router.get("/split/:splitId", async (ctx) => ctx.render("split/index"));

router.get("/split/:splitId/invoice", async (ctx) => {
  const amount = Math.round(parseInt(ctx.query.amount as string));
  if (!amount) throw new Error("missing amount");
  const { payment_request, payment_hash } = await createInvoiceForSplit(
    ctx.state.split,
    amount
  );

  await ctx.render("split/invoice", {
    invoice: payment_request,
    hash: payment_hash,
  });
});
