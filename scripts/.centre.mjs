import { chromium } from 'playwright-core';
import fs from 'fs'; import os from 'os';
const KEY = 'sg_live_68862e43cbc949ef8aaa7f33';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const U = env.NEXT_PUBLIC_SUPABASE_URL, SRV = env.SUPABASE_SERVICE_ROLE_KEY;
const h = {apikey:SRV, Authorization:`Bearer ${SRV}`, 'Content-Type':'application/json'};
const [ch] = await (await fetch(`${U}/rest/v1/channels?select=id,config&public_key=eq.${KEY}`,{headers:h})).json();
const before = ch.config;

const exe = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
const W = 1000;

const centreOf = async (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return Math.round(r.left + r.width / 2);
}, sel);

async function run(position, greeting) {
  await fetch(`${U}/rest/v1/channels?id=eq.${ch.id}`, { method:'PATCH', headers:h,
    body: JSON.stringify({ config: { ...before, position, greetingBubble: greeting } }) });
  const ctx = await browser.newContext({ viewport:{width:W,height:800}, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('UNCAUGHT ' + e.message.slice(0,120)));
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <body style="font:15px system-ui;padding:40px"><h1>Seller's page</h1>
    <script src="http://localhost:3007/widget.js" data-key="${KEY}" defer></script>`,
    { waitUntil:'networkidle' });
  await page.waitForTimeout(3200);

  const closed = await centreOf(page, 'button.sg-orb');
  await page.hover('button.sg-orb');
  await page.waitForTimeout(500);
  const hovered = await centreOf(page, 'button.sg-orb');
  const bubble = greeting ? await centreOf(page, 'div[style*="sg-rise"]') : null;

  await page.locator('button.sg-orb').click();
  await page.waitForTimeout(1800);
  const opened = await centreOf(page, 'button.sg-orb');
  const panel = await centreOf(page, 'iframe');

  console.log(`${position.padEnd(7)} launcher closed=${closed} hover=${hovered} open=${opened} | panel=${panel}` +
              (bubble !== null ? ` | bubble=${bubble}` : '') + ` ${errs.join('')}`);
  await page.screenshot({ path: `/tmp/shot-pos-${position}.png` });
  await ctx.close();
}

await run('center', 'Need help?');
await run('right', '');
await run('left', '');
console.log(`(viewport is ${W}px, so centred means ${W / 2})`);

await fetch(`${U}/rest/v1/channels?id=eq.${ch.id}`, { method:'PATCH', headers:h,
  body: JSON.stringify({ config: before }) });
console.log('✓ config restored');
await browser.close();
