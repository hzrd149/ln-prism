import { Event, Filter, Relay, relayInit } from "nostr-tools";
import WebSocket from "ws";
import { appDebug } from "./debug.js";
// @ts-ignore
global.WebSocket = WebSocket;

const log = appDebug.extend("relays");

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
      try {
        await relay.connect();
      } catch (e) {
        log(`Failed to connect to ${relay.url}`);
      }
    }
  }
}

export async function publish(urls: string[], event: Event) {
  const relays = await getRelays(urls);

  for (const relay of relays) {
    const pub = await relay.publish(event);

    pub.on("failed", (message) => {
      log(`${relay.url} rejected event: ${message}`);
    });
  }
}

export async function getSingleEvent(
  urls: string[],
  filter: Filter
): Promise<Event> {
  await connect(urls);
  const relays = getRelays(urls);

  return Promise.race(
    relays.map((relay) => {
      return relay.get(filter);
    })
  );
}
