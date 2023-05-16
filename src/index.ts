import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import { resolve, dirname } from "path";
import staticFolder from "koa-static";
import { koaBody } from "koa-body";
import { fileURLToPath } from "url";
import Router from "@koa/router";
import { Split, createSplit, payoutSplit } from "./splits.js";
import { adminKey, publicDomain, publicUrl } from "./env.js";
import { milisats } from "./helpers.js";
import lnbits from "./lnbits/client.js";
import { createHash } from "node:crypto";
import { Ecc, QrCode } from "./lib/qrcodegen.js";
import { drawSvgPath } from "./helpers/qrcode.js";
import { nanoid } from "nanoid";
import { deleteSplit, listSplits, loadSplit, saveSplit } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Koa();
const router = new Router();

ejs(app, {
  root: resolve(__dirname, "../views"),
  viewExt: "ejs",
  cache: false,
});

app
  .use(cors({ origin: "*" }))
  .use(koaBody())
  .use(router.routes())
  .use(router.allowedMethods())
  .use(staticFolder(resolve(__dirname, "../public")));

router.get("/", (ctx) => {
  ctx.body = "LNSplit";
});

// Admin views
router.use((ctx, next) => {
  ctx.state.path = ctx.path;
  ctx.state.publicDomain = publicDomain;
  ctx.state.publicUrl = publicUrl;
  return next();
});
router.param("id", async (id, ctx, next) => {
  const split = await loadSplit(id);

  if (!split) {
    ctx.body = "no split with id " + id;
    ctx.status = 404;
    return;
  }

  ctx.state.split = split;
  return next();
});

router.get("/admin", async (ctx) => {
  const splits = await listSplits();
  await ctx.render("admin/index", { splits });
});
router.get("/admin/create", async (ctx) => {
  const split = await createSplit("test", 10, [
    ["hzrd149@getalby.com", 50],
    ["tragichose49@walletofsatoshi.com", 50],
  ]);

  ctx.redirect(`/admin/split/${split.id}`);
});

router.get("/admin/split/:id", async (ctx) => {
  const split = ctx.state.split;
  const url = new URL(`/lnurlp/${split.id}`, publicUrl);
  const lnurlp = `lnurlp://${url.hostname + url.pathname}`;
  const address = `${split.id}@${publicDomain}`;

  await ctx.render("admin/split/index", {
    split,
    lnurlp,
    lnurlpQrCode: `/qr?data=${lnurlp}`,
    address,
    addressQrCode: `/qr?data=${address}`,
  });
});
router.get("/admin/split/:id/delete", (ctx) =>
  ctx.render("admin/split/delete")
);
router.post("/admin/split/:id/delete", async (ctx) => {
  await deleteSplit(ctx.params.id);
  await ctx.redirect("/admin");
});

router.get("/admin/split/:id/add", (ctx) => ctx.render("admin/split/add"));
router.post("/admin/split/:id/add", async (ctx) => {
  const split = ctx.state.split as Split;
  const address = ctx.request.body.address;
  const weight = parseInt(ctx.request.body.weight);

  if (split.payouts.find((p) => p[0] === address)) {
    ctx.body = "That address already exists";
    ctx.status = 409;
    return;
  }

  // test address
  try {
    const [name, domain] = address.split("@");
    const metadata = await fetch(
      `https://${domain}/.well-known/lnurlp/${name}`
    ).then((res) => res.json());
    if (!metadata.callback) throw new Error("bad lnurlp endpoint");
  } catch (e) {
    ctx.body = "Invalid address";
    ctx.status = 400;
    return;
  }

  if (address && weight) {
    split.payouts.push([address, weight]);
  }

  await saveSplit(split);

  await ctx.redirect(`/admin/split/${split.id}`);
});

router.get("/admin/split/:id/remove/:address", async (ctx) => {
  await ctx.render("admin/split/remove", { address: ctx.params.address });
});
router.post("/admin/split/:id/remove/:address", async (ctx) => {
  const split = ctx.state.split;
  split.payouts = split.payouts.filter((p) => p[0] !== ctx.params.address);
  await saveSplit(split);
  await ctx.redirect(`/admin/split/${split.id}`);
});

const webhooks = new Map<string, { split: string; amount: number }>();
async function createInvoiceForSplit(split: Split, amount: number) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(split.metadata));

  const webhookId = nanoid();
  webhooks.set(webhookId, { split: split.id, amount });

  const { data, error } = await lnbits.post("/api/v1/payments", {
    headers: { "X-Api-Key": adminKey },
    params: {},
    body: {
      out: false,
      amount,
      memo: split.id,
      internal: false,
      description_hash: hash.digest("hex"),
      webhook: new URL(`/invoice/paid/${webhookId}`, publicUrl).toString(),
    },
  });
  if (error) {
    throw new Error("failed to create invoice: " + error.detail);
  }

  return data as {
    payment_request: string;
    payment_hash: string;
    checking_id: string;
  };
}
router.all("/invoice/paid/:webhookId", async (ctx) => {
  const id = ctx.params.webhookId as string;
  if (!webhooks.has(id)) return;
  try {
    const { split, amount } = webhooks.get(id);
    await payoutSplit(split, amount);
    ctx.body = "success";
  } catch (e) {
    console.log("Failed to payout split");
    console.log(e);
    ctx.body = "failed";
  }
});

// Public views
router.get("/split/:id/invoice", async (ctx) => {
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

// LNURL methods
router.get(["/lnurlp/:id", "/.well-known/lnurlp/:id"], async (ctx) => {
  console.log(ctx.path, ctx.params);
  const split = await loadSplit(ctx.params.id);

  ctx.body = {
    callback: new URL(`/lnurlp-callback/${split.id}`, publicUrl).toString(),
    maxSendable: milisats(split.amount),
    minSendable: milisats(split.amount),
    metadata: JSON.stringify(split.metadata),
    tag: "payRequest",
  };
});
router.get("/lnurlp-callback/:id", async (ctx) => {
  console.log(ctx.path, ctx.params, ctx.query);
  const split = await loadSplit(ctx.params.id);
  const amount = Math.round(parseInt(ctx.query.amount as string) / 1000);
  // const comment = ctx.query.comment as string;

  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }

  try {
    const { payment_request, payment_hash } = await createInvoiceForSplit(
      split,
      amount
    );
    ctx.body = {
      pr: payment_request,
      routes: [],
    };
    ctx.status = 200;
  } catch (e) {
    ctx.body = {
      status: "ERROR",
      reason: e.message,
    };
    ctx.status = 500;
    return;
  }
});

// helpers
router.get("/qr", async (ctx) => {
  let lightColor = "white";
  let darkColor = "black";
  let border = 2;
  let qrcode = QrCode.encodeText(ctx.query.data as string, Ecc.LOW);
  let size = qrcode.size + border * 2;

  ctx.response.body = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  version="1.1"
  viewBox="0 0 ${size} ${size}"
  stroke="none"
  width="${size * 4}"
  height="${size * 4}"
>
  <rect width="${size}" height="${size}" fill="${lightColor}" />
  <path d="${drawSvgPath(qrcode, border)}" fill="${darkColor}" />
</svg>
  `.trim();
  ctx.response.set("content-type", "image/svg+xml");
});

app.listen(3000, "0.0.0.0");
