import { resolve, isAbsolute } from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { DB_PATH } from "./env.js";
import { nanoid } from "nanoid";
import { IncomingPayment, Split } from "./splits/split.js";
import { appDebug } from "./debug.js";
import { OutgoingPayment } from "./splits/targets/target.js";
import { Event } from "nostr-tools";

const log = appDebug.extend("db");
const file = isAbsolute(DB_PATH) ? DB_PATH : resolve(process.cwd(), DB_PATH);

log(`Using ${file}`);

type Schema = {
  splits: ReturnType<Split["toJSON"]>[];
  addressFees: Record<string, number[]>;
  rootApiKey: string;
  refreshTokens: Record<string, { token: string; expire: number }>;
  incoming: IncomingPayment[];
  outgoing: OutgoingPayment[];
  nostrCache: Record<string, Event>;
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = {
  splits: [],
  addressFees: {},
  rootApiKey: nanoid(),
  refreshTokens: {},
  incoming: [],
  outgoing: [],
  nostrCache: {},
};
const db = new Low(adapter, defaultData);

await db.read();

log("Loaded");

// ensure all fields are present
db.data.splits = db.data.splits || [];
db.data.incoming = db.data.incoming || [];
db.data.outgoing = db.data.outgoing || [];
db.data.nostrCache = db.data.nostrCache || {};
db.data.addressFees = db.data.addressFees || {};
db.data.rootApiKey = db.data.rootApiKey || nanoid();
db.data.refreshTokens = db.data.refreshTokens || {};

export { db };
