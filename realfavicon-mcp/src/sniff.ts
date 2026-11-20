// What a fetched body is, judged by its first bytes rather than by the Content-Type sent with
// it, which can be wrong both ways: a single-page app labels its HTML shell as anything, and a
// misconfigured server labels a real icon text/html or an SVG image/png. Each image kind is
// named by its MIME subtype, so `image/${kind}` is its type.
export type BodyKind = 'empty' | 'html' | 'svg' | 'png' | 'ico' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'tiff';

// How much of a body is read as markup. Sniffing runs synchronously once the body is in, where
// no time limit can interrupt it, so the work must not grow with the body.
const MARKUP_BYTES = 64 * 1024;

export function sniff(bytes: Uint8Array): BodyKind | null {
  if (bytes.length === 0) return 'empty';
  const at = (offset: number, ...expected: number[]) => expected.every((b, i) => bytes[offset + i] === b);
  const ascii = (offset: number, text: string) => at(offset, ...[...text].map(c => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0, 0, 1, 0) || at(0, 0, 0, 2, 0)) return 'ico'; // ICO or CUR.
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (ascii(0, 'GIF8')) return 'gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  if (ascii(4, 'ftypavif') || ascii(4, 'ftypavis')) return 'avif';
  if (ascii(0, 'II*\0') || ascii(0, 'MM\0*')) return 'tiff';
  // Markup is judged by its root element, the first one after any XML declaration, comments
  // and doctype, so an inline <svg> in HTML, or HTML inside an SVG, does not decide it. Only
  // a root that starts within the first MARKUP_BYTES is seen. The two parts repeated inside
  // the doctype pattern start with different characters, so a doctype that never closes costs
  // time in proportion to its length, not to its square.
  const text = new TextDecoder().decode(bytes.subarray(0, MARKUP_BYTES)).replace(/^﻿/, '').toLowerCase();
  const prolog = /^\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!doctype(?:[^>[]|\[[^\]]*\])*>)\s*)*/.exec(text)![0];
  const root = text.slice(prolog.length);
  if (prolog.includes('<!doctype html') || /^<html[\s>]/.test(root)) return 'html';
  if (/^<svg[\s/>]/.test(root)) return 'svg';
  return null;
}
