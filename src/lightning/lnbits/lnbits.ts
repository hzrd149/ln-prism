import debug from "debug";
import { createHash } from "node:crypto";
import { msatsToSats } from "../../helpers/sats.js";
import { LightningBackend } from "../type.js";

export default class LNBitsBackend implements LightningBackend {
  url: string;
  adminKey: string;

  constructor(url: string, adminKey: string) {
    this.url = url;
    this.adminKey = adminKey;
  }

  private log = debug("splitter:lnbits");
  private request<T = any>(url: string, opts?: RequestInit) {
    return fetch(new URL(url, this.url), {
      ...opts,
      headers: {
        ...opts?.headers,
        "X-Api-Key": this.adminKey,
      },
    }).then((res) => {
      if (res.headers.get("content-type") === "application/json")
        return res.json() as Promise<T>;
      else throw new Error("Expected JSON");
    });
  }

  async setup() {
    const result = await this.request("/api/v1/wallet");

    this.log(
      `Connected to wallet "${result.name}" with ${msatsToSats(
        result.balance
      )} sats`
    );
  }

  async createInvoice(
    amount: number,
    description: string = "",
    webhook?: string
  ) {
    const hash = createHash("sha256");
    hash.update(description);

    const encoder = new TextEncoder();
    const view = encoder.encode(description);
    const unhashedDescription = Buffer.from(view).toString("hex");

    const result = await this.request("/api/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        out: false,
        amount: msatsToSats(amount), //convert amount to sats, since LNBits only takes sats
        memo: "invoice",
        internal: false,
        description_hash: hash.digest("hex"),
        unhashed_description: unhashedDescription,
        webhook,
      }),
      headers: { "content-type": "application/json" },
    });

    if (result.detail !== undefined)
      throw new Error("Failed to create invoice: " + result.detail);

    return {
      paymentHash: result.payment_hash as string,
      paymentRequest: result.payment_request as string,
    };
  }

  async payInvoice(bolt11: string) {
    const result = await this.request("/api/v1/payments", {
      method: "POST",
      body: JSON.stringify({
        out: true,
        bolt11,
      }),
      headers: { "content-type": "application/json" },
    });

    if (result.detail !== undefined)
      throw new Error("Failed to pay invoice: " + result.detail);

    const paymentDetails = await this.request(
      `/api/v1/payments/${result.payment_hash}`
    );

    return {
      paymentHash: result.payment_hash as string,
      fee: paymentDetails.details.fee as number,
    };
  }
}
