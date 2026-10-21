import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, chmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseSkillFile } from "./frontmatter";
import { dshHome } from "./paths";

export type SkillImportSource = { kind: "local"; path: string } | { kind: "github"; url: string };
export interface SkillImportCandidate { id: string; name: string; description: string; relativePath: string; conflict: boolean; error?: string }
export interface SkillImportScan { token: string; expiresAt: number; destination: string; candidates: SkillImportCandidate[] }
export interface SkillImportOptions { ttlMs?: number; maxDepth?: number; maxFiles?: number; maxBytes?: number; cloneTimeoutMs?: number }
export interface GitHubRepository { url: string; ref?: string }
interface Entry { path: string; identity: string; hash: string; mode?: number; data?: Buffer; directory: boolean }
interface Session { root: string; temporary?: string; expiresAt: number; manifest: Entry[]; candidates: SkillImportCandidate[]; home: string }

export function parseGitHubRepositoryUrl(input: string): GitHubRepository {
  if (typeof input !== "string" || !/^https:\/\/github\.com\//.test(input) || /[\\\s%?#]/.test(input)) throw new Error("仅支持明确的 github.com HTTPS 仓库 URL");
  const url = new URL(input);
  if (url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) throw new Error("无效 GitHub 仓库 URL");
  const parts = url.pathname.replace(/\/$/, "").slice(1).split("/");
  if (parts.length !== 2 && !(parts.length === 4 && parts[2] === "tree")) throw new Error("tree URL 只支持单段明确分支，不支持子目录或含斜杠分支");
  const [owner, rawRepo, , ref] = parts;
  const repo = rawRepo.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || repo === "." || repo === "..") throw new Error("无效 GitHub 仓库名称");
  if (ref !== undefined && (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(ref) || ref.includes("..") || ref.endsWith(".") || ref.endsWith(".lock"))) throw new Error("无效 GitHub 分支");
  return { url: `https://github.com/${owner}/${repo}.git`, ...(ref === undefined ? {} : { ref }) };
}

function identity(stat: NonNullable<ReturnType<typeof lstatSync>>): string {
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}

function assertSafePath(path: string): void {
  if (!isAbsolute(path)) throw new Error("路径必须是 absolute");
  let cursor = resolve(path);
  for (;;) {
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("拒绝 symlink/junction 或非目录路径");
    const actual = realpathSync.native(cursor);
    const canonical = process.platform === "win32" ? cursor.toLowerCase() : cursor;
    if ((process.platform === "win32" ? actual.toLowerCase() : actual) !== canonical) throw new Error("拒绝重定向路径");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function ensureSafeDirectory(path: string): void {
  let ancestor = path;
  for (;;) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
  assertSafePath(ancestor);
  mkdirSync(path, { recursive: true });
  assertSafePath(path);
}

function safeName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) throw new Error(`不安全的技能目录名称：${name}`);
  return name;
}

function isRemovalBlocked(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY" || code === "ENOTEMPTY";
}

function makeWritable(target: string): void {
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(target)) makeWritable(join(target, name));
    try { chmodSync(target, 0o777); } catch { /* best-effort */ }
    return;
  }
  try { chmodSync(target, 0o666); } catch { /* best-effort */ }
}

