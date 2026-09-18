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
await fetch(`${U}/rest/v1/channels?id=eq.${ch.id}`, { method:'PATCH', headers:h,
  body: JSON.stringify({ config: { ...before, position: 'center' } }) });

const exe = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport:{width:390,height:780}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('UNCAUGHT ' + e.message.slice(0,120)));
await page.setContent(`<!doctype html><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="font:15px system-ui;padding:20px"><h1>Seller's page</h1>
  <script src="http://localhost:3007/widget.js" data-key="${KEY}" defer></script>`,
  { waitUntil:'networkidle' });
await page.waitForTimeout(3000);
await page.locator('button.sg-orb').click();
await page.waitForTimeout(2000);
const box = await page.evaluate(() => {
  const r = document.querySelector('iframe').getBoundingClientRect();
  const l = document.querySelector('button.sg-orb');
  return { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height),
           launcherHidden: getComputedStyle(l).display === 'none' };
});
console.log('centre on a phone:', JSON.stringify(box), errs.join(''));
await page.screenshot({ path: '/tmp/shot-centre-phone.png' });
await fetch(`${U}/rest/v1/channels?id=eq.${ch.id}`, { method:'PATCH', headers:h,
  body: JSON.stringify({ config: before }) });
console.log('✓ config restored');
await browser.close();
