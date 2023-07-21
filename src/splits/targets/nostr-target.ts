import { finishEvent, nip19, nip57 } from "nostr-tools";
import { getSingleEvent } from "../../relays.js";
import { NOSTR_RELAYS } from "../../env.js";
import { BadRequestError } from "../../helpers/errors.js";
import {
  getInvoiceFromLNURL,
  getLNURLPMetadata,
  lnAddressToLNURLP,
} from "../../helpers/lnurl.js";
import Target, { OutgoingPayment } from "./target.js";
import { msatsToSats, roundToSats, satsToMsats } from "../../helpers/sats.js";
import { lightning } from "../../backend/index.js";
import { averageFee, recordFee } from "../../fees.js";

export type ParsedKind0 = {
  name?: string;
  displayName?: string;
  picture?: string;
  lud16?: string;
  lud06?: string;
};

export default class NostrTarget extends Target {
  type = "nostr";

  pubkey?: string | undefined;
  profile?: ParsedKind0;

  get displayName() {
    return (
      this.profile.name ||
      this.profile.displayName ||
      this.address ||
      this.lnurlp ||
      this.pubkey
    );
  }
  get link() {
    return `nostr:${nip19.npubEncode(this.pubkey)}`;
  }
  get lnurlp() {
    if (!this.profile) throw new Error("No loaded yet");
    return this.profile.lud16
      ? lnAddressToLNURLP(this.profile.lud16)
      : this.profile.lud06;
  }
  get address() {
    return this.profile?.lud16;
  }

  async getMinSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata?.minSendable ?? 0;
  }
  async getMaxSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata.maxSendable ?? satsToMsats(500000); // 500,000 sats
  }
  getAverageFee() {
    return averageFee(this.lnurlp);
  }
  async getInvoice(
    amount: number,
    comment?: string,
    identifier?: string
  ): Promise<string> {
    const pubkey = identifier;

    if (pubkey && this.parentSplit.enableNostr && this.parentSplit.privateKey) {
      // const relays = parsed.tags.find((t) => t[0] === "relays").slice(1);

      this.log(`Creating zap request to ${pubkey}`);

      const event = nip57.makeZapRequest({
        profile: pubkey,
        event: null,
        amount,
        comment: `Zap from ${this.link} ${comment || ""}`.trim(),
        relays: NOSTR_RELAYS,
      });

      const zapRequest = finishEvent(event, this.parentSplit.privateKey);

      return await getInvoiceFromLNURL(this.lnurlp, amount, {
        zapRequest: JSON.stringify(zapRequest),
      });
    } else {
      return await getInvoiceFromLNURL(this.lnurlp, amount, { comment });
    }
  }

  async setInput(input: string): Promise<void> {
    const parsed = nip19.decode(input);
    let pubkey: string;
    switch (parsed.type) {
      case "npub":
        pubkey = parsed.data;
        break;
      case "nprofile":
        pubkey = parsed.data.pubkey;
        break;
      default:
        throw new BadRequestError(`Unknown NIP-19 type ${parsed.type}`);
    }

    const kind0 = await getSingleEvent(NOSTR_RELAYS, {
      authors: [pubkey],
      kinds: [0],
    });

    if (!kind0) throw new Error("Failed to find pubkey profile");

    const profile = JSON.parse(kind0.content) as ParsedKind0;
    const lnurlp = profile.lud16
      ? lnAddressToLNURLP(profile.lud16)
      : profile.lud06;

    if (!lnurlp)
      throw new Error("pubkey missing lightning address (lud16 or lud06)");

    const metadata = await getLNURLPMetadata(lnurlp);
    if (!metadata) throw new BadRequestError(`Unreachable LNURLP ${input}`);

    this.input = input;
    this.pubkey = pubkey;
    this.profile = profile;
  }

  async payPending(payout: OutgoingPayment) {
    // payout amount - estimated fees and round to the nearest sat (since most LN nodes don't support msats)
    const estFee = this.getAverageFee() ?? 1000;
    const amount = roundToSats(payout.amount - estFee);

    this.log(
      `Sending ${msatsToSats(amount)} sats (estimated fee: ${estFee / 1000})`
    );

    const payRequest = await this.getInvoice(
      amount,
      payout.comment,
      payout.identifier
    );
    const { fee } = await lightning.payInvoice(payRequest);

    this.log(`Paid invoice (fee: ${fee / 1000})`);

    recordFee(this.lnurlp, fee);
  }

  static isNostrTarget(target: Target): target is NostrTarget {
    return target.type === "nostr";
  }
}
