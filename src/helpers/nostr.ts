import { Pub } from "nostr-tools";

export function nowUnix() {
  return new Date().valueOf() / 1000;
}

export function waitForPub(pub: Pub) {
  return new Promise((res, rej) => {
    pub.on("ok", () => res(true));
    pub.on("failed", () => rej());
  });
}
