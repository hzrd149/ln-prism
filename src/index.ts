import { fileURLToPath } from "url";
import Koa from "koa";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import { resolve, dirname } from "path";
import staticFolder from "koa-static";
import mount from "koa-mount";
import { koaBody } from "koa-body";
import publicRoutes from "./routes/public.js";
import helperRoutes from "./routes/helpers.js";
import adminRoutes from "./routes/admin.js";
import lnurlRoutes from "./routes/lnurl.js";
import { setupParams } from "./routes/params.js";
import webhookRoutes from "./routes/webhooks.js";
import Router from "@koa/router";
import { payNextPayout } from "./splits.js";
import { db } from "./db.js";
import { createRequire } from "node:module";
import { PORT } from "./env.js";

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
      ctx.body = "cant haz that";
    } else {
      ctx.status = err.statusCode || err.status || 500;
      ctx.render("error", { error: err });
    }
  }
});

// router
const router = new Router();
setupParams(router);
router.use(publicRoutes.routes(), publicRoutes.allowedMethods());
router.use(helperRoutes.routes(), helperRoutes.allowedMethods());
router.use(lnurlRoutes.routes(), lnurlRoutes.allowedMethods());
router.use(adminRoutes.routes(), adminRoutes.allowedMethods());
router.use(webhookRoutes.routes(), webhookRoutes.allowedMethods());

app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT);

// payout splits ever 2 seconds
setInterval(async () => {
  await payNextPayout();
}, 1000 * 2);

// save database every 10 seconds
setInterval(() => {
  db.write();
}, 1000 * 10);

async function shutdown() {
  console.log("saving database");
  await db.write();
  process.exit();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.once("SIGUSR2", shutdown);
