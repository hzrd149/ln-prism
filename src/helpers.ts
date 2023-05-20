export function satsToMsats(sats: number) {
  return sats * 1000;
}
export function msatsToSats(msats: number) {
  return Math.round(msats / 1000);
}
export function roundToSats(msats: number) {
  return Math.round(msats / 1000) * 1000;
}
