import { nip19 } from "nostr-tools";
import { nanoid } from "nanoid";
import { BadRequestError } from "../helpers/errors.js";
import { getAddressMetadata } from "../helpers/lightning-address.js";
import { getSingleEvent } from "../relays.js";
import { NOSTR_RELAYS } from "../env.js";

async function getTargetFromNpub(npub: string) {
  const parsed = nip19.decode(npub);
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

  if (!kind0) throw new Error("Failed to find pubkey metadata");

  const metadata = JSON.parse(kind0.content);
  if (!metadata.lud16)
    throw new Error("pubkey missing lightning address (lud16)");

  return {
    pubkey,
    address: metadata.lud16 as string,
  };
}
async function getTargetFromLNAddress(address: string) {
  const metadata = await getAddressMetadata(address);
  if (!metadata) throw new BadRequestError(`Unreachable address ${address}`);

  return { address };
}

type TargetJSON = {
  id: string;
  address: string;
  pubkey?: string;
  weight: number;
};

export default class Target {
  id: string;
  address: string;
  pubkey?: string | undefined;
  weight: number;

  constructor() {
    this.id = nanoid();
  }

  get npub() {
    return this.pubkey && nip19.npubEncode(this.pubkey);
  }
  get input() {
    if (this.pubkey) return this.npub;
    return this.address;
  }

  async update(input: string, weight?: number) {
    if (weight !== undefined) this.weight = weight;

    if (input.startsWith("npub1")) {
      const { address, pubkey } = await getTargetFromNpub(input);
      this.address = address;
      this.pubkey = pubkey;
    } else if (input.split("@").length === 2) {
      const { address } = await getTargetFromLNAddress(input);
      this.address = address;
      this.pubkey = undefined;
    }
  }

  toJSON(): TargetJSON {
    return {
      id: this.id,
      address: this.address,
      pubkey: this.pubkey,
      weight: this.weight,
    };
  }

  static fromJSON(json: TargetJSON) {
    const target = new Target();
    target.id = json.id;
    target.address = json.address;
    target.pubkey = json.pubkey;
    target.weight = json.weight;
    return target;
  }

  static async fromInput(input: string, weight: number) {
    const target = new Target();
    await target.update(input, weight);
    return target;
  }
}
