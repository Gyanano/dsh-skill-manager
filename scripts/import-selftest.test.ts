import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillImporter, parseGitHubRepositoryUrl } from "../src/skill-import";

const temporary = mkdtempSync(join(tmpdir(), "dsm-import-tests-"));
const previousHome = process.env.DSH_HOME;
const importer = createSkillImporter();
const source = join(temporary, "source");
const home = join(temporary, "home");
process.env.DSH_HOME = home;
function fixture(root: string, name: string, frontmatterName = name): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "assets"));
  mkdirSync(join(dir, "references"));
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${frontmatterName}\ndescription: Description ${name}\n---\nBody`);
  writeFileSync(join(dir, "scripts", "never-run.js"), "throw new Error('must not execute')");
  writeFileSync(join(dir, "assets", "binary.bin"), Buffer.from([0, 255, 123]));
  writeFileSync(join(dir, "references", "readme.md"), "Reference");
  return dir;
}
async function rejectsScan(path: string, service = importer): Promise<void> {
  await assert.rejects(service.scan({ kind: "local", path }));
}
try {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/owner/repo"), { url: "https://github.com/owner/repo.git" });
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/owner/repo.git/tree/main"), { url: "https://github.com/owner/repo.git", ref: "main" });
  for (const url of ["http://github.com/o/r", "https://github.com.evil/o/r", "https://u@github.com/o/r", "https://github.com:443/o/r", "https://github.com/o/r/tree/a/b", "https://github.com/o/r/tree/a%2Fb", "https://github.com/o/../r", "https://github.com/o/r?x=1", "https://github.com/o/r#x", "https://github.com/o/r/tree/--evil", "https://github.com/o/r/tree/a..b"]) assert.throws(() => parseGitHubRepositoryUrl(url), url);
  const alpha = fixture(source, "alpha");
  fixture(join(source, "nested"), "beta");
  const scan = await importer.scan({ kind: "local", path: source });
  assert.equal(scan.candidates.length, 2);
  assert.equal(scan.destination, join(home, "skills"));
  assert.equal(scan.candidates.find((c) => c.name === "beta")!.relativePath, "nested/beta");
  assert.equal(scan.candidates[0].description, "Description alpha");
  assert.throws(() => importer.importSelected(scan.token, ["../../escape"]));
  assert.throws(() => importer.importSelected(scan.token, []));
  const result = importer.importSelected(scan.token, [scan.candidates.find((c) => c.name === "alpha")!.id]);
  assert.equal(result.imported.length, 1);
  assert.equal(existsSync(join(home, "skills", "beta")), false);
  assert.deepEqual(readFileSync(join(home, "skills", "alpha", "assets", "binary.bin")), Buffer.from([0, 255, 123]));
  assert.equal(readFileSync(join(home, "skills", "alpha", "scripts", "never-run.js"), "utf8"), "throw new Error('must not execute')");
  assert.equal(readFileSync(join(home, "skills", "alpha", "references", "readme.md"), "utf8"), "Reference");
  const readOnlySource = join(temporary, "readonly-source");
  mkdirSync(join(readOnlySource, "locked"), { recursive: true });
  writeFileSync(join(readOnlySource, "locked", "SKILL.md"), "---\nname: locked\ndescription: Locked\n---\nBody");
  writeFileSync(join(readOnlySource, "locked", "extra.txt"), "read only payload");
  chmodSync(join(readOnlySource, "locked", "extra.txt"), 0o444);
  const readOnlyScan = await importer.scan({ kind: "local", path: readOnlySource });
  const readOnlyResult = importer.importSelected(readOnlyScan.token, readOnlyScan.candidates.map((c) => c.id));
  assert.equal(readOnlyResult.imported.length, 1);
  assert.equal(readFileSync(join(home, "skills", "locked", "extra.txt"), "utf8"), "read only payload");
  assert.throws(() => importer.importSelected(scan.token, [scan.candidates[0].id]));
  const conflict = await importer.scan({ kind: "local", path: source });
  assert.equal(conflict.candidates.find((c) => c.name === "alpha")!.conflict, true);
  assert.throws(() => importer.importSelected(conflict.token, conflict.candidates.map((c) => c.id)), /已存在/);
  assert.equal(existsSync(join(home, "skills", "beta")), false);
  writeFileSync(join(home, "skills", "beta.md.disabled"), "do not overwrite");
  const flat = await importer.scan({ kind: "local", path: source });
  assert.equal(flat.candidates.find((c) => c.name === "beta")!.conflict, true);
  assert.throws(() => importer.importSelected(flat.token, [flat.candidates.find((c) => c.name === "beta")!.id]), /已存在/);
  const changed = await importer.scan({ kind: "local", path: source });
  writeFileSync(join(alpha, "references", "readme.md"), "Changed");
  assert.throws(() => importer.importSelected(changed.token, [changed.candidates.find((c) => c.name === "beta")!.id]), /scan 后变化/);
  const replacement = await importer.scan({ kind: "local", path: source });
  renameSync(source, `${source}-old`);
  mkdirSync(source);
  fixture(source, "gamma");
  assert.throws(() => importer.importSelected(replacement.token, [replacement.candidates[0].id]), /scan 后变化/);
  await rejectsScan("relative/path");
  const malicious = join(temporary, "malicious");
  fixture(malicious, "unsafe", "../escape");
  const traversal = await importer.scan({ kind: "local", path: malicious });
  assert.equal(traversal.candidates[0].conflict, true);
  assert.throws(() => importer.importSelected(traversal.token, [traversal.candidates[0].id]), /不安全/);
  const invalid = join(temporary, "invalid");
  mkdirSync(invalid);
  writeFileSync(join(invalid, "SKILL.md"), "No frontmatter");
  const invalidScan = await importer.scan({ kind: "local", path: invalid });
  assert.equal(invalidScan.candidates[0].conflict, true);
  assert.match(invalidScan.candidates[0].error!, /description/);
  assert.throws(() => importer.importSelected(invalidScan.token, [invalidScan.candidates[0].id]), /无效技能/);
  const linked = join(temporary, "linked");
  mkdirSync(linked);
  symlinkSync(source, join(linked, "junction"), process.platform === "win32" ? "junction" : "dir");
  await rejectsScan(linked);
  await rejectsScan(join(linked, "junction"));
  const bytes = createSkillImporter({ maxBytes: 1 });
  const depth = createSkillImporter({ maxDepth: 1 });
  const files = createSkillImporter({ maxFiles: 1 });
  try { await rejectsScan(source, bytes); await rejectsScan(source, depth); await rejectsScan(source, files); }
  finally { bytes.dispose(); depth.dispose(); files.dispose(); }
  const expired = createSkillImporter({ ttlMs: 1 });
  try {
    const value = await expired.scan({ kind: "local", path: source });
    await new Promise((accept) => setTimeout(accept, 10));
    expired.cleanupExpired();
    assert.throws(() => expired.importSelected(value.token, [value.candidates[0].id]), /过期/);
  } finally { expired.dispose(); }
  const userDirectory = join(temporary, "user-directory");
  mkdirSync(userDirectory);
  writeFileSync(join(userDirectory, "sentinel"), "preserve");
  const linkedHome = join(temporary, "linked-home");
  symlinkSync(userDirectory, linkedHome, process.platform === "win32" ? "junction" : "dir");
  process.env.DSH_HOME = linkedHome;
  const unsafeDestination = await importer.scan({ kind: "local", path: source });
  assert.throws(() => importer.importSelected(unsafeDestination.token, [unsafeDestination.candidates[0].id]), /symlink|junction/);
  assert.equal(existsSync(join(userDirectory, "skills")), false);
  assert.equal(readFileSync(join(userDirectory, "sentinel"), "utf8"), "preserve");
  const bothHome = join(temporary, "both-home");
  process.env.DSH_HOME = bothHome;
  const both = await importer.scan({ kind: "local", path: `${source}-old` });
  assert.equal(importer.importSelected(both.token, both.candidates.map((c) => c.id)).imported.length, 2);
  assert.equal(readdirSync(join(bothHome, "skills")).some((name) => name.startsWith(".import-")), false);
  console.log("import selftest passed: fixtures, conflicts, subset, preservation, TOCTOU, paths, junction, limits, TTL, URL parsing");
} finally {
  importer.dispose();
  if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
  rmSync(temporary, { recursive: true, force: true });
}
