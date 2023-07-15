import { db } from "../db.js";
import { Split } from "./split.js";

const splits = new Set<Split>();

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
    const split = new Split(json.name, json.domain);
    split.id = json.id;
    split.targets = json.targets;
    split.privateKey = json.privateKey;
    split.invoices = json.invoices;
    split.apiKey = json.apiKey;
    splits.add(split);
    return split;
  }
}

export function saveSplits() {
  db.data.splits = getSplits().map((split) => ({
    id: split.id,
    name: split.name,
    domain: split.domain,
    targets: split.targets,
    payouts: split.payouts,
    invoices: split.invoices,
    privateKey: split.privateKey,
    apiKey: split.apiKey,
  }));
}