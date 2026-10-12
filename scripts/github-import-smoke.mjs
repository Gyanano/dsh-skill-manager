import { build } from "esbuild";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "dsm-github-smoke-"));
const savedHome = process.env.DSH_HOME;
let importer;
try {
  process.env.DSH_HOME = join(temporary, "home");
  mkdirSync(process.env.DSH_HOME);
  const outfile = join(temporary, "importer.mjs");
  await build({ entryPoints: [join(root, "src/skill-import.ts")], outfile, bundle: true, format: "esm", platform: "node", logLevel: "warning" });
  const module = await import(pathToFileURL(outfile).href);
  importer = module.createSkillImporter();
  const result = await importer.scan({ kind: "github", url: process.argv[2] ?? "https://github.com/anthropics/skills" });
  if (result.candidates.length === 0) throw new Error("GitHub scan found no candidates");
  console.log(`GitHub public scan verified: ${result.candidates.length} candidates; no skills installed`);
} finally {
  importer?.dispose();
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
  rmSync(temporary, { recursive: true, force: true });
}
