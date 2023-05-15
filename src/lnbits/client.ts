const { default: createClient } = await import("openapi-fetch");
import { lnbitsUrl } from "../env.js";
import { paths } from "./api.js";

const lnbits = createClient<paths>({
  baseUrl: lnbitsUrl,
});

export default lnbits;
