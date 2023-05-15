type MetadataType =
  | "text/plain"
  | "text/long-desc"
  | "image/png;base64"
  | "image/jpeg;base64";
export type LNURLPayMetadata = [MetadataType, string][];
