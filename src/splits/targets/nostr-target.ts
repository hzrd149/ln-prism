import { finishEvent, nip19, nip57 } from "nostr-tools";
import { getUserKind0 } from "../../relays.js";
import { NOSTR_RELAYS } from "../../env.js";
import { BadRequestError } from "../../helpers/errors.js";
import { getInvoiceFromLNURL, getLNURLPMetadata, lnAddressToLNURLP } from "../../helpers/lnurl.js";
import Target, { OutgoingPayment } from "./target.js";
import { msatsToSats, roundToSats, satsToMsats } from "../../helpers/sats.js";
import { lightning } from "../../backend/index.js";
import { estimatedFee, recordFee } from "../../fees.js";
import { db } from "../../db.js";
import { isPubkey } from "../../helpers/regexp.js";

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
    return this.profile.name || this.profile.displayName || this.address || this.lnurlp || this.pubkey;
  }
  get link() {
    return `nostr:${this.npub}`;
  }
  get lnurlp() {
    if (!this.profile) throw new Error("No loaded yet");
    return this.profile.lud16 ? lnAddressToLNURLP(this.profile.lud16) : this.profile.lud06;
  }
  get address() {
    return this.profile?.lud16;
  }
  get npub() {
    return nip19.npubEncode(this.pubkey);
  }

  private getZaperPrivateKey() {
    // use the splits private key only if the nostr profile is enabled
    return this.parentSplit.enableNostrProfile ? this.parentSplit.privateKey : db.data.privateKey;
  }
  private get canZap() {
    return this.pubkey && this.parentSplit.enableNostrZaps && this.getZaperPrivateKey();
  }

  async getMinSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata?.minSendable ?? 0;
  }
  async getMaxSendable() {
    const metadata = await getLNURLPMetadata(this.lnurlp);
    return metadata.maxSendable ?? satsToMsats(500000); // 500,000 sats
  }
  async getMaxComment(): Promise<number | undefined> {
    if (this.canZap) {
      return 4096;
    } else {
      const metadata = await getLNURLPMetadata(this.lnurlp);
      return metadata.commentAllowed ?? undefined;
    }
  }
  getEstimatedFee() {
    return estimatedFee(this.lnurlp);
  }
  async getInvoice(amount: number, comment?: string, identifier?: string): Promise<string> {
    if (this.canZap) {
      this.log(`Creating zap request to ${this.pubkey}`);

      const link = identifier && isPubkey.test(identifier) ? `nostr:${nip19.npubEncode(identifier)}` : identifier;

      const event = nip57.makeZapRequest({
        profile: this.pubkey,
        event: null,
        amount,
        comment: [link && `From ${link}`, comment].filter(Boolean).join(" ").trim(),
        relays: NOSTR_RELAYS,
      });

      const zapRequest = finishEvent(event, this.getZaperPrivateKey());

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

    const kind0 = await getUserKind0(NOSTR_RELAYS, pubkey);

    if (!kind0) throw new Error("Failed to find pubkey profile");

    const profile = JSON.parse(kind0.content) as ParsedKind0;
    const lnurlp = profile.lud16 ? lnAddressToLNURLP(profile.lud16) : profile.lud06;

    if (!lnurlp) throw new Error("pubkey missing lightning address (lud16 or lud06)");

    const metadata = await getLNURLPMetadata(lnurlp);
    if (!metadata) throw new BadRequestError(`Unreachable LNURLP ${input}`);

    this.input = input;
    this.pubkey = pubkey;
    this.profile = profile;
  }

  async payPending(payout: OutgoingPayment) {
    // payout amount - estimated fees and round to the nearest sat (since most LN nodes don't support msats)
    const estFee = this.getEstimatedFee();
    const amount = roundToSats(payout.amount - estFee);

    this.log(`Sending ${msatsToSats(amount)} sats (fee: ${msatsToSats(estFee, true)})`);

    const payRequest = await this.getInvoice(amount, payout.comment, payout.identifier);
    const { fee } = await lightning.payInvoice(payRequest);

    this.log(`Sent ${msatsToSats(amount)} sats with fee: ${msatsToSats(fee, true)}`);

    recordFee(this.lnurlp, fee);
  }

  static isNostrTarget(target: Target): target is NostrTarget {
    return target.type === "nostr";
  }
}
