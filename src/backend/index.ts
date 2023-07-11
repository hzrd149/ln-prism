import {
  IBEX_ACCOUNT_ID,
  IBEX_DEVELOPER_TOKEN,
  IBEX_EMAIL,
  IBEX_PASSWORD,
  IBEX_URL,
  LNBITS_ADMIN_KEY,
  LNBITS_URL,
} from "../env.js";
import { IBEXBackend } from "./ibex/ibex.js";
import LNBitsBackend from "./lnbits/lnbits.js";
import { LightningBackend } from "./type.js";

function createBackend() {
  if (LNBITS_URL && LNBITS_ADMIN_KEY) {
    return new LNBitsBackend(LNBITS_URL, LNBITS_ADMIN_KEY);
  }

  if (IBEX_EMAIL && IBEX_PASSWORD && IBEX_ACCOUNT_ID) {
    const ibex = new IBEXBackend(IBEX_ACCOUNT_ID, {
      email: IBEX_EMAIL,
      password: IBEX_PASSWORD,
    });
    if (IBEX_URL) ibex.baseUrl = IBEX_URL;

    return ibex;
  }
  if (IBEX_DEVELOPER_TOKEN && IBEX_ACCOUNT_ID) {
    const ibex = new IBEXBackend(IBEX_ACCOUNT_ID, {
      refreshToken: IBEX_DEVELOPER_TOKEN,
    });
    if (IBEX_URL) ibex.baseUrl = IBEX_URL;

    return ibex;
  }

  throw new Error("No lightning backend configured");
}

const lightning: LightningBackend = createBackend();
await lightning.setup();

export { lightning };
