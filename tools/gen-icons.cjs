// Embeds the Lucide icons used by public/index.html directly into the page (no CDN needed).
// Source: the Lucide set shipped inside react-icons (react-icons/lu). Run: node tools/gen-icons.cjs <path-to-react-icons>
const fs = require("fs");
const path = require("path");
const riPath = process.argv[2] || "react-icons";
const file = path.join(__dirname, "..", "public", "index.html");
let html = fs.readFileSync(file, "utf8");

// lucide renamed some icons; react-icons may carry either name
const ALIASES = { "alert-triangle": ["triangle-alert"], "settings-2": ["settings2"], "undo-2": ["undo2"], "trash-2": ["trash2"], "calendar-x": ["calendar-x2"], "user-x": ["user-x2"], "package-check": ["package-check"] };
const pascal = s => "Lu" + s.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("");
const toSvg = node => node.child.map(c => `<${c.tag} ${Object.entries(c.attr).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");

// read the icon trees straight from react-icons' generated source (no React needed)
const src = fs.readFileSync(path.join(riPath, "lu", "index.js"), "utf8");
const trees = {};
for (const m of src.matchAll(/module\.exports\.(Lu\w+) = function \w+ \(props\) \{\s*return GenIcon\((\{.*\})\)\(props\);/g)) trees[m[1]] = JSON.parse(m[2]);
const body = html.replace(/\/\*ICONS-START\*\/[\s\S]*?\/\*ICONS-END\*\//, "");
const names = new Set([...body.matchAll(/['"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"]/g)].map(m => m[1]));
const out = {}, missing = [];
for (const n of names) {
  for (const cand of [n, ...(ALIASES[n] || [])]) {
    const tree = trees[pascal(cand)];
    if (tree) { out[n] = toSvg(tree); break }
  }
}
// report icons referenced via ic('...') that were not found
for (const m of body.matchAll(/ic\('([a-z0-9-]+)'/g)) if (!out[m[1]]) missing.push(m[1]);
const block = `/*ICONS-START*/const ICON_SVG=${JSON.stringify(out)};/*ICONS-END*/`;
html = /\/\*ICONS-START\*\/[\s\S]*?\/\*ICONS-END\*\//.test(html) ? html.replace(/\/\*ICONS-START\*\/[\s\S]*?\/\*ICONS-END\*\//, block) : html.replace("/* ===================== i18n", block + "\n/* ===================== i18n");
fs.writeFileSync(file, html);
console.log("icons embedded:", Object.keys(out).length, "missing:", [...new Set(missing)].join(", ") || "none");
