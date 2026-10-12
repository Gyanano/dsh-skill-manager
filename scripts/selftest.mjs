import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "dsm-selftest-"));
const outfile = join(temporary, "selftest.mjs");

try {
  await build({
    entryPoints: [join(root, "selftest.test.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: ["node22"],
    sourcemap: false,
    logLevel: "warning",
  });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
