import { db } from "../db.js";

export async function isValidAddress(address: string) {
  try {
    const [name, domain] = address.split("@");
    const metadata = await fetch(
      `https://${domain}/.well-known/lnurlp/${name}`
    ).then((res) => res.json());
    if (!metadata.callback) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export function averageFee(address: string) {
  const fees = db.data.addressFees[address] || [];
  return fees.reduce((t, v) => t + v, 0) / fees.length;
}
