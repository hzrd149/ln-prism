const { default: createClient } = await import("openapi-fetch");
import { adminKey, lnbitsUrl } from "../env.js";
import { paths } from "./api.js";

const fixedUrl = lnbitsUrl.replace(/\/$/, "");
console.log(`Using lnbits ${fixedUrl}`);

const lnbits = createClient<paths>({
  baseUrl: fixedUrl,
});

export default lnbits;
