import { ADMIN_KEY, LNBITS_URL } from "../../env.js";
import LNBitsBackend from "./lnbits.js";

const lnbits = new LNBitsBackend(LNBITS_URL, ADMIN_KEY);

export default lnbits;