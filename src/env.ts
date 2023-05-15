function missing(env: string) {
  throw new Error(`Missing ${env}`);
  return "";
}

export const walletId = process.env.WALLET_ID || missing("WALLET_ID");
export const adminKey = process.env.ADMIN_KEY || missing("ADMIN_KEY");
export const publicUrl = process.env.PUBLIC_URL || missing("PUBLIC_URL");
export const publicDomain = new URL(publicUrl).hostname;
export const lnbitsUrl = process.env.LNBITS_URL || missing("LNBITS_URL");
