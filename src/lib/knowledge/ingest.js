/**
 * Turn a web page into knowledge-base entries.
 *
 * Typing a business's policies in by hand is the friction at exactly the
 * moment a new seller decides whether to bother. Most of it is already
 * written down on their own website.
 *
 * Deliberately dependency-free: fetch, strip, chunk. A headless browser would
 * read a few more JavaScript-rendered sites and cost far more than it returns.
 */

const MAX_BYTES = 2_000_000;      // a page larger than this is not prose
const MIN_CHUNK = 200;            // shorter than this carries no answer
const MAX_CHUNK = 1200;           // longer than this retrieves imprecisely

/** Everything that is markup, navigation or noise rather than content. */
function textFrom(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block elements become paragraph breaks so chunks split where meaning does.
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

function titleFrom(html, url) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? textFrom(match[1]).slice(0, 120) : "";
  return title || new URL(url).hostname;
}

/**
 * Split prose into retrievable pieces.
 *
 * Paragraphs are kept whole where they fit, because a chunk that stops
 * mid-sentence answers questions badly.
 */
export function chunk(text, { min = MIN_CHUNK, max = MAX_CHUNK } = {}) {
  // A floor at or above the ceiling would discard every chunk it just made.
  const floor = Math.min(min, Math.floor(max / 2));
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let current = "";

  for (const paragraph of paragraphs) {
    // A single paragraph longer than a chunk is split on sentence ends.
    if (paragraph.length > max) {
      if (current) { out.push(current); current = ""; }
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let piece = "";
      for (const sentence of sentences) {
        if ((piece + " " + sentence).trim().length > max) {
          if (piece) out.push(piece.trim());
          piece = sentence;
        } else {
          piece = (piece + " " + sentence).trim();
        }
      }
      if (piece) current = piece;
      continue;
    }

    if ((current + "\n\n" + paragraph).trim().length > max) {
      out.push(current);
      current = paragraph;
    } else {
      current = (current ? current + "\n\n" : "") + paragraph;
    }
  }
  if (current) out.push(current);

  return out.map((c) => c.trim()).filter((c) => c.length >= floor);
}

/**
 * Read one page.
 *
 * Returns the title and its chunks. Throws with something a person can act on,
 * because "failed to fetch" tells a salon owner nothing.
 */
export async function readPage(url) {
  let target;
  try {
    target = new URL(String(url).startsWith("http") ? url : `https://${url}`);
  } catch {
    throw new Error("That does not look like a web address.");
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Only web pages can be imported.");
  }

  let res;
  try {
    res = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "SignaloBot/1.0 (+https://signalo.app)" },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Could not reach that page. Check the address is public.");
  }

  if (!res.ok) throw new Error(`That page returned ${res.status}.`);

  const type = res.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    throw new Error("That link is not a web page — import a normal page instead.");
  }

  const html = (await res.text()).slice(0, MAX_BYTES);
  const body = /html/i.test(type) ? textFrom(html) : html.trim();
  const chunks = chunk(body);

  if (!chunks.length) {
    throw new Error("Nothing readable on that page — it may load its text with JavaScript.");
  }

  return { title: titleFrom(html, target.href), url: target.href, chunks };
}

/** Same-site links most likely to describe the business. */
const WORTH_READING = /(about|o-nas|о-нас|price|pricing|tarif|услуг|service|menu|меню|contact|контакт|faq|вопрос|booking|запис)/i;

function sameSiteLinks(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    let href = m[1];
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname !== new URL(base).hostname) continue;
      if (!WORTH_READING.test(url.pathname)) continue;
      url.hash = "";
      out.add(url.href);
    } catch { /* a malformed href is not worth a failure */ }
  }
  return [...out];
}

/**
 * Read a site, not just a page.
 *
 * A business's hours, prices and policies are rarely all on one page, so the
 * given page is read first and a few of its own About/Prices/Contact links
 * are followed. Bounded hard: this runs while someone waits.
 */
export async function readSite(url, { maxPages = 5 } = {}) {
  const first = await readPage(url);
  const pages = [first];

  let html = "";
  try {
    const res = await fetch(first.url, {
      headers: { "User-Agent": "SignaloBot/1.0 (+https://signalo.app)" },
      signal: AbortSignal.timeout(20000),
    });
    html = await res.text();
  } catch { /* the first page already parsed; links are a bonus */ }

  const seen = new Set([first.url]);
  for (const link of sameSiteLinks(html, first.url).filter((l) => !seen.has(l)).slice(0, maxPages - 1)) {
    seen.add(link);
    try {
      pages.push(await readPage(link));
    } catch { /* one unreadable sub-page must not sink the import */ }
  }

  return {
    title: first.title,
    url: first.url,
    pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.chunks.join("\n\n") })),
  };
}
