import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import { resolve, dirname } from "path";
import staticFolder from "koa-static";
import { fileURLToPath } from "url";
import Router from "@koa/router";
import {
  createSplit,
  deleteSplit,
  getSplit,
  listSplits,
  payoutSplit,
} from "./splits.js";
import { adminKey, publicDomain, publicUrl } from "./env.js";
import { milisats } from "./helpers.js";
import lnbits from "./lnbits/client.js";
import { createHash } from "node:crypto";
import { Ecc, QrCode } from "./lib/qrcodegen.js";
import { drawSvgPath } from "./helpers/qrcode.js";
import { nanoid } from "nanoid";

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
  .use(router.routes())
  .use(router.allowedMethods())
  .use(staticFolder(resolve(__dirname, "../public")));

router.get("/", (ctx) => {
  ctx.body = "LNSplit";
});

// Admin views
router.get("/admin", async (ctx) => {
  const splits = await listSplits();
  await ctx.render("index", { splits });
});
router.get("/admin/create", async (ctx) => {
  const split = await createSplit("test", 10, [
    ["hzrd149@getalby.com", 50],
    ["tragichose49@walletofsatoshi.com", 50],
  ]);

  ctx.redirect(`/admin/split/${split.id}`);
});
router.get("/admin/split/:id", async (ctx) => {
  const split = await getSplit(ctx.params.id);
  if (!split) {
    ctx.body = "no split with id " + ctx.params.id;
    ctx.status = 404;
    return;
  }

  const url = new URL(`/lnurlp/${split.id}`, publicUrl);
  const lnurlp = `lnurlp://${url.hostname + url.pathname}`;
  const address = `${split.id}@${publicDomain}`;

  await ctx.render("split/index", {
    split,
    lnurlp,
    lnurlpQrCode: `/qr?data=${lnurlp}`,
    address,
    addressQrCode: `/qr?data=${address}`,
  });
});
router.get("/admin/split/:id/delete", async (ctx) => {
  const split = await getSplit(ctx.params.id);
  if (!split) throw new Error("invalid id");
  await ctx.render("split/delete", { split });
});
router.post("/admin/split/:id/delete", async (ctx) => {
  await deleteSplit(ctx.params.id);
  await ctx.redirect("/admin");
});

// LNURL methods
const webhooks = new Map<string, { split: string; amount: number }>();
router.get(["/lnurlp/:id", "/.well-known/lnurlp/:id"], async (ctx) => {
  console.log(ctx.path, ctx.params);
  const split = await getSplit(ctx.params.id);

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
  const split = await getSplit(ctx.params.id);
  const amount = Math.round(parseInt(ctx.query.amount as string) / 1000);
  // const comment = ctx.query.comment as string;

  if (!Number.isFinite(amount)) {
    ctx.body = { status: "ERROR", reason: "missing amount" };
    ctx.status = 400;
    return;
  }

  console.log(`Creating invoice for ${amount} sats`);
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
      webhook: new URL(`/lnurlp/paid/${webhookId}`, publicUrl).toString(),
    },
  });
  if (error) {
    ctx.body = {
      status: "ERROR",
      reason: "failed to create invoice: " + error.detail,
    };
    ctx.status = 500;
    return;
  }

  const res = data as { payment_request: string; payment_hash: string };
  console.log(`Created invoice: ${res.payment_request}`);

  ctx.body = {
    pr: res.payment_request,
    routes: [],
  };
  ctx.status = 200;
});
router.all("/lnurlp/paid/:id", async (ctx) => {
  const id = ctx.params.id as string;
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
