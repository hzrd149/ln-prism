import { resolve, isAbsolute } from "node:path";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { DB_PATH } from "./env.js";

const file = isAbsolute(DB_PATH) ? DB_PATH : resolve(process.cwd(), DB_PATH);

console.log(`Using ${file}`);

export type SplitTarget = {
  address: string;
  weight: number;
};
export type Split = {
  name: string;
  payouts: SplitTarget[];
};
export type AddressPayout = {
  address: string;
  split: string;
  amount: number;
  weight: number;
  comment?: string;
  failed?: string;
};

type Schema = {
  splits: Record<string, Split>;
  addressFees: Record<string, number[]>;
  pendingPayouts: AddressPayout[];
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = { splits: {}, addressFees: {}, pendingPayouts: [] };
const db = new Low(adapter, defaultData);

await db.read();

// ensure all fields are present
db.data.splits = db.data.splits || {};
db.data.addressFees = db.data.addressFees || {};
db.data.pendingPayouts = db.data.pendingPayouts || [];

export { db };
