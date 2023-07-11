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

import { publicRouter } from "./routes/public/index.js";
import { adminRouter } from "./routes/admin/index.js";
import { apiRouter } from "./routes/api/index.js";
import { lnurlRouter } from "./routes/lnurl.js";
import { setupParams } from "./routes/params.js";
import { webhookRouter } from "./routes/webhooks.js";

import { PORT } from "./env.js";
import { db } from "./db.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Koa();

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

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (401 == err.status) {
      ctx.status = 401;
      ctx.set("WWW-Authenticate", "Basic");

      if (ctx.accepts(["html", "json"]) == "html") {
        ctx.body = "cant haz that";
      } else {
        ctx.body = {
          success: false,
          status: err.status,
          message: "cant haz that",
        };
      }
    } else {
      if (Object.getPrototypeOf(err) === Error) {
        console.log(err);
      }
      ctx.status = err.statusCode || err.status || 500;

      if (ctx.accepts(["html", "json"]) == "html")
        return ctx.render("error", { error: err });
      else
        ctx.body = { success: false, status: err.status, message: err.message };
    }
  }
});

// router
const router = new Router();
setupParams(router);
router.use(publicRouter.routes(), publicRouter.allowedMethods());
router.use(webhookRouter.routes(), webhookRouter.allowedMethods());
router.use(lnurlRouter.routes(), lnurlRouter.allowedMethods());
router.use(adminRouter.routes(), adminRouter.allowedMethods());
router.use(apiRouter.routes(), apiRouter.allowedMethods());

app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT);

// payout splits ever 2 seconds
setInterval(async () => {
  for (const split of db.data.splits) {
    await split.payNext();
  }
}, 1000 * 2);

// manually check invoices ever 5 seconds
async function manualCheck() {
  for (const split of db.data.splits) {
    await split.manualCheck();
  }
  setTimeout(manualCheck, 1000 * 10);
}
manualCheck();

// save database every 10 seconds
setInterval(() => {
  db.write();
}, 1000 * 10);

async function shutdown() {
  await db.write();
  process.exit();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.once("SIGUSR2", shutdown);
