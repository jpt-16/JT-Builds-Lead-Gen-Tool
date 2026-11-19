import { isIP } from "node:net";

// Decides whether an IP address is private, local or otherwise not a public
// website. Used before every server-side fetch of a lead's website so a listed
// "website" can never make the server call into its own network or a cloud
// metadata address.
//
// IPv6 is parsed into bytes, not matched as text. The URL parser rewrites
// "[::ffff:127.0.0.1]" as "::ffff:7f00:1", and an address can hide an IPv4
// one inside it (mapped, compatible, NAT64, 6to4), so those are unwrapped and
// the embedded IPv4 address is checked too.

type Bytes = number[];

function parseIPv4(text: string): Bytes | null {
  if (isIP(text) !== 4) return null;
  return text.split(".").map(Number);
}

/** The 16 bytes of an IPv6 address, or null if it isn't one. */
export function parseIPv6(input: string): Bytes | null {
  let text = input.split("%")[0]; // drop a zone id like %eth0
  if (isIP(text) !== 6) return null;

  // A trailing dotted IPv4 ("::ffff:1.2.3.4") becomes two hex groups.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    text = `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const sides = text.split("::");
  if (sides.length > 2) return null;
  const head = sides[0] ? sides[0].split(":") : [];
  const rest = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  let groups: string[];
  if (sides.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  }
  if (groups.length !== 8) return null;

  const bytes: Bytes = [];
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function isPrivateIPv4([a, b, c]: Bytes): boolean {
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol assignments, documentation
    (a === 192 && b === 88 && c === 99) || // old 6to4 relay
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );
}

const allZero = (bytes: Bytes, from: number, to: number) => bytes.slice(from, to).every((x) => x === 0);

function isPrivateIPv6(b: Bytes): boolean {
  if (allZero(b, 0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: and ::1

  // IPv4 hidden inside an IPv6 address: test the IPv4 part.
  if (allZero(b, 0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateIPv4(b.slice(12)); // ::ffff:a.b.c.d (mapped)
  if (allZero(b, 0, 12)) return isPrivateIPv4(b.slice(12)); // ::a.b.c.d (compatible, deprecated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (allZero(b, 4, 12)) return isPrivateIPv4(b.slice(12)); // 64:ff9b::/96 (NAT64)
    if (b[4] === 0x00 && b[5] === 0x01) return true; // 64:ff9b:1::/48 (local-use NAT64)
  }
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIPv4(b.slice(2, 6)); // 2002::/16 (6to4)
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32 (Teredo)

  return (
    (b[0] & 0xfe) === 0xfc || // fc00::/7 unique local
    (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) || // fe80::/10 link-local
    (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) || // fec0::/10 site-local, deprecated
    b[0] === 0xff || // ff00::/8 multicast
    (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) || // 2001:db8::/32 documentation
    (b[0] === 0x01 && allZero(b, 1, 8)) // 100::/64 discard
  );
}

/**
 * True for private, loopback, link-local, metadata, multicast, reserved and
 * documentation addresses. Anything that isn't a valid IP address counts as
 * not safe too, so a parsing surprise fails closed.
 */
export function isPrivateAddress(address: string): boolean {
  const text = address.trim().replace(/^\[|\]$/g, "");
  const version = isIP(text.split("%")[0]);
  if (version === 4) return isPrivateIPv4(parseIPv4(text)!);
  if (version === 6) {
    const bytes = parseIPv6(text);
    return bytes ? isPrivateIPv6(bytes) : true;
  }
  return true;
}
