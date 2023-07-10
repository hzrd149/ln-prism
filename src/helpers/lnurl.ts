export type LNURLpayRequest = {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
};

export async function getInvoiceFromLNURL(
  lnurl: string,
  amount: number,
  comment?: string
) {
  const metadata = (await fetch(lnurl).then((res) =>
    res.json()
  )) as LNURLpayRequest;

  if (metadata.minSendable && amount < metadata.minSendable)
    throw new Error("Amount less than minSendable");
  if (metadata.maxSendable && amount > metadata.maxSendable)
    throw new Error("Amount greater than maxSendable");

  const callbackUrl = new URL(metadata.callback);
  callbackUrl.searchParams.append("amount", String(amount));

  if (metadata.commentAllowed && comment) {
    if (comment.length > metadata.commentAllowed)
      throw new Error("comment too long");

    callbackUrl.searchParams.append("comment", comment);
  }

  const {
    pr: payRequest,
    status,
    reason,
  } = await fetch(callbackUrl).then((res) => res.json());

  if (status === "ERROR") throw new Error(reason);

  return payRequest as string;
}

export async function getInvoiceFromLNAddress(
  address: string,
  amount: number,
  comment?: string
) {
  let [name, domain] = address.split("@");
  const lnurl = `https://${domain}/.well-known/lnurlp/${name}`;

  return getInvoiceFromLNURL(lnurl, amount, comment);
}
