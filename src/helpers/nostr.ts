export function truncatePubkey(pubkey: string) {
  return pubkey.substring(0, 6) + "..." + pubkey.substring(pubkey.length - 4);
}
