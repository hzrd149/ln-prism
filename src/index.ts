import "dotenv/config";
import Koa from "koa";
import cors from "@koa/cors";
import ejs from "@koa/ejs";
import { resolve, dirname } from "path";
import staticFolder from "koa-static";
import { koaBody } from "koa-body";
import { fileURLToPath } from "url";
import { router } from "./routes/router.js";

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
  .use(router.routes())
  .use(router.allowedMethods())
  .use(staticFolder(resolve(__dirname, "../public")));

import "./routes/public.js";
import "./routes/helpers.js";
import "./routes/admin.js";

app.listen(3000, "0.0.0.0");

process.on("SIGINT", () => {
  process.exit();
});
process.on("SIGTERM", () => {
  process.exit();
});
