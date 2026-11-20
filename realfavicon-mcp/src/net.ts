import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Reject a URL before fetching it if its host resolves to a link-local / cloud-metadata
// address (the classic SSRF exfil target, e.g. the 169.254.169.254 instance-metadata
// endpoint). Loopback and private LAN ranges are deliberately allowed, so the tool still
// works against localhost and intranet dev servers — the realistic favicon use case.
const blocked = new BlockList();
blocked.addSubnet('169.254.0.0', 16, 'ipv4'); // IPv4 link-local, incl. cloud metadata.
blocked.addAddress('100.100.100.200', 'ipv4'); // Alibaba Cloud metadata.
blocked.addSubnet('fe80::', 10, 'ipv6'); // IPv6 link-local, fe80:: .. febf::.
blocked.addAddress('fd00:ec2::254', 'ipv6'); // AWS IMDSv2 IPv6 metadata.
blocked.addAddress('fd20:ce::254', 'ipv6'); // Google Cloud IPv6 metadata.
blocked.addAddress('fd00:c1::a9fe:a9fe', 'ipv6'); // Oracle Cloud IPv6 metadata.

// The eight 16-bit groups of an IPv6 address, with `::` and a dotted-quad tail expanded.
function ipv6Groups(ip: string): number[] {
  const quad = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const hex = quad
    ? `${ip.slice(0, quad.index)}${((Number(quad[1]) << 8) | Number(quad[2])).toString(16)}:${((Number(quad[3]) << 8) | Number(quad[4])).toString(16)}`
    : ip;
  const [head = '', tail] = hex.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const gap = tail === undefined ? [] : new Array<string>(8 - before.length - after.length).fill('0');
  return [...before, ...gap, ...after].map((group) => parseInt(group, 16));
}

// The IPv4 address carried inside an IPv4-mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::/96) or
// 6to4 (2002::/16) IPv6 address, or null. Each of these reaches the IPv4 host it names, so
// the IPv4 rules have to apply to it.
function embeddedIpv4(ip: string): string | null {
  const g = ipv6Groups(ip);
  const quad = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  const zeroUpTo = (end: number) => g.slice(0, end).every((group) => group === 0);
  if (zeroUpTo(5) && g[5] === 0xffff) return quad(g[6]!, g[7]!);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((group) => group === 0)) return quad(g[6]!, g[7]!);
  if (g[0] === 0x2002) return quad(g[1]!, g[2]!);
  return null;
}

function isBlockedIp(address: string): boolean {
  const ip = address.split('%')[0]!; // Drop an IPv6 zone id such as %en0.
  if (isIP(ip) === 4) return blocked.check(ip, 'ipv4');
  if (isIP(ip) !== 6) return false;
  const inner = embeddedIpv4(ip);
  return blocked.check(ip, 'ipv6') || (inner !== null && blocked.check(inner, 'ipv4'));
}

// Resolves a host name to its addresses. Tests pass their own so they need no DNS.
export type Lookup = (host: string) => Promise<string[]>;
const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

// Throw if `raw` is not an http(s) URL, or if its host resolves to a blocked address.
// Resolving the host (rather than only string-matching) also catches a DNS name that
// points at a link-local address.
export async function assertSafeFetchUrl(raw: string, resolve: Lookup = dnsLookup): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`only http(s) URLs are allowed, got ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host) ? [host] : await resolve(host);
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(`refusing to fetch a link-local/metadata address (${host} -> ${ip})`);
    }
  }
}

const MAX_REDIRECTS = 5;

// Settles as `work` does, or rejects with the signal's reason as soon as it fires. A name
// lookup takes no signal of its own, so without this a slow resolver outlasts every time limit.
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Fetches `raw` with the guard applied to it and to every redirect target. Left to itself,
// fetch() follows redirects, so an allowed URL could bounce the request to a blocked address;
// here each hop is requested with redirect: 'manual' and checked before it is followed. The
// request's signal covers the guard's name lookup as well as the request.
// Returns the final response and the URL that produced it.
export async function safeFetch(raw: string, init: RequestInit = {}, resolve: Lookup = dnsLookup): Promise<{ res: Response; url: string }> {
  let url = raw;
  for (let hop = 0; ; hop++) {
    init.signal?.throwIfAborted();
    await untilAborted(assertSafeFetchUrl(url, resolve), init.signal);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return { res, url };
    await res.body?.cancel();
    if (hop === MAX_REDIRECTS) throw new Error(`too many redirects (more than ${MAX_REDIRECTS}) from ${raw}`);
    url = new URL(location, url).href;
  }
}
