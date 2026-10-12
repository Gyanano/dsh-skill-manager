import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const temporary = mkdtempSync(join(tmpdir(), "dsm-import-test-build-"));
try {
  const outfile = join(temporary, "test.mjs");
  await build({ entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "import-selftest.test.ts")], outfile, bundle: true, format: "esm", platform: "node", target: ["node22"], logLevel: "warning" });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
