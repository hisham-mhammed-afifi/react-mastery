import { readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentDir = join(__dirname, "..", "public", "content");
const outputPath = join(__dirname, "..", "public", "content-manifest.json");

const files = readdirSync(contentDir)
  .filter((f) => f.endsWith(".md") && f !== "PROGRESS.md")
  .sort();

writeFileSync(outputPath, JSON.stringify(files, null, 2));
console.log(`Generated manifest with ${files.length} files: ${outputPath}`);
