import { describe, it, expect } from "vitest";
import { abuseKeyForIp } from "./ip";

describe("abuseKeyForIp", () => {
  it("keeps IPv4 addresses as they are", () => {
    expect(abuseKeyForIp("198.51.100.7")).toBe("198.51.100.7");
    expect(abuseKeyForIp(" 198.51.100.7 ")).toBe("198.51.100.7");
  });

  it("groups every address in one IPv6 /64 together", () => {
    const keys = [
      "2001:db8:aaaa:1::10",
      "2001:db8:aaaa:1::99",
      "2001:DB8:AAAA:0001:0:0:0:5",
      "2001:0db8:aaaa:0001:ffff:ffff:ffff:ffff",
    ].map(abuseKeyForIp);
    expect(new Set(keys)).toEqual(new Set(["2001:db8:aaaa:1::/64"]));
  });

  it("keeps different /64s apart", () => {
    expect(abuseKeyForIp("2001:db8:aaaa:1::1")).not.toBe(abuseKeyForIp("2001:db8:aaaa:2::1"));
  });

  it("handles compressed prefixes and zone ids", () => {
    expect(abuseKeyForIp("::1")).toBe("0:0:0:0::/64");
    expect(abuseKeyForIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(abuseKeyForIp("2001:db8::")).toBe("2001:db8:0:0::/64");
  });

  it("treats IPv4-mapped IPv6 as the IPv4 address", () => {
    expect(abuseKeyForIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
  });

  it("expands an embedded IPv4 tail", () => {
    expect(abuseKeyForIp("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
  });

  it("passes through unknown and unparseable values", () => {
    expect(abuseKeyForIp("unknown")).toBe("unknown");
    expect(abuseKeyForIp("")).toBe("unknown");
    expect(abuseKeyForIp("not-an-ip")).toBe("not-an-ip");
    expect(abuseKeyForIp("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9");
  });
});
