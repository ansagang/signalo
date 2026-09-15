/**
 * Loads every dashboard page in a real browser and fails on anything the
 * SSR-only check cannot see: ReferenceErrors, failed requests, error overlays.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import os from 'os';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const exe = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = U.replace('https://', '').split('.')[0];

const s = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'beta@signalo.app', password: 'SignaloBeta2026!' }),
})).json();

const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{
  name: `sb-${REF}-auth-token`,
  value: 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64'),
  domain: 'localhost', path: '/',
}]);

const PAGES = [
  '/',                       // the public landing page
  '/dashboard', '/dashboard/conversations', '/dashboard/catalogue',
  '/dashboard/bookings', '/dashboard/knowledge-base', '/dashboard/personas',
  '/dashboard/channels', '/dashboard/business', '/dashboard/account',
];

// Noise that is not a defect in this app.
const IGNORE = /DevTools|Download the React|favicon|Image with src|aria-describedby|preload/i;

let failed = 0;
for (const path of PAGES) {
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) problems.push(m.text().slice(0, 150)); });
  page.on('pageerror', e => problems.push(`UNCAUGHT ${e.message.slice(0, 150)}`));
  page.on('requestfailed', r => { if (!IGNORE.test(r.url())) problems.push(`REQUEST ${r.url().slice(-60)}`); });

  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    const overlay = await page.evaluate(() =>
      /Unhandled Runtime Error|Application error|is not defined|is not a function/.test(document.body.innerText));
    if (overlay) problems.push('error text visible on the page');
  } catch (e) {
    problems.push(`NAV ${e.message.split('\n')[0].slice(0, 90)}`);
  }

  if (problems.length) { failed++; console.log(`✗ ${path}`); problems.slice(0, 3).forEach(x => console.log(`    ${x}`)); }
  else console.log(`✓ ${path}`);
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} page(s) with problems` : '\nall clean');
process.exit(failed ? 1 : 0);
