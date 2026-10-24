// Construit functions/api/gas/bundle.ts à partir des fichiers .gs, dans l'ordre du projet Apps Script.
// Usage : node tools/build-bundle.mjs fichier1.gs fichier2.gs …   (ou un export « =====FICHIER n : nom ===== »)
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
let parts = [];
if (args.length === 1 && /export/.test(args[0])) {
  const txt = fs.readFileSync(args[0], "utf8");
  const re = /=====FICHIER \d+ : (.+?) \((\w+)\)=====\n/g; let m, last = null;
  while ((m = re.exec(txt))) { if (last) parts.push({ ...last, src: txt.slice(last.end, m.index) }); last = { name: m[1], type: m[2], end: re.lastIndex }; }
  if (last) parts.push({ ...last, src: txt.slice(last.end) });
  parts = parts.filter((p) => p.type === "SERVER_JS");
} else parts = args.map((f) => ({ name: path.basename(f), src: fs.readFileSync(f, "utf8") }));
const code = parts.map((p) => `\n// ===== ${p.name} =====\n` + p.src).join("\n;\n");
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../functions/api/gas/bundle.ts");
fs.writeFileSync(out, "// Généré par tools/build-bundle.mjs — ne pas modifier à la main.\n// Fichiers : " + parts.map((p) => p.name).join(", ") + "\nexport const CODE = " + JSON.stringify(code) + ";\n");
console.log(parts.length + " fichiers, " + code.length + " caractères → " + out);
