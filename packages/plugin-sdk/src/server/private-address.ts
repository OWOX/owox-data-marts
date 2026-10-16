import { BlockList, isIP } from 'node:net';

// IANA special-purpose IPv4 ranges a backend must not call back.
const SPECIAL_IPV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // unspecified, "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // shared, CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  SPECIAL_IPV4.addSubnet(network, prefix, 'ipv4');
}

// Public IPv6 is global unicast. Everything outside 2000::/3 is refused: loopback, unspecified,
// unique-local, link-local, multicast, and the IPv4-mapped and NAT64 forms, whose embedded
// address may be private.
const GLOBAL_UNICAST_IPV6 = new BlockList();
GLOBAL_UNICAST_IPV6.addSubnet('2000::', 3, 'ipv6');
const SPECIAL_IPV6 = new BlockList();
for (const [network, prefix] of [
  ['2001::', 23], // IETF protocol assignments, including Teredo and benchmarking
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which embeds an IPv4 address
  ['3fff::', 20], // documentation
] as const) {
  SPECIAL_IPV6.addSubnet(network, prefix, 'ipv6');
}

/** False for any address a backend must not connect to, and for anything that is not an address. */
export function isPublicAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return !SPECIAL_IPV4.check(address, 'ipv4');
    case 6:
      return GLOBAL_UNICAST_IPV6.check(address, 'ipv6') && !SPECIAL_IPV6.check(address, 'ipv6');
    default:
      return false;
  }
}
