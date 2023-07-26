import { db } from "./db.js";

export function recordFee(id: string, fee: number) {
  db.data.addressFees[id] = db.data.addressFees[id] || [];
  db.data.addressFees[id].push(Math.max(fee, 0));

  while (db.data.addressFees[id].length > 10) {
    db.data.addressFees[id].shift();
  }
}

export function averageFee(id: string): number | undefined {
  const fees = db.data.addressFees[id] || [];
  if (fees.length === 0) return;
  const avg = Math.round(fees.reduce((t, v) => t + v, 0) / fees.length);
  return Number.isFinite(avg) ? avg : undefined;
}

export function estimatedFee(id: string) {
  return averageFee(id) ?? 1000;
}
