import { resolve, isAbsolute } from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { DB_PATH } from "./env.js";
import { nanoid } from "nanoid";
import { IncomingPayment, Split } from "./splits/split.js";
import { appDebug } from "./debug.js";
import { OutgoingPayment } from "./splits/targets/target.js";
import { Event, generatePrivateKey } from "nostr-tools";

const log = appDebug.extend("db");
const file = isAbsolute(DB_PATH) ? DB_PATH : resolve(process.cwd(), DB_PATH);

log(`Using ${file}`);

type Schema = {
  splits: ReturnType<Split["toJSON"]>[];
  addressFees: Record<string, number[]>;
  privateKey: string;
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
  privateKey: generatePrivateKey(),
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
db.data.splits = db.data.splits || defaultData.splits;
db.data.incoming = db.data.incoming || defaultData.incoming;
db.data.outgoing = db.data.outgoing || defaultData.outgoing;
db.data.nostrCache = db.data.nostrCache || defaultData.nostrCache;
db.data.privateKey = db.data.privateKey || defaultData.privateKey;
db.data.rootApiKey = db.data.rootApiKey || defaultData.rootApiKey;
db.data.addressFees = db.data.addressFees || defaultData.addressFees;
db.data.refreshTokens = db.data.refreshTokens || defaultData.refreshTokens;

export { db };
