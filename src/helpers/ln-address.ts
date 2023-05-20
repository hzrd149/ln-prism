import { db } from "../db.js";
import { LNURLpayRequest } from "../types.js";

const addressMetadataCache = new Map<string, LNURLpayRequest>();

export async function getAddressMetadata(
  address: string
): Promise<LNURLpayRequest | undefined> {
  const cache = addressMetadataCache.get(address);
  if (cache) return cache;

  try {
    const [name, domain] = address.split("@");
    const metadata = await fetch(
      `https://${domain}/.well-known/lnurlp/${name}`
    ).then((res) => res.json());

    if (!metadata.callback) return;
    return metadata;
  } catch (e) {}
}

export function averageFee(address: string): number | undefined {
  const fees = db.data.addressFees[address] || [];
  if (fees.length === 0) return;
  const avg = Math.round(fees.reduce((t, v) => t + v, 0) / fees.length);
  return Number.isFinite(avg) ? avg : undefined;
}

export function estimatedFee(address: string) {
  return averageFee(address) ?? 1000;
}
