import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isManagedStubBody, parseSkillFile, workspaceStubDocument } from "./frontmatter";
import { agentsHome, dshHome, isPathInside, projectRootOf } from "./paths";

export type SkillSource = "project-dsh" | "project-agents" | "custom" | "user-dsh" | "user-agents" | "bundled";

export interface SkillRoot {
  source: SkillSource;
  rank: number;
  dir: string;
}

export interface SkillEntry {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: { modelInvocable: boolean; userInvocable: boolean };
  source: SkillSource;
  rank: number;
  path: string;
  disabled: boolean;
  kind: "bundle" | "flat";
  managedStub: boolean;
  parseError?: string;
  readOnly: boolean;
}

export interface ExtraRoots {
  customSkillDirs: string[];
  bundledSkillDir?: string;
}

export function skillRoots(cwd: string | undefined, extra: ExtraRoots): SkillRoot[] {
  const roots: SkillRoot[] = [];
  if (cwd !== undefined && cwd !== "") {
    const projectRoot = projectRootOf(cwd);
    roots.push({ source: "project-dsh", rank: 100, dir: join(projectRoot, ".dsh", "skills") });
    roots.push({ source: "project-agents", rank: 200, dir: join(projectRoot, ".agents", "skills") });
  }
  for (const dir of extra.customSkillDirs) {
    roots.push({ source: "custom", rank: 300, dir });
  }
  roots.push({ source: "user-dsh", rank: 400, dir: join(dshHome(), "skills") });
  roots.push({ source: "user-agents", rank: 500, dir: join(agentsHome(), "skills") });
  const bundled = extra.bundledSkillDir ?? process.env.DSH_BUNDLED_SKILL_DIR;
  if (bundled !== undefined && bundled !== "") roots.push({ source: "bundled", rank: 600, dir: bundled });
  return roots;
}

export function listSkillEntries(cwd: string | undefined, extra: ExtraRoots): SkillEntry[] {
  const entries: SkillEntry[] = [];
  for (const root of skillRoots(cwd, extra)) {
    entries.push(...scanSkillRoot(root));
  }
  return entries;
}

function scanSkillRoot(root: SkillRoot): SkillEntry[] {
  if (!existsSync(root.dir)) return [];
  let names: string[];
  try {
    names = readdirSync(root.dir);
  } catch {
    return [];
  }
  const entries: SkillEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    if (root.source === "user-dsh" && name === ".system") continue;
    const bundleDisabled = join(root.dir, name, "SKILL.md.disabled");
    const bundlePath = join(root.dir, name, "SKILL.md");
    if (existsSync(bundlePath)) {
      pushEntry(entries, name, bundlePath, root, "bundle", false);
      continue;
    }
    if (existsSync(bundleDisabled)) {
      pushEntry(entries, name, bundleDisabled, root, "bundle", true);
      continue;
    }
    if (name.endsWith(".md")) {
      const flatPath = join(root.dir, name);
      pushEntry(entries, name.slice(0, -".md".length), flatPath, root, "flat", false);
      continue;
    }
    if (name.endsWith(".md.disabled")) {
      const flatPath = join(root.dir, name);
      pushEntry(entries, name.slice(0, -".md.disabled".length), flatPath, root, "flat", true);
    }
  }
  return entries;
}

function pushEntry(entries: SkillEntry[], layoutName: string, path: string, root: SkillRoot, kind: "bundle" | "flat", disabled: boolean): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const parsed = parseSkillFile(text);
  entries.push({
    name: parsed.name ?? layoutName,
    description: parsed.description ?? "",
    whenToUse: parsed.whenToUse,
    invocation: parsed.invocation ?? { modelInvocable: true, userInvocable: true },
    source: root.source,
    rank: root.rank,
    path,
    disabled,
    kind,
    managedStub: isManagedStubBody(parsed.body),
    parseError: parsed.description === undefined
      ? "缺少 description 或 frontmatter 无法解析"
      : parsed.invalidInvocation
        ? "invocation 布尔值无效"
        : undefined,
    readOnly: root.source === "bundled",
  });
}

export function toggleGlobalDisabled(entry: SkillEntry, enable: boolean): void {
  const target = enable ? entry.path.slice(0, -".disabled".length) : `${entry.path}.disabled`;
  renameSync(entry.path, target);
}

export function toggleProjectSkill(entry: SkillEntry, enable: boolean): void {
  let text: string;
  try {
    text = readFileSync(entry.path, "utf8");
  } catch (error) {
    throw new Error(`无法读取技能文件：${String(error)}`);
  }
  const edited = editInvocationKeys(
    text,
    enable ? [] : ["disable-model-invocation: true", "user-invocable: false"],
    ["disable-model-invocation", "user-invocable"],
  );
  writeFileSync(entry.path, edited);
}

function editInvocationKeys(text: string, appendLines: string[], removeKeys: string[]): string {
  if (!text.startsWith("---")) return text;
  const lines = text.split(/\r?\n/);
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      closing = index;
      break;
    }
  }
  if (closing === -1) return text;
  const kept = lines.slice(1, closing).filter((line) => {
    const key = line.slice(0, line.indexOf(":")).trim();
    return !removeKeys.includes(key);
  });
  return ["---", ...kept, ...appendLines, "---", ...lines.slice(closing + 1)].join("\n");
}

export function workspaceStubDir(cwd: string, name: string): string {
  return join(projectRootOf(cwd), ".dsh", "skills", name);
}

export function writeWorkspaceStub(cwd: string, entry: SkillEntry): void {
  const dir = workspaceStubDir(cwd, entry.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), workspaceStubDocument(entry.name, entry.description, entry.whenToUse));
}

export function removeWorkspaceStub(cwd: string, name: string): void {
  const dir = workspaceStubDir(cwd, name);
  const stubPath = join(dir, "SKILL.md");
  if (!existsSync(stubPath)) return;
  const parsed = parseSkillFile(readFileSync(stubPath, "utf8"));
  if (!isManagedStubBody(parsed.body)) {
    throw new Error("同名项目技能不是本插件创建的占位，已拒绝删除");
  }
  if (readdirSync(dir).some((name) => name !== "SKILL.md")) {
    throw new Error("占位目录含其他文件，已拒绝删除；请手动检查");
  }
  rmSync(stubPath);
  rmdirSync(dir);
}

export function workspaceDisabledNames(cwd: string | undefined, extra: ExtraRoots): Set<string> {
  if (cwd === undefined || cwd === "") return new Set();
  const disabled = new Set<string>();
  for (const root of skillRoots(cwd, extra).slice(0, 2)) {
    for (const entry of scanSkillRoot(root)) {
      if (entry.managedStub) disabled.add(entry.name);
    }
  }
  return disabled;
}

export function assertPathInRoots(path: string, extra: ExtraRoots): boolean {
  for (const root of skillRoots(undefined, extra)) {
    if (isPathInside(path, root.dir)) return true;
  }
  return false;
}
