/* global document, caches -- browser globals used only inside page.evaluate callbacks */
// Service-worker behaviour check against a built dist/ (run after `npm run build`).
// Proves, with a real Chromium and a throwaway static server:
//   1. a /cherry.svg or manifest fetch never overwrites the cached /index.html fallback,
//   2. a redeploy (new index.html) reaches a returning visitor on the very next navigation,
//   3. the offline fallback serves the most recently fetched HTML shell, not an install-time snapshot.
// Usage: node scripts/verify-sw.mjs [dist-dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.argv[2] ?? 'dist');
const PORT = 4190;
const swSource = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
const cacheName = /const CACHE = '([^']+)'/.exec(swSource)?.[1];
if (!cacheName) {
  console.error('FAIL could not read the cache name from dist/sw.js');
  process.exit(1);
}

let deployMarker = '1';
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webm': 'video/webm', '.ico': 'image/x-icon', '.jpg': 'image/jpeg',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let file = path.join(DIST, url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.html') body = Buffer.from(body.toString().replace('<head>', `<head><meta name="deploy" content="${deployMarker}">`));
  res.writeHead(200, {
    'content-type': types[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
  });
  res.end(body);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null, null, { timeout: 15_000 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.evaluate(async () => {
    await fetch('/cherry.svg', { mode: 'no-cors' });
    await fetch('/manifest.webmanifest');
  });
  await page.waitForTimeout(500);

  const names = await page.evaluate(() => caches.keys());
  check(`only the current cache (${cacheName}) exists`, names.length === 1 && names[0] === cacheName, names.join(','));

  const cachedIndex = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    const hit = await cache.match('/index.html');
    return hit ? (await hit.text()).slice(0, 40) : null;
  }, cacheName);
  check('cached /index.html is HTML, not an icon or manifest', typeof cachedIndex === 'string' && /<!doctype html/i.test(cachedIndex));

  const cachedSvg = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    const hit = await cache.match('/cherry.svg');
    return hit ? (await hit.text()).slice(0, 4) : null;
  }, cacheName);
  check('cached /cherry.svg is the SVG', cachedSvg === '<svg');

  deployMarker = '2';
  await page.reload({ waitUntil: 'load' });
  const marker = await page.evaluate(() => document.querySelector('meta[name="deploy"]')?.getAttribute('content'));
  check('a redeploy reaches a returning visitor on the next navigation', marker === '2', `marker=${marker}`);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlineMarker = await page.evaluate(() => document.querySelector('meta[name="deploy"]')?.getAttribute('content'));
  const offlineIsHtml = await page.evaluate(() => document.documentElement.tagName === 'HTML' && document.querySelector('#root, main, body') !== null);
  check('offline fallback serves the most recently fetched HTML shell', offlineIsHtml && offlineMarker === '2', `marker=${offlineMarker}`);
  await context.setOffline(false);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\nverify-sw: ${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
