import { db } from "./db.js";

export function recordFee(address: string, fee: number) {
  db.data.addressFees[address] = db.data.addressFees[address] || [];
  db.data.addressFees[address].push(Math.max(fee, 0));

  while (db.data.addressFees[address].length > 10) {
    db.data.addressFees[address].shift();
  }
}

export function averageFee(address: string): number | undefined {
  const fees = db.data.addressFees[address] || [];
  if (fees.length === 0) return;
  const avg = Math.round(fees.reduce((t, v) => t + v, 0) / fees.length);
  return Number.isFinite(avg) ? avg : undefined;
}

export function estimatedFee(address: string) {
  return averageFee(address) ?? 1000;
}