export function createSkillImporter(options: SkillImportOptions = {}) {
  const limits = { ttlMs: 5 * 60_000, maxDepth: 20, maxFiles: 10_000, maxBytes: 64 * 1024 * 1024, cloneTimeoutMs: 60_000, ...options };
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error("限制必须是正整数");
  const sessions = new Map<string, Session>();
  const activeClones = new Map<string, ChildProcess>();
  let disposed = false;
  const ownedTemporary = new Map<string, string>();
  const ownTemporary = (path: string) => {
    const stat = lstatSync(path);
    ownedTemporary.set(path, `${stat.dev}:${stat.ino}`);
  };
  const removeTemporary = (path: string): void => {
    const expected = ownedTemporary.get(path);
    if (!expected) return;
    try {
      assertSafePath(path);
      const stat = lstatSync(path);
      if (`${stat.dev}:${stat.ino}` !== expected) {
        ownedTemporary.delete(path);
        return;
      }
      rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    } catch (error) {
      if (!isRemovalBlocked(error)) {
        ownedTemporary.delete(path);
        return;
      }
      try {
        makeWritable(path);
        rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (failure) {
        console.warn(`dsh-skill-manager: 临时目录清理失败，已保留待下次清理：${path} (${String(failure)})`);
        return;
      }
    }
    ownedTemporary.delete(path);
  };
  const cleanupExpired = () => {
    for (const [token, session] of sessions) if (session.expiresAt <= Date.now()) {
      if (session.temporary) removeTemporary(session.temporary);
      sessions.delete(token);
    }
  };
  const timer = setInterval(() => { try { cleanupExpired(); } catch {} }, Math.min(limits.ttlMs, 30_000));
  timer.unref();

  function snapshot(root: string, capture = false): Entry[] {
    assertSafePath(root);
    const entries: Entry[] = [];
    let files = 0;
    let bytes = 0;
    function walk(path: string, depth: number): void {
      if (depth > limits.maxDepth) throw new Error("来源超过深度限制");
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("拒绝 symlink/junction");
      const rel = relative(root, path).split(sep).join("/");
      if (stat.isDirectory()) {
        entries.push({ path: rel, identity: identity(stat), hash: "", directory: true });
        if (entries.length > limits.maxFiles) throw new Error("来源超过文件/目录数限制");
        for (const name of readdirSync(path).sort()) {
          if (name === ".git") {
            if (lstatSync(join(path, name)).isSymbolicLink()) throw new Error("拒绝 symlink/junction");
            continue;
          }
          walk(join(path, name), depth + 1);
        }
        if (identity(lstatSync(path)) !== identity(stat)) throw new Error("来源目录在读取期间变化");
      } else {
        if (!stat.isFile() || stat.nlink > 1) throw new Error("拒绝特殊文件或 hardlink");
        files += 1;
        bytes += stat.size;
        if (files > limits.maxFiles || entries.length >= limits.maxFiles || bytes > limits.maxBytes) throw new Error("来源超过文件数或字节限制");
        const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          if (identity(fstatSync(fd)) !== identity(stat)) throw new Error("来源文件在打开期间变化");
          const data = Buffer.alloc(stat.size);
          let offset = 0;
          while (offset < data.length) {
            const count = readSync(fd, data, offset, data.length - offset, offset);
            if (count === 0) throw new Error("来源文件在读取期间变化");
            offset += count;
          }
          const extra = Buffer.alloc(1);
          if (readSync(fd, extra, 0, 1, offset) !== 0 || identity(fstatSync(fd)) !== identity(stat) || identity(lstatSync(path)) !== identity(stat)) throw new Error("来源文件在读取期间变化");
          entries.push({ path: rel, identity: identity(stat), mode: stat.mode & 0o777, hash: createHash("sha256").update(data).digest("hex"), ...(capture ? { data } : {}), directory: false });
        } finally { closeSync(fd); }
      }
    }
    walk(root, 0);
    assertSafePath(root);
    return entries;
  }

  async function clone(repository: GitHubRepository, temporary: string): Promise<string> {
    const root = join(temporary, "checkout");
    const empty = join(temporary, "empty");
    mkdirSync(empty);
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) if (!/^GIT_|^(HOME|USERPROFILE|XDG_CONFIG_HOME|SSH_ASKPASS)$/i.test(key)) env[key] = value;
    Object.assign(env, { HOME: empty, USERPROFILE: empty, XDG_CONFIG_HOME: empty, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(empty, "config"), GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GIT_LFS_SKIP_SMUDGE: "1" });
    const args = ["-c", `core.hooksPath=${empty}`, "-c", "credential.helper=", "-c", "credential.interactive=false", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "core.symlinks=false", "-c", "core.longpaths=true", "clone", "--depth", "1", "--single-branch", "--no-recurse-submodules", "--no-local", "--template=", ...(repository.ref ? ["--branch", repository.ref] : []), "--", repository.url, root];
    await new Promise<void>((accept, reject) => {
      const child = spawn("git", args, { env, cwd: empty, stdio: "ignore", windowsHide: true });
      activeClones.set(temporary, child);
      const timeout = setTimeout(() => child.kill(), limits.cloneTimeoutMs);
      child.once("error", (error) => { clearTimeout(timeout); activeClones.delete(temporary); reject(error); });
      child.once("close", (code) => { clearTimeout(timeout); activeClones.delete(temporary); code === 0 ? accept() : reject(new Error("GitHub public clone 失败或超时")); });
    });
    return root;
  }

  async function scan(source: SkillImportSource): Promise<SkillImportScan> {
    if (disposed) throw new Error("导入服务已关闭");
    cleanupExpired();
    let temporary: string | undefined;
    try {
      let root: string;
      if (source.kind === "local") {
        if (typeof source.path !== "string" || !isAbsolute(source.path)) throw new Error("路径必须是 absolute");
        root = resolve(source.path);
      } else if (source.kind === "github") {
        const repository = parseGitHubRepositoryUrl(source.url);
        temporary = mkdtempSync(join(tmpdir(), "dsm-import-"));
        ownTemporary(temporary);
        root = await clone(repository, temporary);
      } else throw new Error("不支持的来源");
      if (sessions.size >= 32) throw new Error("未完成 scan 数量超过限制");
      const destination = join(dshHome(), "skills");
      let existing = new Set<string>();
      try { assertSafePath(destination); existing = new Set(readdirSync(destination).map((name) => name.toLowerCase())); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const manifest = snapshot(root, true);
      const candidates = manifest.filter((entry) => !entry.directory && basename(entry.path) === "SKILL.md").map((entry) => {
        const parsed = parseSkillFile(entry.data!.toString("utf8"));
        const relativePath = dirname(entry.path).split(sep).join("/");
        const name = parsed.name ?? basename(relativePath === "." ? root : relativePath);
        const error = parsed.description === undefined ? "缺少 description 或 frontmatter 无法解析" : parsed.invalidInvocation ? "invocation 布尔值无效" : undefined;
        let conflict = error !== undefined || ["", ".md", ".md.disabled", ".disabled"].some((suffix) => existing.has(`${name}${suffix}`.toLowerCase()));
        try { safeName(name); } catch { conflict = true; }
        return { id: randomUUID(), name, description: parsed.description ?? "", relativePath, conflict, ...(error === undefined ? {} : { error }) };
      });
      for (const entry of manifest) delete entry.data;
      if (disposed) throw new Error("导入服务已关闭");
      const token = randomUUID();
      const expiresAt = Date.now() + limits.ttlMs;
      sessions.set(token, { root, temporary, expiresAt, manifest, candidates, home: dshHome() });
      return { token, expiresAt, destination, candidates: candidates.map((candidate) => ({ ...candidate })) };
    } catch (error) {
      if (temporary) removeTemporary(temporary);
      throw error;
    }  }

  function importSelected(token: string, selectedIds: string[]): { imported: { id: string; name: string; path: string }[] } {
    if (disposed) throw new Error("导入服务已关闭");
    cleanupExpired();
    const session = sessions.get(token);
    if (!session) throw new Error("scan token 无效或过期");
    if (!Array.isArray(selectedIds) || selectedIds.length === 0 || new Set(selectedIds).size !== selectedIds.length) throw new Error("请选择不重复的候选 id");
    const chosen = selectedIds.map((id) => {
      const candidate = session.candidates.find((item) => item.id === id);
      if (!candidate) throw new Error("未知候选 id");
      if (candidate.error) throw new Error(`无效技能：${candidate.error}`);
      return candidate;
    });
    const names = chosen.map((candidate) => safeName(candidate.name));
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error("所选技能同名冲突");
    if (dshHome() !== session.home) throw new Error("目标 DSH_HOME 在 scan 后变化");
    const current = snapshot(session.root, true);
    if (JSON.stringify(current.map(({ data, ...entry }) => entry)) !== JSON.stringify(session.manifest)) throw new Error("来源在 scan 后变化，请重新扫描");
    ensureSafeDirectory(session.home);
    const targetRoot = join(session.home, "skills");
    ensureSafeDirectory(targetRoot);
    const rootIdentity = identity(lstatSync(targetRoot));
    function checkConflicts(start = 0): void {
      assertSafePath(targetRoot);
      const existing = new Set(readdirSync(targetRoot).map((name) => name.toLowerCase()));
      for (const name of names.slice(start)) for (const suffix of ["", ".md", ".md.disabled", ".disabled"]) if (existing.has(`${name}${suffix}`.toLowerCase())) throw new Error(`目标技能已存在：${name}`);
    }
    checkConflicts();
    const staging = mkdtempSync(join(targetRoot, ".import-"));
    ownTemporary(staging);
    const published: { from: string; to: string; identity: string }[] = [];
    try {
      chosen.forEach((candidate, index) => {
        const dir = join(staging, String(index));
        mkdirSync(dir);
        const prefix = candidate.relativePath === "." ? "" : `${candidate.relativePath}/`;
        for (const entry of current) {
          if (!entry.path.startsWith(prefix) || entry.path === prefix.slice(0, -1)) continue;
          const subpath = entry.path.slice(prefix.length);
          if (!subpath) continue;
          const destination = join(dir, ...subpath.split("/"));
          if (entry.directory) mkdirSync(destination, { recursive: true });
          else { mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, entry.data!, { flag: "wx", mode: entry.mode }); }
        }
      });
      for (let index = 0; index < chosen.length; index += 1) {
        checkConflicts(index);
        const stat = lstatSync(targetRoot);
        if (`${stat.dev}:${stat.ino}` !== rootIdentity.split(":").slice(0, 2).join(":")) throw new Error("目标目录变化");
        const from = join(staging, String(index));
        const to = join(targetRoot, names[index]);
        const before = identity(lstatSync(from));
        renameSync(from, to);
        published.push({ from, to, identity: before });
      }
      sessions.delete(token);
      if (session.temporary) removeTemporary(session.temporary);
      return { imported: chosen.map((candidate, index) => ({ id: candidate.id, name: names[index], path: join(targetRoot, names[index]) })) };
    } catch (error) {
      for (const item of published.reverse()) {
        const stat = lstatSync(item.to);
        if (`${stat.dev}:${stat.ino}` === item.identity.split(":").slice(0, 2).join(":")) renameSync(item.to, item.from);
      }
      throw error;
    } finally { removeTemporary(staging); }
  }

  function dispose(): void {
    disposed = true;
    clearInterval(timer);
    for (const child of activeClones.values()) child.kill();
    for (const path of ownedTemporary.keys()) if (!activeClones.has(path)) removeTemporary(path);
    sessions.clear();
  }

  return { scan, importSelected, cleanupExpired, dispose };
}
