// Runs tests/*.test.ts with Node's built-in test runner (no extra dependencies).
// Each test is bundled with esbuild (fetched on demand by npx) and the DB is stubbed.
// Usage: npm test   (or: node scripts/run-tests.mjs)
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, ".test-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.ts"));
const built = [];
for (const f of files) {
  const dest = path.join(out, f.replace(/\.ts$/, ".mjs"));
  execFileSync("npx", ["-y", "esbuild@0.24.0", path.join("tests", f), "--bundle", "--platform=node", "--format=esm",
    `--outfile=${dest}`, `--alias:@/lib/db=./tests/_stub-db.ts`, "--alias:@=./src", "--log-level=warning",
    "--banner:js=import{createRequire}from'module';const require=createRequire(import.meta.url);"], { cwd: root, stdio: "inherit" });
  built.push(dest);
}
execFileSync(process.execPath, ["--test", ...built], { stdio: "inherit" });
