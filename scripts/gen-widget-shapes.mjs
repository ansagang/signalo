import fs from "fs";
import path from "path";

// Dashboard shape key → lucide icon file.
const MAP = {
  bot: "bot", sparkles: "sparkles", message: "message-circle", headset: "headset",
  bag: "shopping-bag", scissors: "scissors", heart: "heart", star: "star",
  zap: "zap", coffee: "coffee", gem: "gem", flower: "flower",
  wrench: "wrench", package: "package", smile: "smile", crown: "crown",
  leaf: "leaf", rocket: "rocket",
};

const dir = "node_modules/lucide-react/dist/esm/icons";

function nodesFor(file) {
  const src = fs.readFileSync(path.join(dir, `${file}.js`), "utf8");
  const start = src.indexOf("const __iconNode = [");
  const end = src.indexOf("\n];", start);
  const body = src.slice(start + "const __iconNode = ".length, end + 2);
  // The literal is plain JS data; evaluating it is safe and exact.
  return Function(`return ${body}`)();
}

function toMarkup(nodes) {
  return nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
}

const lines = Object.entries(MAP).map(([key, file]) => {
  const markup = toMarkup(nodesFor(file));
  return `      ${key}: '${markup.replace(/'/g, "\\'")}',`;
});

const block = "    var SHAPES = {\n" + lines.join("\n") + "\n    };";
fs.writeFileSync("/tmp/shapes.txt", block);
console.log(`generated ${lines.length} shapes, ${block.length} bytes`);
