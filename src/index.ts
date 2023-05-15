import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import { resolve, dirname } from "path";
import staticFolder from "koa-static";
import { fileURLToPath } from "url";
import Router from "@koa/router";
import { createSplit, getSplit, listSplits, payoutSplit } from "./splits.js";
import { adminKey, publicDomain, publicUrl } from "./env.js";
import { milisats } from "./helpers.js";
import lnbits from "./lnbits/client.js";
import { createHash } from "node:crypto";

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

router.all("/cb/:id", async (ctx) => {
  const id = ctx.params.id as string;
  try {
    await payoutSplit(id);
    ctx.body = "success";
  } catch (e) {
    console.log("Failed to payout split");
    console.log(e);
    ctx.body = "failed";
  }
});
router.get("/", async (ctx) => {
  await ctx.render("index", {});
});
router.get("/splits", async (ctx) => {
  ctx.body = await listSplits();
});

router.get("/create", async (ctx) => {
  const split = await createSplit("test", 10, [
    ["hzrd149@getalby.com", 50],
    ["tragichose49@walletofsatoshi.com", 50],
  ]);

  ctx.redirect(`/split/${split.id}`);
});
router.get("/split/:id", async (ctx) => {
  const split = await getSplit(ctx.params.id);
  if (!split) {
    ctx.body = "no split with id " + ctx.params.id;
    ctx.status = 404;
    return;
  }

  const url = new URL(`/lnurlp/${split.id}`, publicUrl);
  const lnurlp = `lnurlp://${url.hostname + url.pathname}`;
  const address = `${split.id}@${publicDomain}`;

  ctx.body = {
    lnurlp,
    lnurlpQrCode: `https://chart.googleapis.com/chart?cht=qr&chs=512x512&chl=${lnurlp}`,
    address,
    addressQrCode: `https://chart.googleapis.com/chart?cht=qr&chs=512x512&chl=${address}`,
  };
});
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

  const { data, error } = await lnbits.post("/api/v1/payments", {
    headers: { "X-Api-Key": adminKey },
    params: {},
    body: {
      out: false,
      amount,
      memo: split.id,
      internal: false,
      description_hash: hash.digest("hex"),
      webhook: new URL(`/cb/${split.id}`, publicUrl).toString(),
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

app.listen(3000, "0.0.0.0");
