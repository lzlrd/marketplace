import { test, expect } from 'bun:test';
import { assertSafeFetchUrl } from '../src/net.js';

test('rejects non-http(s) schemes', async () => {
  await expect(assertSafeFetchUrl('file:///etc/passwd')).rejects.toThrow(/only http/);
  await expect(assertSafeFetchUrl('ftp://example.com/x')).rejects.toThrow(/only http/);
});

test('rejects the cloud-metadata / link-local address by literal IP', async () => {
  await expect(assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/link-local|metadata/);
  await expect(assertSafeFetchUrl('http://[fe80::1]/')).rejects.toThrow(/link-local|metadata/);
});

test('allows a normal public host and localhost (dev use)', async () => {
  await expect(assertSafeFetchUrl('https://example.com/logo.svg')).resolves.toBeUndefined();
  await expect(assertSafeFetchUrl('http://127.0.0.1:3000/')).resolves.toBeUndefined();
});
