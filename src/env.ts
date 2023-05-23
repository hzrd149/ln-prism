import "dotenv/config";

function missing(env: string) {
  throw new Error(`Missing ${env}`);
  return "";
}

export const DB_PATH = process.env.DB_PATH || missing("DB_PATH");
export const PORT = process.env.PORT || "3000";
export const WALLET_ID = process.env.WALLET_ID || missing("WALLET_ID");
export const ADMIN_KEY = process.env.ADMIN_KEY || missing("ADMIN_KEY");
export const LNBITS_URL = process.env.LNBITS_URL || missing("LNBITS_URL");
export const LOGIN_USER = process.env.LOGIN_USER || "admin";
export const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
