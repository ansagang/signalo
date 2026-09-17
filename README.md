# Signalo

An AI sales assistant for small sellers. You load your catalogue — goods with
stock, services with durations — give the bot a persona, and drop it on your
website or into Telegram. It answers customers in their own language,
recommends from your catalogue, takes orders, and books appointments.

Next.js 16 (App Router) · Supabase (Postgres + pgvector) · Claude / OpenAI.

---

## How it works

```
customer message
      │
      ▼
/api/chat ──► resolve channel (public_key) or session (playground)
      │
      ├─► embed the message            (OpenAI text-embedding-3-small)
      ├─► vector search the catalogue  (products + services + knowledge base)
      ├─► build the system prompt      (persona + tone + guardrails + catalogue)
      │
      ▼
  model loop (Claude Opus 5 by default) with six tools:
      create_order · check_availability · book_appointment
      show_items · capture_contact · request_human
      │
      ▼
  SSE stream ──► widget / dashboard, and every turn saved to `messages`
```

The bot may only speak from what vector search returned. If the catalogue has
no answer it follows the persona's fallback behaviour (escalate, retry, or
apologise) rather than inventing a product or a price.

## Layout

| Path | What's there |
|---|---|
| `src/lib/ai/engine.js` | The chat loop: history, retrieval, streaming, tool calls, persistence |
| `src/lib/ai/persona.js` | Turns a persona row into a selling system prompt |
| `src/lib/ai/retrieval.js` | Vector search over `knowledge_entries` + `products` |
| `src/lib/ai/tools.js` | `create_order`, `check_availability`, `book_appointment`, `show_items`, `capture_contact`, `request_human` |
| `src/components/ui/page.jsx` | Shared page furniture — header, section, panel, empty state, segmented control |
| `src/lib/channels/deliver.js` | Pushes agent replies back out to the customer's own channel |
| `src/lib/ai/models.js` | Model registry — swap models here, not in the database |
| `src/app/api/chat` | Public + playground chat endpoint (SSE) |
| `src/app/api/channels/telegram/[channelId]` | Telegram inbound webhook |
| `src/app/(chat)/c/[key]` | The customer-facing chat page |
| `public/widget.js` | Embeddable launcher; injects an iframe of the above |
| `src/app/(main)/dashboard` | Overview, conversations, catalogue, bookings, knowledge base, personas, channels, business, account |
| `supabase/migrations` | Schema, in order |

## Setup

```bash
npm install
npm run dev
```

`.env`:

```
URL=https://your-domain            # public origin; used for embeds + Telegram
API_KEY=...                        # guards non-public /api routes
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...                 # embeddings (required) + GPT personas
```

Apply `supabase/migrations/*.sql` in order via the Supabase SQL editor or CLI.

Demo data, one per booking shape:

```bash
node scripts/seed-demo.mjs       you@example.com   # shop: products with stock
node scripts/seed-salon.mjs      you@example.com   # appointments with masters
node scripts/seed-restaurant.mjs you@example.com   # tables, seating mode
```

## Connecting a channel

**Website** — Channels → *Add website widget*, pick a persona, copy the snippet:

```html
<script src="https://your-domain/widget.js" data-key="sg_live_..." defer></script>
```

Appearance — accent colour, side, button size and label, window title, greeting
bubble, auto-open — lives in Channels → *Appearance* and is fetched at runtime
from `/api/widget/<key>`, so changing the look never means re-editing the
snippet on a customer's site. `data-*` attributes still override per page.
`window.Signalo.open() / .close() / .toggle()` control it from your own code.

