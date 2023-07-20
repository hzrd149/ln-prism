export type LNURLpayRequest = {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: "payRequest";
  commentAllowed?: number;
  nostrPubkey?: string;
  allowsNostr?: true;
};

type MetadataType =
  | "text/plain"
  | "text/long-desc"
  | "image/png;base64"
  | "image/jpeg;base64";
export type LNURLPayMetadata = [MetadataType, string][];
