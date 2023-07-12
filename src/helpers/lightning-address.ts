import { LNURLpayRequest } from "../types.js";

const addressMetadataCache = new Map<string, LNURLpayRequest>();

export async function getAddressMetadata(
  address: string
): Promise<LNURLpayRequest | undefined> {
  const cache = addressMetadataCache.get(address);
  if (cache) return cache;

  try {
    const [name, domain] = address.split("@");
    const res = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
    if (!res.ok) throw new Error("failed to get address metadata");
    const metadata = await res.json();

    if (!metadata.callback) return;
    return metadata;
  } catch (e) {}
}
