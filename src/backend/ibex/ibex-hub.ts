import { InvoiceStatus, LightningBackend } from "../type.js";
import { msatsToSats } from "../../helpers/sats.js";
import { db } from "../../db.js";
import { appDebug } from "../../debug.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

export type AuthData = {
  email?: string;
  password?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
};

export class IBEXHubBackend implements LightningBackend {
  baseUrl: string = "https://ibexhub.ibexmercado.com";
  accountId: string;

  auth: AuthData;
  private log = appDebug.extend("ibex");

  constructor(accountId: string, auth: AuthData) {
    this.accountId = accountId;
    this.auth = auth;
  }

  async setup() {
    // attempt to load the refresh token from the db
    if (db.data.refreshTokens[this.baseUrl]) {
      this.auth.refreshToken = db.data.refreshTokens[this.baseUrl].token;
      this.auth.refreshTokenExpiresAt = db.data.refreshTokens[this.baseUrl].expire;
      this.log("Loaded refresh token from db");
    }

    const result = await this.requestWithAuth(`/v2/account/${this.accountId}`);

    this.log(`Connected to IBEX account "${result.name}" with ${msatsToSats(result.balance)} sats`);
  }

  private async request<T extends Object = any>(url: string, init?: RequestInit) {
    const fullUrl = new URL(url, this.baseUrl);
    const headers = {
      ...init?.headers,
      Accept: "application/json",
      "User-Agent": "NodeJS",
    };

    if (init.body) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(fullUrl, {
      ...init,
      headers,
    }).then(async (res) => {
      if (res.status === 401) {
        await this.resetAccessToken();
        throw new Error("IBEX: got 401, clearing access token");
      }

      if (res.headers.get("content-type").includes("application/json")) {
        const json: T | { Error: string } = await res.json();

        if (Object.hasOwn(json, "Error") || Object.hasOwn(json, "error")) {
          //@ts-ignore
          throw new Error(`IBEX API: ${json.Error || json.error}`);
        }

        return json as T;
      } else {
        throw new Error(`Expected JSON but got ${res.headers.get("content-type")}`);
      }
    });
  }

  private async requestWithAuth<T extends Object = any>(url: string, init?: RequestInit) {
    if (!this.accessToken) await this.refreshAccessToken();

    return this.request<T>(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: this.accessToken,
      },
    });
  }

  get accessToken(): string | undefined {
    return this.auth.accessTokenExpiresAt < dayjs().utc().unix() ? undefined : this.auth.accessToken;
  }
  get refreshToken(): string | undefined {
    return this.auth.refreshTokenExpiresAt < dayjs().utc().unix() ? undefined : this.auth.refreshToken;
  }

  private async resetAccessToken() {
    this.auth.accessToken = null;
    this.auth.accessTokenExpiresAt = null;
  }
  private async refreshAccessToken() {
    // refresh token expired or login again
    if (!this.refreshToken) {
      if (!this.auth.email || !this.auth.password) throw new Error("Missing email and password");

      const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = await this.request(
        "/auth/signin",
        {
          method: "POST",
          body: JSON.stringify({
            email: this.auth.email,
            password: this.auth.password,
          }),
        }
      );

      this.log("Got access and refresh tokens");
      this.auth.accessToken = accessToken;
      this.auth.accessTokenExpiresAt = accessTokenExpiresAt as number;
      this.auth.refreshToken = refreshToken;
      this.auth.refreshTokenExpiresAt = refreshTokenExpiresAt as number;

      // save refresh token to db
      db.data.refreshTokens[this.baseUrl] = {
        token: this.auth.refreshToken,
        expire: this.auth.refreshTokenExpiresAt,
      };
      this.log("Saved refresh token to db");

      return this.accessToken;
    }

    // accessToken missing or expired
    if (!this.accessToken) {
      const result = await this.request("/auth/refresh-access-token", {
        method: "POST",
        body: JSON.stringify({ refreshToken: this.auth.refreshToken }),
      });

      this.log("Got new access token");
      this.auth.accessToken = result.accessToken as string;
      this.auth.accessTokenExpiresAt = result.expiresAt;
    }

    return this.accessToken;
  }

  async createInvoice(amount: number, description?: string, webhook?: string) {
    const result = await this.requestWithAuth("/invoice/add", {
      method: "POST",
      body: JSON.stringify({
        amountMsat: amount,
        accountId: this.accountId,
        descPrehash: description,
        webhookUrl: webhook,
        expiration: 120,
      }),
    });

    return {
      paymentRequest: result.bolt11 as string,
      paymentHash: result.hash as string,
    };
  }

  async payInvoice(invoice: string) {
    const result = await this.requestWithAuth("/v2/invoice/pay", {
      method: "POST",
      body: JSON.stringify({
        bolt11: invoice,
        accountId: this.accountId,
      }),
    });

    return {
      paymentHash: result.transaction.payment.hash as string,
      fee: result.transaction.networkFee as number,
    };
  }

  async getInvoiceStatus(hash: string) {
    const result = await this.requestWithAuth(`/invoice/from-hash/${hash}`);

    switch (result.state.name) {
      case "CANCEL":
        return InvoiceStatus.EXPIRED;
      case "SETTLED":
        return InvoiceStatus.PAID;
      default:
      case "OPEN":
        return InvoiceStatus.PENDING;
    }
  }
}
