import debug from "debug";
import { db } from "../db.js";
import { Split } from "./split.js";
import { appDebug } from "../debug.js";

const splits = new Set<Split>();

const log = appDebug.extend("splits");

export function getSplits() {
  return Array.from(splits);
}

export async function createSplit(
  name: string,
  domain: string,
  privateKey?: string
) {
  const split = new Split(name, domain, privateKey);

  if (getSplitByName(name, domain)) {
    throw new Error("A split with that name already exists");
  }

  splits.add(split);
  return split;
}
export async function removeSplit(id: string) {
  const split = getSplitById(id);
  if (split) splits.delete(split);
}

export function getSplitById(splitId: string) {
  return getSplits().find((s) => s.id === splitId);
}
export function getSplitByName(name: string, domain: string) {
  return getSplits().find((s) => s.name === name && s.domain === domain);
}

export function loadSplits() {
  for (const json of db.data.splits) {
    const split = Split.fromJSON(json);
    splits.add(split);
  }

  log(`Loaded ${splits.size} splits from db`);
}

export function saveSplits() {
  db.data.splits = getSplits().map((split) => split.toJSON());
}
