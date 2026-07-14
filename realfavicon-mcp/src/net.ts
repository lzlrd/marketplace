import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Reject a URL before fetching it if its host resolves to a link-local / cloud-metadata
// address (the classic SSRF exfil target, e.g. the 169.254.169.254 instance-metadata
// endpoint). Loopback and private LAN ranges are deliberately allowed, so the tool still
// works against localhost and intranet dev servers — the realistic favicon use case.
function isBlockedIp(ip: string): boolean {
  if (ip.startsWith('169.254.')) return true; // IPv4 link-local, incl. cloud metadata.
  const lower = ip.toLowerCase();
  // IPv6 link-local fe80::/10 spans fe80:: .. febf::.
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower === 'fd00:ec2::254') return true; // AWS IMDSv2 IPv6 metadata.
  return false;
}

// Throw if `raw` is not an http(s) URL, or if its host resolves to a blocked address.
// Resolving the host (rather than only string-matching) also catches a DNS name that
// points at a link-local address.
export async function assertSafeFetchUrl(raw: string): Promise<void> {
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
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new Error(`refusing to fetch a link-local/metadata address (${host} -> ${ip})`);
    }
  }
}
