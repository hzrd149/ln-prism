type MetadataType = "text/plain" | "text/long-desc" | "image/png;base64" | "image/jpeg;base64";

export type LNURLPayMetadata = [MetadataType, string][];

export type LNURLPayRequest = {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
  nostrPubkey?: string;
  allowsNostr?: true;
};

const lnurlMetadataCache = new Map<string, LNURLPayRequest>();
export async function getLNURLPMetadata(lnurl: string) {
  const cache = lnurlMetadataCache.get(lnurl);
  if (cache) return cache;

  if (!lnurl.includes("lnurlp://")) throw new Error(`Invalid LNURL ${lnurl}`);

  const url = lnurl.replace("lnurlp://", "https://");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to get lnurl metadata");
  const metadata = (await res.json()) as LNURLPayRequest;

  if (!metadata.callback) throw new Error("LNURL missing callback");

  lnurlMetadataCache.set(lnurl, metadata);

  return metadata;
}

export function lnAddressToLNURLP(address: string) {
  const [name, domain] = address.split("@");
  return `lnurlp://${domain}/.well-known/lnurlp/${name}`;
}

export async function getInvoiceFromLNURL(
  lnurlp: string,
  amount: number,
  { comment, zapRequest }: { comment?: string; zapRequest?: string }
) {
  const metadata = await getLNURLPMetadata(lnurlp);

  if (metadata.minSendable && amount < metadata.minSendable)
    throw new Error(`Amount (${amount}) less than minSendable (${metadata.minSendable})`);
  if (metadata.maxSendable && amount > metadata.maxSendable)
    throw new Error(`Amount (${amount}) greater than maxSendable (${metadata.maxSendable})`);

  const callbackUrl = new URL(metadata.callback);
  callbackUrl.searchParams.append("amount", String(amount));

  if (metadata.commentAllowed && comment) {
    if (comment.length > metadata.commentAllowed) throw new Error("Comment too long");

    callbackUrl.searchParams.append("comment", comment);
  }

  if (metadata.allowsNostr && zapRequest) {
    callbackUrl.searchParams.append("nostr", zapRequest);
  }

  const { pr: payRequest, status, reason } = await fetch(callbackUrl.toString()).then((res) => res.json());

  if (status === "ERROR") throw new Error(reason);

  return payRequest as string;
}
