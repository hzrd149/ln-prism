import { resolve, isAbsolute } from "node:path";
import { Split } from "./splits.js";

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
};

// Configure lowdb to write data to JSON file
const adapter = new JSONFile<Schema>(file);
const defaultData: Schema = { splits: {} };
const db = new Low(adapter, defaultData);

// Read data from JSON file, this will set db.data content
// If JSON file doesn't exist, defaultData is used instead
await db.read();

export async function saveSplit(split: Split) {
  db.data.splits[split.id] = split;
  await db.write();
}
export async function loadSplit(id: string) {
  return db.data.splits[id] as Split | undefined;
}
export async function deleteSplit(id: string) {
  delete db.data.splits[id];
  await db.write();
}
export async function listSplits() {
  return Array.from(Object.values(db.data.splits));
}
