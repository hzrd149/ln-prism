import "dotenv/config";

export const DB_PATH = process.env.DB_PATH || "./splits.json";
export const PORT = process.env.PORT || "3000";

// lnbits
export const LNBITS_URL = process.env.LNBITS_URL;
export const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY;

export const IBEX_EMAIL = process.env.IBEX_EMAIL;
export const IBEX_PASSWORD = process.env.IBEX_PASSWORD;
export const IBEX_DEVELOPER_TOKEN = process.env.IBEX_DEVELOPER_TOKEN;
export const IBEX_ACCOUNT_ID = process.env.IBEX_ACCOUNT_ID;
export const IBEX_URL = process.env.IBEX_URL;

// admin
export const LOGIN_USER = process.env.LOGIN_USER || "admin";
export const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;

// nostr
export const NOSTR_RELAYS = process.env.NOSTR_RELAYS?.split(",") ?? [];
