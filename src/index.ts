#!/usr/bin/env node
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { createRequire } from "node:module";

import Koa from "koa";
import Router from "@koa/router";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import staticFolder from "koa-static";
import mount from "koa-mount";
import { koaBody } from "koa-body";
import { nip19 } from "nostr-tools";

import { publicRouter } from "./routes/public/index.js";
import { adminRouter } from "./routes/admin/index.js";
import { apiRouter } from "./routes/api/index.js";
import { lnurlRouter } from "./routes/lnurl.js";
import { setupParams } from "./routes/params.js";
import { webhookRouter } from "./routes/webhooks.js";

import { PORT } from "./env.js";
import { db } from "./db.js";
import { getSplits, loadSplits, saveSplits } from "./splits/splits.js";
import { msatsToSats, satsToMsats } from "./helpers/sats.js";
import { isPubkey } from "./helpers/regexp.js";
import { truncatePubkey } from "./helpers/nostr.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

await loadSplits();

const app = new Koa();

app.use((ctx, next) => {
  ctx.state.satsToMsats = satsToMsats;
  ctx.state.msatsToSats = msatsToSats;
  ctx.state.isPubkey = isPubkey;
  ctx.state.truncatePubkey = truncatePubkey;
  ctx.state.npubEncode = nip19.npubEncode;
  return next();
});
ejs(app, {
  root: resolve(__dirname, "../views"),
  viewExt: "ejs",
  cache: false,
});

app
  .use(cors({ origin: "*" }))
  .use(koaBody())
  .use(staticFolder(resolve(__dirname, "../public"), { defer: true }));

const miligram = dirname(require.resolve("milligram"));
app.use(mount("/css/milligram", staticFolder(miligram)));

const font = dirname(require.resolve("@fontsource/roboto"));
app.use(mount("/css/font", staticFolder(font)));

// router
const router = new Router();
setupParams(router);
router.use("/webhook", webhookRouter.routes(), webhookRouter.allowedMethods());
router.use(lnurlRouter.routes(), lnurlRouter.allowedMethods());
router.use("/api", apiRouter.routes(), apiRouter.allowedMethods());
router.use("/admin", adminRouter.routes(), adminRouter.allowedMethods());
router.use(publicRouter.routes(), publicRouter.allowedMethods());

app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT || 3000);

// payout splits ever 2 seconds
setInterval(async () => {
  for (const split of getSplits()) {
    await split.payNext();
  }
}, 1000 * 2);

// manually check invoices ever 5 seconds
async function manualCheck() {
  for (const split of getSplits()) {
    await split.manualCheck();
  }
  setTimeout(manualCheck, 1000 * 30);
}
manualCheck();

// save database every 10 seconds
setInterval(() => {
  saveSplits();
  db.write();
}, 1000 * 10);

async function shutdown() {
  await db.write();
  process.exit();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.once("SIGUSR2", shutdown);
