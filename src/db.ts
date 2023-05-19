import { resolve, isAbsolute } from "node:path";
import { AddressPayout, Split } from "./splits.js";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

if (!process.env.DB_PATH) throw new Error("missing DB_PATH");

// db.json file path
const file = isAbsolute(process.env.DB_PATH)
  ? process.env.DB_PATH
  : resolve(process.cwd(), process.env.DB_PATH);

console.log(`Using ${file}`);

type Schema = {
  splits: Record<string, Split>;
  addressFees: Record<string, number[]>;
  pendingPayouts: AddressPayout[];
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = { splits: {}, addressFees: {}, pendingPayouts: [] };
const db = new Low(adapter, defaultData);

// Read data from JSON file, this will set db.data content
// If JSON file doesn't exist, defaultData is used instead
await db.read();

export { db };
