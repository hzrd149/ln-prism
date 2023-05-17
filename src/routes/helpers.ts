import { drawSvgPath } from "../helpers/qrcode.js";
import { Ecc, QrCode } from "../lib/qrcodegen.js";
import { router } from "./router.js";

router.get("/qr", async (ctx) => {
  let lightColor = "white";
  let darkColor = "black";
  let border = 2;
  let qrcode = QrCode.encodeText(ctx.query.data as string, Ecc.MEDIUM);
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
