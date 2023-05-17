export async function isValidAddress(address: string) {
  try {
    const [name, domain] = address.split("@");
    const metadata = await fetch(
      `https://${domain}/.well-known/lnurlp/${name}`
    ).then((res) => res.json());
    if (!metadata.callback) return false;
    return true;
  } catch (e) {
    return false;
  }
}
