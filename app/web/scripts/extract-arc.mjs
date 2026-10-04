// Extracts Arc UI registry items (uiarc.dev) into components/arc, as the shadcn registry would.
import fs from "node:fs";
import path from "node:path";
const src = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? path.resolve("../../_research/uiarc");
const out = path.resolve("components/arc");
const force = process.argv.includes("--force");
// Only these registry items are installed. Anything else in the folder (and anything removed from the app) is skipped.
const ITEMS = new Set(["arc-foundation","alert","animated-counter","avatar","badge","bar-chart","button","card","checkbox","dialog","donut-chart","empty-state","gauge","input","line-chart","metric-card","password-field","progress","segmented-control","select","skeleton","slope-chart","sortable-data-table","sparkline","stepper","switch","tabs","text-reveal","toast","usage-meter"]);
const deps = new Set();
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith(".json") || !ITEMS.has(f.slice(0, -5))) continue;
  const item = JSON.parse(fs.readFileSync(path.join(src, f), "utf8"));
  (item.dependencies ?? []).forEach((d) => deps.add(d));
  for (const file of item.files ?? []) {
    const rel = file.target.replace(/^@components\/arc\//, "");
    const dest = path.join(out, rel);
    // Installed files are owned by the app (gauge.tsx has a local `unit` prop), so existing ones are kept unless --force.
    if (fs.existsSync(dest) && !force) { console.log("kept", rel); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content);
    console.log("wrote", rel);
  }
}
console.log("deps:", [...deps].join(" "));
