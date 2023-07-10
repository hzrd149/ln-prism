import { SimplePool } from "nostr-tools";
import WebSocket from "ws";
// @ts-ignore
global.WebSocket = WebSocket;

export const relayPool = new SimplePool();

export async function connect(relays: string[]) {
  for (const url of relays) {
    await relayPool.ensureRelay(url);
  }
}
