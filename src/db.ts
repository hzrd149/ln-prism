import { resolve, isAbsolute } from "node:path";
import debug from "debug";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { DB_PATH } from "./env.js";
import type { SplitJson } from "./splits/split.js";
import { nanoid } from "nanoid";

const log = debug("prism:db");
const file = isAbsolute(DB_PATH) ? DB_PATH : resolve(process.cwd(), DB_PATH);

log(`Using ${file}`);

type Schema = {
  splits: SplitJson[];
  addressFees: Record<string, number[]>;
  rootApiKey: string;
  refreshTokens: Record<string, { token: string; expire: string }>;
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = {
  splits: [],
  addressFees: {},
  rootApiKey: nanoid(),
  refreshTokens: {},
};
const db = new Low(adapter, defaultData);

await db.read();

// ensure all fields are present
db.data.splits = db.data.splits || [];
db.data.addressFees = db.data.addressFees || {};
db.data.rootApiKey = db.data.rootApiKey || nanoid();
db.data.refreshTokens = db.data.refreshTokens || {};

export { db };
