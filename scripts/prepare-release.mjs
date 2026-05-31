import fs from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));
const outDir = path.join("release", manifest.version);
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const file of ["manifest.json", "styles.css", "dist/main.js"]) {
  const targetName = file === "dist/main.js" ? "main.js" : path.basename(file);
  await fs.copyFile(file, path.join(outDir, targetName));
}

console.log(`Prepared release assets in ${outDir}`);
console.log("Upload manifest.json, main.js, and styles.css to a GitHub release tagged exactly:", manifest.version);
