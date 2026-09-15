/**
 * Applies a migration file to the live database through the Supabase
 * Management API. The CLI keeps its access token in the login keychain, which
 * is the only credential here that can run DDL — the service role key cannot.
 *
 *   node scripts/migrate.mjs supabase/migrations/0011_more_channels.sql
 */
import fs from 'fs';
import { execSync } from 'child_process';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/migrate.mjs <file.sql>'); process.exit(1); }

const raw = execSync('security find-generic-password -s "Supabase CLI" -w', { encoding: 'utf8' }).trim();
// The CLI stores the token base64-wrapped behind a go-keyring prefix.
const token = raw.startsWith('go-keyring-base64:')
  ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim()
  : raw;

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: fs.readFileSync(file, 'utf8') }),
});
const body = await res.text();
if (!res.ok) { console.error(`✗ ${res.status}`, body); process.exit(1); }
console.log(`✓ applied ${file}`);
if (body && body !== '[]') console.log(body.slice(0, 800));
