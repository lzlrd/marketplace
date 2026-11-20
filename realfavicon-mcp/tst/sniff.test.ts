import { test, expect } from 'bun:test';
import { sniff } from '../src/sniff.ts';

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const ascii = (s: string, pad = 16) => new Uint8Array([...s].map(c => c.charCodeAt(0)).concat(new Array(pad).fill(0)));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';

// Only the first bytes matter, so each body is its signature plus a little padding.
const CASES: Array<[string, Uint8Array, string | null]> = [
  ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13), 'png'],
  ['ICO', bytes(0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0), 'ico'],
  ['CUR', bytes(0, 0, 2, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0), 'ico'],
  ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16), 'jpeg'],
  ['GIF', ascii('GIF89a'), 'gif'],
  ['WebP', ascii('RIFF\x24\0\0\0WEBPVP8 '), 'webp'],
  ['AVIF', ascii('\0\0\0\x1cftypavif'), 'avif'],
  ['TIFF, little-endian', ascii('II*\0'), 'tiff'],
  ['TIFF, big-endian', ascii('MM\0*'), 'tiff'],
  ['empty', bytes(), 'empty'],
  ['SVG', text(SVG), 'svg'],
  ['SVG, self-closing root', text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg'],
  ['SVG after a BOM and blank lines', text(`﻿\n\n  ${SVG}`), 'svg'],
  ['SVG after an XML declaration, a comment and a doctype with an internal subset',
    text(`<?xml version="1.0"?>\n<!-- Generator -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd" [\n<!ENTITY ns "x">\n]>\n${SVG}`), 'svg'],
  ['SVG after a long comment', text(`<?xml version="1.0"?>\n<!-- ${'x'.repeat(6000)} -->\n${SVG}`), 'svg'],
  ['SVG with an XHTML foreignObject', text(`<?xml version="1.0"?>\n${SVG.replace('</svg>', '<foreignObject><html xmlns="http://www.w3.org/1999/xhtml"></html></foreignObject></svg>')}`), 'svg'],
  ['HTML', text('<!DOCTYPE html><html><head><title>App</title></head></html>'), 'html'],
  ['HTML with an inline SVG', text(`<!doctype html><html><body>${SVG}</body></html>`), 'html'],
  ['HTML after a comment', text(`<!-- app --><html><body>${SVG}</body></html>`), 'html'],
  ['HTML whose doctype follows a comment', text('<!-- built --><!DOCTYPE html><title>x</title>'), 'html'],
  ['XHTML with an inline SVG', text(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${SVG}</body></html>`), 'html'],
  ['plain text', text('this is not an image'), null],
  ['JSON', text('{"name":"x"}'), null],
];

for (const [label, body, kind] of CASES) {
  test(`sniffs ${label} as ${kind}`, () => {
    expect(sniff(body)).toBe(kind as ReturnType<typeof sniff>);
  });
}

// --- Time: sniff runs synchronously once a body is read, so no time limit can cut it short ---

// Milliseconds sniff takes over `body`, and what it says.
function timed(body: Uint8Array): { ms: number; kind: ReturnType<typeof sniff> } {
  const started = performance.now();
  const kind = sniff(body);
  return { ms: performance.now() - started, kind };
}

test('an unterminated doctype is sniffed in linear time', () => {
  // Overlapping repeats in the doctype pattern once made this take about 2 seconds.
  const { ms, kind } = timed(text(`<!doctype ${'a'.repeat(64_000)}`));
  expect(kind).toBeNull();
  expect(ms).toBeLessThan(500);
});

test('a large hostile body is sniffed quickly', () => {
  const MiB = 1024 * 1024;
  for (const body of [
    `<!doctype ${'a'.repeat(MiB)}`,
    `<!doctype [ ${']'.repeat(MiB)}`,
    `<!doctype x [${'a'.repeat(MiB)}`,
    `<!doctype ${'['.repeat(MiB)}`,
    `<!--${'a'.repeat(MiB)}`,
    `<?${'a'.repeat(MiB)}`,
    `${'<!---->'.repeat(MiB / 7)}<!--`,
  ]) {
    const { ms, kind } = timed(text(body));
    expect(kind).toBeNull();
    expect(ms).toBeLessThan(500);
  }
});

test('markup is judged by its first 64 KiB', () => {
  // A root element that starts past them is not seen, so the body is no known kind.
  expect(sniff(text(`<!-- ${'x'.repeat(64 * 1024)} -->${SVG}`))).toBeNull();
  expect(sniff(text(`<!-- ${'x'.repeat(60 * 1024)} -->${SVG}`))).toBe('svg');
});
