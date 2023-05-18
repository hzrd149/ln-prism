function missing(env: string) {
  throw new Error(`Missing ${env}`);
  return "";
}

export const walletId = process.env.WALLET_ID || missing("WALLET_ID");
export const adminKey = process.env.ADMIN_KEY || missing("ADMIN_KEY");
export const lnbitsUrl = process.env.LNBITS_URL || missing("LNBITS_URL");
export const loginUser = process.env.LOGIN_USER;
export const loginPassword = process.env.LOGIN_PASSWORD;