**Telegram** — create a bot with [@BotFather](https://t.me/BotFather), paste the
token into the channel, press *Connect webhook*. Needs a public HTTPS `URL`;
Telegram will not call localhost.

## Models

Personas store a model key (`claude`, `claude-sonnet`, `claude-haiku`, `gpt`),
resolved in `src/lib/ai/models.js`. Default is `claude-opus-5` at `low` effort —
fast enough for chat, and thinking stays on (disabling it on Opus 5 can leak
tool calls into visible text). Embeddings always go through OpenAI.

## Accountability

Nothing the bot sells is a loose end:

- **Stock** — `record_order` validates stock, writes the order, decrements the
  product and appends to `stock_movements` in one transaction. The bot is told
  the live count and refuses to oversell. `cancel_order` puts the goods back.
- **Bookings** — `book_appointment` takes an advisory lock, re-checks capacity,
  then inserts. A GiST exclusion constraint makes double-booking a master
  impossible at the database level, not just in application code.
- **Availability** — `available_slots` derives free times from the shop's
  opening hours, each master's own shift, who is assigned to that service, the
  duration + buffer, any notice period, and existing appointments. The bot may
  not invent a time; it has to ask.

## Booking model

The model is deliberately not salon-shaped. A **bookable** occupies a
**resource** for a span of time, and resources have **capacity** — that one
sentence covers every business type the app supports:

| Mode | Resource is | Example |
|---|---|---|
| `appointment` | taken exclusively, one customer | a haircut, a consultation |
| `seating` | taken exclusively, must fit the party | a restaurant table, a meeting room |
| `class` | shared until its seats run out | a yoga class, a tour |

`resources` carries a `kind` (`person` / `table` / `room` / `equipment`) and a
`capacity`. A stylist has capacity 1; a four-top has 4; a studio has 20. The
same `available_slots` function serves all three modes: for `seating` it picks
the **smallest sufficient** resource so two people are not seated at the ten-top,
and for `class` it subtracts the party sizes already booked on that resource.

Because it is one relation, the assistant needs one extra question — *how many
people?* — which it asks only when the catalogue says the service takes a range.

## Scheduling

A service is not bookable "any time". Admins decide, per service:

- **Start times** — either a rhythm (`slot_mode: 'grid'`, every N minutes) or an
  exact list (`slot_mode: 'fixed'`, e.g. 11:00 / 14:00 / 17:00). Nothing in
  between is ever offered, and `book_appointment` re-checks the requested time
  against the same function before inserting.
- **What can serve it** — `service_resources`. Assign nothing and anything
  suitable can take it; assign one resource and only its hours produce slots.
- **Hours** — `resource_hours`, per resource per weekday, clipped to the shop's
  own hours. A resource with no rows falls back to shop hours rather than
  vanishing from the calendar.
- **Notice** — `lead_time_min` keeps same-hour bookings out.

## Images

Products and services carry an `image_url` in the public `catalogue` storage
bucket (5 MB cap, raster types only — SVG is refused because it can carry
script). Uploads are namespaced by user id. The assistant calls `show_items` to
put picture cards in the chat; the widget renders them inline.

## The widget

`public/widget.js` injects a launcher and an iframe pointing at `/c/<public
key>`. Everything about the look comes from `channels.config`, fetched at
runtime, so changing it never means editing the snippet on a seller's site.

Colours are **not** taken as given. `src/lib/widget-theme.js` turns the stored
config into a finished palette: text is held to 7:1 against its background,
the accent's ink is whichever of black or white actually wins, and values a
seller typed by hand are pulled back toward something readable while keeping
their hue. `/api/widget/[key]` runs it once and every consumer — launcher,
greeting bubble, panel, dashboard preview — reads the result, so they cannot
drift apart. `node scripts/test-widget-theme.mjs` asserts that no combination
of the dashboard's own colour pickers can produce an unreadable panel.

Two different languages meet on a seller's site. The assistant already matches
whatever the customer writes — that is the persona's `language` setting. The
widget's own words (placeholder, buttons, notices, the launcher label) are
resolved separately in `src/lib/widget-language.js`, best evidence first:
what the host page asked for (`data-lang` on the script tag, or
`Signalo.setLanguage(code)`), then a language the seller pinned, then the
`lang` cookie, then `Accept-Language`, then the seller's own language, then
English.

The host-page override exists because a site with its own language switcher
knows which language the visitor is reading *right now*, and the panel is a
separate document — changing a cookie does nothing to a frame that has already
loaded. `Signalo.setLanguage(code)` re-points the frame and re-fetches the
launcher's labels, no reload. Launcher labels stored as
`preset:<key>` are translated per visitor; anything typed by hand is shown
verbatim. `node scripts/test-widget-language.mjs` covers the ordering.

`window.Signalo.destroy()` takes the widget off the page. A single-page host
has to call it on unmount — without it the launcher outlives the route that
mounted it, which is what `src/app/(landing)/demo-widget.jsx` exists to show.

The header says who is answering, not who the assistant is called — on most
accounts the persona shares the business name, so it read it out twice. The
three states are the assistant answering, a colleague answering (the panel
learns this the moment a reply comes back as JSON rather than a stream), and
the assistant paused because the account has run out of credits.

`conversations.handoff_released_at` makes an agent's decision stick. Clearing
`handoff` was enough for the assistant to start replying again but not enough
for it to stop escalating: the transcript still ended with "a colleague will
help", so it called `request_human` on the customer's very next message and
undid the hand-back before anyone saw it. The tool now refuses until the
assistant has actually replied once, and the prompt says why.

The panel closes itself by posting `{ type: "signalo:close" }` to the parent.
That is the only way out on a phone, where the panel fills the screen and the
launcher is hidden behind it.

## Instagram DMs

Instagram messaging runs on the same Meta app as WhatsApp. The seller's
Instagram must be a *professional* account linked to a Facebook Page, with
"Allow access to messages" turned on in the Instagram app.

One-click connect needs one extra variable beyond the WhatsApp ones:

```
NEXT_PUBLIC_META_IG_CONFIG_ID=   # Facebook Login for Business config for Instagram messaging
META_VERIFY_TOKEN=               # only for the shared callback below
```

Without it the dashboard falls back to the manual fields (access token,
Instagram account id, app secret) and a per-channel callback URL.

Meta allows only **one** Instagram callback URL per app, so a deployment
serving several sellers cannot give each its own path. Point the app at
`/api/channels/instagram/app` and inbound messages are routed to the right
channel by the Instagram account id in the payload; `META_VERIFY_TOKEN` is
what that shared URL checks during Meta's handshake. The per-channel URL
(`/api/channels/instagram/<channel id>`) still works for a single account.

## Testing webhooks locally

Telegram, WhatsApp and Instagram need a public HTTPS URL — local TLS is not enough, since
the provider has to reach your machine from the internet.

```bash
ngrok http 3001                       # gives https://<something>.ngrok-free.dev
```

Put that URL in `.env` as `URL=`, restart `next dev`, then press
**Connect webhook** on the Telegram channel. The free ngrok URL changes every
restart — update `URL` and reconnect each time.

`next.config.mjs` allows the ngrok origin via `allowedDevOrigins`; without it
Next rejects the tunnelled dev requests.

## Notes

- `messages.role` is `customer` / `assistant` / `agent`; the model's `user` /
  `assistant` vocabulary is mapped at the boundary in `engine.js`.
- `conversations.channel` is `webchat` / `telegram` / `whatsapp` / `instagram` /
  `email` / `playground` — `playground` keeps dashboard test chats out of the
  real inbox.
- `messages.metadata.actions` records what a reply actually did (booked, moved,
  cancelled, order, handoff). The inbox renders these as chips under the
  message, so a transcript says whether a promise became a real booking.
- Channel `secrets` (bot tokens, webhook secrets) are never returned to the
  client; `getChannels` exposes only a `has_token` flag.
- Opening hours are per account, not per persona — one account is one business.
- Times are handled in `Asia/Almaty`. It is a constant (`TZ` /
  `DEFAULT_TZ`), not yet a per-account setting.
- The knowledge base holds FAQs, policies, flows and templates only. Products
  and services are real rows in their own tables; the old text entries were
  moved there by migration 0006 and archived in `knowledge_entries_archive`.
