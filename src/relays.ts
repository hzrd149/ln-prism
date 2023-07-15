import { Event, Relay, relayInit } from "nostr-tools";
import WebSocket from "ws";
// @ts-ignore
global.WebSocket = WebSocket;

const relayCache = new Map<string, Relay>();
function getRelays(urls: string[]) {
  const arr: Relay[] = [];
  for (const url of urls) {
    let relay = relayCache.get(url);
    if (!relay) {
      relay = relayInit(url);
      relayCache.set(url, relay);
    }

    arr.push(relay);
  }

  return arr;
}

export async function connect(urls: string[]) {
  const relays = await getRelays(urls);

  for (const relay of relays) {
    if (relay.status !== WebSocket.OPEN) {
      await relay.connect();
    }
  }
}

export async function publish(urls: string[], event: Event) {
  const relays = await getRelays(urls);

  for (const relay of relays) {
    const pub = await relay.publish(event);

    pub.on("failed", (message) => {
      console.log(`Failed to publish (${relay.url}): ${message}`);
    });
  }
}
