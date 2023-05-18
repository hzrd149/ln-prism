import Router from "@koa/router";
import { PNG } from "pngjs";
import Stream from "node:stream";
import { Ecc, QrCode } from "../lib/qrcodegen.js";

export function drawSvgPath(qr: QrCode, border: number): string {
  if (border < 0) throw new RangeError("Border must be non-negative");
  let parts: Array<string> = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y))
        parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }
  return parts.join(" ");
}

const routes = new Router();

routes.get("qr", "/qr", async (ctx) => {
  let format = (ctx.query.format as string) || "svg";
  let border = parseInt((ctx.query.border as string) ?? "2");
  let qrcode = QrCode.encodeText(ctx.query.data as string, Ecc.MEDIUM);

  if (format === "svg") {
    let lightColor = "white";
    let darkColor = "black";
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
  } else if (format === "png") {
    const scale = 4;
    const image = new PNG({
      width: (qrcode.size + border * 2) * scale,
      height: (qrcode.size + border * 2) * scale,
    });

    for (let i = 0; i < image.data.length; i++) {
      image.data[i] = 0xff;
    }

    // draw modules
    for (let y = 0; y < qrcode.size; y++) {
      for (let x = 0; x < qrcode.size; x++) {
        for (let y2 = 0; y2 < scale; y2++) {
          for (let x2 = 0; x2 < scale; x2++) {
            let ly = (y + border) * scale + y2;
            let lx = (x + border) * scale + x2;
            let idx = (image.width * ly + lx) << 2;

            // set alpha
            image.data[idx + 3] = 0xff;

            // set color
            image.data[idx] =
              image.data[idx + 1] =
              image.data[idx + 2] =
                qrcode.getModule(x, y) ? 0 : 0xff;
          }
        }
      }
    }

    let buffer = PNG.sync.write(image, {});
    ctx.response.set("content-type", "image/png");
    ctx.response.body = buffer;
  }
});

export default routes;
