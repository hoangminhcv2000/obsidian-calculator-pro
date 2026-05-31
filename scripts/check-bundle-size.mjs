import fs from "node:fs/promises";

const maxBytes = 250 * 1024;
const stat = await fs.stat("dist/main.js");
if (stat.size > maxBytes) {
  console.error(`Bundle is too large: ${stat.size} bytes > ${maxBytes} bytes`);
  process.exit(1);
}
console.log(`Bundle size OK: ${stat.size} bytes / ${maxBytes} bytes`);
