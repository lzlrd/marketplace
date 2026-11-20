import { test, expect, beforeAll, afterAll } from 'bun:test';
import { assertSafeFetchUrl, safeFetch } from '../src/net.js';

// Stands in for DNS, so no test resolves a real name.
const resolvesTo = (...ips: string[]) => async () => ips;

test('rejects non-http(s) schemes', async () => {
  await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toThrow(/only http/);
  await expect(assertSafeFetchUrl('ftp://example.com/x')).rejects.toThrow(/only http/);
});

// Every spelling of a link-local or cloud-metadata address, as a literal.
const BLOCKED = [
  'http://169.254.169.254/latest/meta-data/',
  'http://169.254.170.2/v2/credentials',
  'http://2852039166/',
  'http://0xa9fea9fe/',
  'http://[fe80::1]/',
  'http://[febf::1]/',
  'http://[fd00:ec2::254]/',
  'http://[fd20:ce::254]/computeMetadata/v1/',
  'http://[fd00:c1::a9fe:a9fe]/opc/v1/instance/',
  'http://[fd00:c1:0:0:0:0:a9fe:a9fe]/opc/v2/instance/',
  'http://100.100.100.200/latest/meta-data/',
  // IPv4-mapped IPv6, in both spellings (new URL() rewrites the first into the second).
  'http://[::ffff:169.254.169.254]/latest/meta-data/',
  'http://[::ffff:a9fe:a9fe]/',
  'http://[::ffff:100.100.100.200]/',
  // NAT64 and 6to4 carry an IPv4 address inside an IPv6 one.
  'http://[64:ff9b::a9fe:a9fe]/',
  'http://[64:ff9b::169.254.169.254]/',
  'http://[2002:a9fe:a9fe::1]/',
];

for (const url of BLOCKED) {
  test(`refuses ${url}`, async () => {
    await expect(assertSafeFetchUrl(url)).rejects.toThrow(/link-local\/metadata/);
  });
}

// Loopback and private LAN stay reachable on purpose, so local dev servers work.
const ALLOWED = [
  'http://127.0.0.1:3000/',
  'http://[::1]:3000/',
  'http://[::ffff:127.0.0.1]:3000/',
  'http://10.0.0.5/',
  'http://172.16.0.1/',
  'http://192.168.1.10:8080/',
  'http://[fd12:3456:789a::1]/',
  'http://[fd20:ce::253]/',
  'http://[fd00:c1::a9fe:a9ff]/',
  'http://[64:ff9b::c0a8:10a]/',
  'http://100.64.0.1/',
  'http://100.100.100.201/',
  'http://93.184.216.34/logo.svg',
];

for (const url of ALLOWED) {
  test(`allows ${url}`, async () => {
    await expect(assertSafeFetchUrl(url)).resolves.toBeUndefined();
  });
}

test('checks every address a host name resolves to', async () => {
  await expect(assertSafeFetchUrl('https://example.com/logo.svg', resolvesTo('93.184.216.34'))).resolves.toBeUndefined();
  await expect(assertSafeFetchUrl('http://dev.internal:3000/', resolvesTo('192.168.1.10'))).resolves.toBeUndefined();
  await expect(assertSafeFetchUrl('http://metadata.internal/', resolvesTo('169.254.169.254'))).rejects.toThrow(/link-local\/metadata/);
  await expect(assertSafeFetchUrl('http://mixed.example/', resolvesTo('93.184.216.34', '169.254.169.254'))).rejects.toThrow(/link-local\/metadata/);
  await expect(assertSafeFetchUrl('http://mapped.example/', resolvesTo('::ffff:169.254.169.254'))).rejects.toThrow(/link-local\/metadata/);
  await expect(assertSafeFetchUrl('http://scoped.example/', resolvesTo('fe80::1%en0'))).rejects.toThrow(/link-local\/metadata/);
});

// --- Redirects: the guard runs again on every hop ---

let server: ReturnType<typeof Bun.serve>;
let origin: string;

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
      if (pathname === '/to-link-local') return redirect('http://[fe80::1]/hop2');
      if (pathname === '/to-mapped-metadata') return redirect('http://[::ffff:169.254.169.254]/latest/meta-data/');
      if (pathname === '/to-file') return redirect('file:///etc/passwd');
      if (pathname === '/hop') return redirect('/final');
      if (pathname === '/loop') return redirect('/loop');
      if (pathname === '/final') return new Response('arrived');
      return new Response('not found', { status: 404 });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
});

afterAll(() => { server.stop(true); });

test('refuses a redirect to a link-local address', async () => {
  await expect(safeFetch(`${origin}/to-link-local`)).rejects.toThrow(/link-local\/metadata/);
});

test('refuses a redirect to an IPv4-mapped metadata address', async () => {
  await expect(safeFetch(`${origin}/to-mapped-metadata`)).rejects.toThrow(/link-local\/metadata/);
});

test('refuses a redirect to a non-http(s) URL', async () => {
  await expect(safeFetch(`${origin}/to-file`)).rejects.toThrow(/only http/);
});

test('follows an allowed redirect and reports the final URL', async () => {
  const { res, url } = await safeFetch(`${origin}/hop`);
  expect(res.status).toBe(200);
  expect(await res.text()).toBe('arrived');
  expect(url).toBe(`${origin}/final`);
});

test('gives up on a redirect loop', async () => {
  await expect(safeFetch(`${origin}/loop`)).rejects.toThrow(/too many redirects/);
});

// --- Name resolution counts against the request's time limit ---

test('a slow name lookup is cut off by the request signal', async () => {
  let lookups = 0;
  const slow = async () => { lookups++; await Bun.sleep(3_000); return ['93.184.216.34']; };

  const started = Date.now();
  const err = await safeFetch('http://slow.example/', { signal: AbortSignal.timeout(200) }, slow).catch((e: unknown) => e);
  expect(Date.now() - started).toBeLessThan(1_500);
  // The signal's own reason, so a caller can tell a timeout from a refusal.
  expect((err as Error).name).toBe('TimeoutError');
  expect(lookups).toBe(1);
});

test('no lookup is made once the signal has fired', async () => {
  let lookups = 0;
  const count = async () => { lookups++; return ['93.184.216.34']; };
  const controller = new AbortController();
  controller.abort();

  await expect(safeFetch('http://any.example/', { signal: controller.signal }, count)).rejects.toThrow();
  expect(lookups).toBe(0);
});
