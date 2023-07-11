import { LightningBackend } from "../type.js";

export class IBEXHub implements LightningBackend {
  baseUrl: string = "https://ibexhub.ibexmercado.com";
  private accessToken: string = "";
  accessTokenExpiry: Date;
  private refreshToken: string;
  accountId: string;

  constructor(refreshToken: string, accountId: string) {
    this.refreshToken = refreshToken;
    this.accountId = accountId;
  }

  async setup() {
    this.getAccessToken();
  }

  private async request<T = any>(url: string, opts?: RequestInit) {
    return fetch(new URL(url, this.baseUrl), {
      ...opts,
      headers: {
        ...opts?.headers,
        "Content-Type": "application/json",
        Authorization: await this.getAccessToken(),
      },
    }).then((res) => {
      if (res.headers.get("content-type") === "application/json")
        return res.json() as Promise<T>;
      else throw new Error("Expected JSON");
    });
  }

  private async getAccessToken() {
    if (this.accessToken) return this.accessToken;

    this.accessToken = await this.request("/auth/refresh-access-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
  }

  async createInvoice(amount: number, description?: string, webhook?: string) {
    const result = await this.request("/v2/invoice/add", {
      method: "POST",
      body: JSON.stringify({
        amount,
        accountId: this.accountId,
        memo: description,
        webhookUrl: webhook,
      }),
    });

    return {
      paymentRequest: result.invoice.bolt11 as string,
      paymentHash: result.invoice.hash as string,
    };
  }

  async payInvoice(invoice: string) {
    const result = await this.request("/v2/invoice/pay", {
      method: "POST",
      body: JSON.stringify({
        bolt11: invoice,
        accountId: this.accountId,
      }),
    });

    return {
      paymentHash: result.transaction.payment.hash as string,
      fee: result.transaction.payment.feeMsat as number,
    };
  }
}
