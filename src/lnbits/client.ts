const { default: createClient } = await import("openapi-fetch");
import { ADMIN_KEY, LNBITS_URL } from "../env.js";
import { paths } from "./api.js";

const fixedUrl = LNBITS_URL.replace(/\/$/, "");

const lnbits = createClient<paths>({
  baseUrl: fixedUrl,
});

const { data: details } = await lnbits.get("/api/v1/wallet", {
  headers: { "X-Api-Key": ADMIN_KEY },
  // @ts-ignore
  body: undefined,
});

// @ts-ignore
console.log(`Using wallet ${details.id} from lnbits at ${fixedUrl}`);

export default lnbits;
