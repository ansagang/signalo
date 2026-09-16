/** node scripts/test-ingest.mjs */
import { chunk } from "../src/lib/knowledge/ingest.js";

let pass=0, fail=0;
const t=(name,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);ok?pass++:fail++;
  console.log(`${ok?"✓":"✗"} ${name}`); if(!ok) console.log(`    got ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);};

const para = (n) => "x".repeat(n);
t("short scraps are dropped", chunk("too short"), []);
t("one solid paragraph survives", chunk(para(400)).length, 1);
t("paragraphs are packed together", chunk([para(300), para(300)].join("\n\n")).length, 1);
t("and split once they exceed the ceiling", chunk([para(700), para(700)].join("\n\n")).length, 2);

const long = Array.from({length:12},(_,i)=>`Sentence number ${i} says something useful about the shop.`).join(" ");
const pieces = chunk(long, { max: 200 });   // floor is clamped to max/2
t("a long paragraph splits on sentence ends", pieces.length > 1, true);
t("and no piece exceeds the ceiling", pieces.every(p=>p.length<=200), true);
t("nothing is cut mid-word", pieces.every(p=>p===p.trim()), true);
t("a floor above the ceiling does not eat everything", chunk(para(300),{min:5000,max:400}).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
