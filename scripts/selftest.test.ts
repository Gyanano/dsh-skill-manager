import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editFrontmatter, isManagedStubBody, parseSkillFile, workspaceStubDocument } from "../src/frontmatter";
import { isPathInside, projectRootOf, workspaceKey } from "../src/paths";
import {
  listSkillEntries,
  removeWorkspaceStub,
  toggleGlobalDisabled,
  toggleProjectSkill,
  writeWorkspaceStub,
  type ExtraRoots,
} from "../src/skill-files";
import { loadState, saveState, stateFilePath, workspaceState } from "../src/state";

const home = mkdtempSync(join(tmpdir(), "dsm-test-"));
const project = join(home, "project");
const dshSkills = join(home, "dsh-home", "skills");
mkdirSync(join(project, ".git"), { recursive: true });
mkdirSync(dshSkills, { recursive: true });

const extra: ExtraRoots = { customSkillDirs: [], bundledSkillDir: join(home, "bundled-skills") };

const originalHome = process.env.DSH_HOME;
const originalAgents = process.env.DSH_AGENTS_HOME;
process.env.DSH_HOME = join(home, "dsh-home");
process.env.DSH_AGENTS_HOME = join(home, "agents-home");

try {
  writeFileSync(join(dshSkills, "office-docx.md"), [
    "---",
    "name: office-docx",
    "description: Create and edit Word documents",
    "whenToUse: Use when a DOCX file is requested",
    "---",
    "",
    "Use LibreOffice.",
    "",
  ].join("\n"));
  mkdirSync(join(dshSkills, "asd-ste100"), { recursive: true });
  writeFileSync(join(dshSkills, "asd-ste100", "SKILL.md"), [
    "---",
    "name: asd-ste100",
    "description: 'Plain-language rewrite'",
    "disable-model-invocation: false",
    "---",
    "body text",
  ].join("\n"));
  writeFileSync(join(dshSkills, "packed.md.disabled"), [
    "---",
    "name: packed",
    "description: disabled skill",
    "---",
  ].join("\n"));

  const globalEntries = listSkillEntries(undefined, extra);
  assert.deepEqual(globalEntries.map((entry) => `${entry.name}:${entry.source}:${String(entry.disabled)}`).sort(), [
    "asd-ste100:user-dsh:false",
    "office-docx:user-dsh:false",
    "packed:user-dsh:true",
  ]);

  const office = globalEntries.find((entry) => entry.name === "office-docx");
  assert.ok(office !== undefined);
  assert.equal(office.kind, "flat");
  assert.equal(office.invocation.modelInvocable, true);

  const ste = globalEntries.find((entry) => entry.name === "asd-ste100");
  assert.ok(ste !== undefined);
  assert.equal(ste.invocation.modelInvocable, true);
  assert.equal(ste.invocation.userInvocable, true);

  const roots = projectRootOf(project);
  assert.equal(roots, project);

  const workspaceEntries = listSkillEntries(project, extra);
  assert.equal(workspaceEntries.filter((entry) => entry.source === "project-dsh").length, 0);

  writeWorkspaceStub(project, office!);
  const stubPath = join(project, ".dsh", "skills", "office-docx", "SKILL.md");
  assert.ok(existsSync(stubPath));
  const stubParsed = parseSkillFile(readFileSync(stubPath, "utf8"));
  assert.equal(stubParsed.name, "office-docx");
  assert.equal(stubParsed.invocation?.modelInvocable, false);
  assert.equal(stubParsed.invocation?.userInvocable, false);
  assert.ok(isManagedStubBody(stubParsed.body));

  let stubbedAgain;
  try {
    writeWorkspaceStub(project, office!);
    stubbedAgain = false;
  } catch {
    stubbedAgain = true;
  }
  assert.equal(stubbedAgain, false);

  const afterStub = listSkillEntries(project, extra);
  assert.equal(afterStub.filter((entry) => entry.name === "office-docx" && entry.managedStub).length, 1);

  removeWorkspaceStub(project, "office-docx");
  assert.ok(!existsSync(stubPath));

  toggleGlobalDisabled(office!, false);
  assert.ok(existsSync(join(dshSkills, "office-docx.md.disabled")));
  assert.ok(!existsSync(join(dshSkills, "office-docx.md")));
  const afterRename = listSkillEntries(undefined, extra).find((entry) => entry.name === "office-docx");
  assert.equal(afterRename?.disabled, true);
  toggleGlobalDisabled(afterRename!, true);
  assert.ok(existsSync(join(dshSkills, "office-docx.md")));

  const projectSkillPath = join(project, ".dsh", "skills", "local-tool", "SKILL.md");
  mkdirSync(join(project, ".dsh", "skills", "local-tool"), { recursive: true });
  writeFileSync(projectSkillPath, ["---", "name: local-tool", "description: project skill", "---", "do things"].join("\n"));
  const localTool = listSkillEntries(project, extra).find((entry) => entry.name === "local-tool");
  assert.ok(localTool !== undefined);
  toggleProjectSkill(localTool!, false);
  const disabledText = readFileSync(projectSkillPath, "utf8");
  assert.ok(disabledText.includes("disable-model-invocation: true"));
  assert.ok(disabledText.includes("user-invocable: false"));
  assert.ok(disabledText.includes("do things"));
  toggleProjectSkill(listSkillEntries(project, extra).find((entry) => entry.name === "local-tool")!, true);
  const enabledText = readFileSync(projectSkillPath, "utf8");
  assert.ok(!disabledTextDoesInclude(enabledText));
  assert.ok(enabledText.includes("name: local-tool"));

  const edited = editFrontmatter(["---", "name: x", "description: y", "---", "body"].join("\n"), {
    removeKeys: ["description"],
    appendLines: ["disable-model-invocation: true"],
  });
  assert.ok(edited.includes("name: x"));
  assert.ok(!edited.includes("description: y"));
  assert.ok(edited.includes("disable-model-invocation: true"));

  assert.equal(isPathInside(join(home, "dsh-home", "skills", "a.md"), join(home, "dsh-home", "skills")), true);
  assert.equal(isPathInside(join(home, "other", "a.md"), join(home, "dsh-home", "skills")), false);

  const stateFile = stateFilePath();
  assert.equal(existsSync(stateFile), false);
  const state = loadState();
  const workspace = workspaceState(state, workspaceKey(project), project);
  workspace.mcp["kimi-cu"] = { entryId: "mcp-kimi-cu", title: "Kimi CU" };
  saveState(state);
  const reloaded = loadState();
  assert.equal(reloaded.workspaces[workspaceKey(project)]?.mcp["kimi-cu"]?.entryId, "mcp-kimi-cu");

  const parsed = parseSkillFile("no frontmatter here");
  assert.equal(parsed.hasFrontmatter, false);
  const invalid = parseSkillFile(["---", "name: bad", "description: bad", "disable-model-invocation: banana", "---"].join("\n"));
  assert.equal(invalid.invalidInvocation, true);
  assert.equal(invalid.invocation, undefined);

  const folded = parseSkillFile([
    "---",
    "name: adaptive-builder-core",
    "description: >",
    "  A compact set of principles for AI-assisted project execution.",
    "  Use this skill when solving engineering tasks.",
    "",
    "  Second paragraph.",
    "whenToUse: >-",
    "  When the assistant must balance completeness.",
    "  Another folded line.",
    "---",
    "Body",
  ].join("\n"));
  assert.equal(folded.name, "adaptive-builder-core");
  assert.equal(folded.description, "A compact set of principles for AI-assisted project execution. Use this skill when solving engineering tasks.\nSecond paragraph.");
  assert.equal(folded.whenToUse, "When the assistant must balance completeness. Another folded line.");
  const literal = parseSkillFile(["---", "description: |", "  line one", "  line two", "name: literal", "---"].join("\n"));
  assert.equal(literal.description, "line one\nline two");
  assert.equal(literal.name, "literal");
  const inlineBlock = parseSkillFile(["---", "description: >", "  single folded value", "user-invocable: false", "---"].join("\n"));
  assert.equal(inlineBlock.description, "single folded value");
  assert.equal(inlineBlock.invocation?.userInvocable, false);
  const editedBlock = editFrontmatter(["---", "description: >", "  keep me", "  as folded", "---", "Body"].join("\n"), { removeKeys: ["disable-model-invocation"], appendLines: ["disable-model-invocation: true"] });
  assert.ok(editedBlock.includes("  as folded"), "block scalar continuation preserved by edits");
  assert.equal(parseSkillFile(editedBlock).description, "keep me as folded");

  console.log("selftest: all assertions passed");
} finally {
  if (originalHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalHome;
  if (originalAgents === undefined) delete process.env.DSH_AGENTS_HOME;
  else process.env.DSH_AGENTS_HOME = originalAgents;
  rmSync(home, { recursive: true, force: true });
}

function disabledTextDoesInclude(text: string): boolean {
  return text.includes("disable-model-invocation: true") || text.includes("user-invocable: false");
}
