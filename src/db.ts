import { resolve, isAbsolute } from "node:path";

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { DB_PATH } from "./env.js";
import { Split } from "./splits.js";
import debug from "debug";

const log = debug('splitter:db');
const file = isAbsolute(DB_PATH) ? DB_PATH : resolve(process.cwd(), DB_PATH);

log(`Using ${file}`);

type Schema = {
  splits: Split[];
  addressFees: Record<string, number[]>;
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = {
  splits: [],
  addressFees: {},
};
const db = new Low(adapter, defaultData);

await db.read();

// ensure all fields are present
db.data.splits = db.data.splits || [];
db.data.addressFees = db.data.addressFees || {};

// load
db.data.splits = db.data.splits.map(
  ({ id, name, domain, targets, privateKey, pending }) => {
    const split = new Split(name, domain);
    split.id = id;
    split.targets = targets;
    split.privateKey = privateKey;
    split.pending = pending;
    return split;
  }
);

export { db };
