import LNURLPTarget from "./lnurlp-target.js";
import NostrTarget from "./nostr-target.js";
import Target from "./target.js";

export function getTargetType(type: string): typeof Target {
  switch (type) {
    case "lnurlp":
      return LNURLPTarget;
    case "nostr":
      return NostrTarget;
    default:
      throw new Error(`Unknown target type ${type}`);
  }
}
