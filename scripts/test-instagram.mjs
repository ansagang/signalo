/**
 * Unit tests for reading Instagram webhook payloads.
 *
 * The expensive mistakes here are silent ones: answering our own echoed DM
 * puts the bot in a loop with itself, and treating a reel share as empty text
 * makes it reply to nothing at all.
 *
 *   node scripts/test-instagram.mjs
 */
import { readMessage, instagramRecipient, hostFor } from "../src/lib/channels/instagram.js";

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
};

t("plain text", readMessage({ message: { mid: "m1", text: "  hi  " } }), { text: "hi", kind: "text" });

t(
  "our own reply echoed back is never answered",
  readMessage({ message: { mid: "m2", text: "Booked you in", is_echo: true } }),
  { text: "", kind: "echo" },
);

t(
  "a deleted message is not answered either",
  readMessage({ message: { mid: "m3", text: "oops", is_deleted: true } }),
  { text: "", kind: "echo" },
);

t(
  "a story reply keeps its text but says where it came from",
  readMessage({ message: { mid: "m4", text: "how much?", reply_to: { story: { id: "s1" } } } }),
  { text: "how much?", kind: "story_reply" },
);

t(
  "a shared reel has no text to answer",
  readMessage({ message: { mid: "m5", attachments: [{ type: "ig_reel" }] } }),
  { text: "", kind: "share" },
);

t(
  "a voice note reports its own type",
  readMessage({ message: { mid: "m6", attachments: [{ type: "audio" }] } }),
  { text: "", kind: "audio" },
);

t("a reaction carries no message at all", readMessage({ reaction: { emoji: "❤️" } }), { text: "", kind: "none" });

t(
  "the customer id comes out of the session key",
  instagramRecipient({ external_session_id: "instagram:abc-123:78901" }),
  "78901",
);

t("a malformed session key yields nothing to send to", instagramRecipient({ external_session_id: "instagram" }), null);

t("Facebook login talks to the Graph host", hostFor("facebook"), "https://graph.facebook.com/v21.0");
t("Instagram login talks to its own host", hostFor("instagram"), "https://graph.instagram.com/v21.0");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
