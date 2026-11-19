import { describe, expect, it } from "vitest";
import { isPrivateAddress, parseIPv6 } from "./ip";

// What the URL parser hands us for a bracketed IPv6 host.
const host = (url: string) => new URL(url).hostname;

describe("isPrivateAddress: IPv4", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "127.255.255.254",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.0.0.5",
    "192.0.2.7",
    "192.88.99.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.9",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "172.15.0.1",
    "172.32.0.1",
    "100.63.0.1",
    "100.128.0.1",
    "192.0.43.10",
    "198.17.0.1",
    "198.20.0.1",
    "203.0.114.1",
    "223.255.255.255",
  ])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("isPrivateAddress: IPv6", () => {
  it("blocks loopback, unspecified, unique-local, link-local, site-local, multicast, documentation and discard", () => {
    for (const ip of [
      "::",
      "::1",
      "0:0:0:0:0:0:0:1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "febf::1",
      "fec0::1",
      "ff02::1",
      "2001:db8::1",
      "100::1",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public IPv6 addresses", () => {
    for (const ip of ["2606:4700::1111", "2001:4860:4860::8888", "2a00:1450:4001:81c::200e", "2620:fe::fe"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("blocks private IPv4 hidden inside IPv6, in every form (the original bypass)", () => {
    const hidden = [
      "::ffff:127.0.0.1", // dotted
      "::ffff:7f00:1", // hex, what the URL parser produces
      "::ffff:a00:5", // 10.0.0.5
      "::ffff:a9fe:a9fe", // 169.254.169.254
      "::FFFF:C0A8:101", // 192.168.1.1, uppercase
      "0:0:0:0:0:ffff:7f00:1", // expanded
      "::127.0.0.1", // IPv4-compatible
      "::7f00:1",
      "64:ff9b::7f00:1", // NAT64
      "64:ff9b::a9fe:a9fe",
      "64:ff9b:1::1", // local-use NAT64
      "2002:7f00:1::", // 6to4 of 127.0.0.1
      "2002:a9fe:a9fe::1", // 6to4 of 169.254.169.254
    ];
    for (const ip of hidden) expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("allows public IPv4 wrapped in IPv6", () => {
    for (const ip of ["::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::808:808", "2002:808:808::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("catches what the URL parser actually produces for bracketed hosts", () => {
    for (const url of [
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:10.0.0.5]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[64:ff9b::7f00:1]/",
      "http://[::1]/",
      "http://[fd00::1]/",
    ]) {
      expect(isPrivateAddress(host(url)), url).toBe(true);
    }
  });

  it("catches IPv4 written in odd forms, which the URL parser normalizes", () => {
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://127.1/"]) {
      expect(isPrivateAddress(host(url)), url).toBe(true);
    }
  });
});

describe("isPrivateAddress: bad input fails closed", () => {
  it.each(["", "not-an-ip", "1.2.3", "1.2.3.4.5", "999.1.1.1", "::g", "1::2::3", "localhost"])("treats %j as unsafe", (value) => {
    expect(isPrivateAddress(value)).toBe(true);
  });

  it("accepts brackets and surrounding whitespace", () => {
    expect(isPrivateAddress(" [::1] ")).toBe(true);
    expect(isPrivateAddress("[2606:4700::1111]")).toBe(false);
  });
});

describe("parseIPv6", () => {
  it("expands compression and embedded IPv4", () => {
    expect(parseIPv6("::1")).toEqual([...Array(15).fill(0), 1]);
    expect(parseIPv6("1::")).toEqual([0, 1, ...Array(14).fill(0)]);
    expect(parseIPv6("::ffff:1.2.3.4")).toEqual([...Array(10).fill(0), 255, 255, 1, 2, 3, 4]);
    expect(parseIPv6("2001:db8:0:0:0:0:0:1")).toEqual([0x20, 0x01, 0x0d, 0xb8, ...Array(11).fill(0), 1]);
  });

  it("rejects things that are not IPv6", () => {
    expect(parseIPv6("1.2.3.4")).toBeNull();
    expect(parseIPv6("hello")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});
