import type { IncomingMessage, ServerResponse } from "node:http";
import { workspaceLabel, workspaceKey } from "./paths";
import {
  assertPathInRoots,
  listSkillEntries,
  removeWorkspaceStub,
  toggleGlobalDisabled,
  toggleProjectSkill,
  workspaceDisabledNames,
  writeWorkspaceStub,
  type ExtraRoots,
  type SkillEntry,
} from "./skill-files";
import { saveState, workspaceState, type ManagerState } from "./state";
import { appendMcpServers, mcpEntryIdOf, parseMcpConfigJson, type McpServerConfig } from "./mcp-config";
import { createSkillImporter } from "./skill-import";
import type { HostContext, RegistrySkillSummary } from "./types";

const BASE = "/plugins/dsh-skill-manager/api";
const MAX_BODY_BYTES = 65536;

interface HostRoute {
  kind: "exact";
  path: string;
  handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void;
}

interface HostWebServer {
  register(route: HostRoute): () => void;
}

interface ProfileContextLike {
  dir?: string;
  patchPath?: string;
}

export interface RouteDeps {
  state: ManagerState;
  extraRoots: ExtraRoots;
  mcpServers: Array<{ id: string; serverName: string; transport: string }>;
  runtimeSkills: () => Promise<RegistrySkillSummary[]>;
  onChanged: () => void;
  patchPath?: string;
}

export function registerRoutes(ctx: HostContext, deps: RouteDeps): () => void {
  const importer = createSkillImporter();
  let disposeRoutes: () => void = () => {};
  ctx.inject(["webServer"], (scoped) => {
    const webServer = scoped.get("webServer") as HostWebServer | undefined;
    if (webServer === undefined || typeof webServer.register !== "function") return;
    const disposers = [
      webServer.register({
        kind: "exact",
        path: `${BASE}/global`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          if (req.method !== "GET") return reject(res, 405, "method not allowed");
          try {
            json(res, 200, { ok: true, skills: await globalViews(deps), mcpServers: deps.mcpServers });
          } catch (error) {
            reject(res, 500, String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/workspace`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          if (req.method !== "GET") return reject(res, 405, "method not allowed");
          const cwd = new URL(req.url ?? "/", "http://dsh.invalid").searchParams.get("cwd");
          if (cwd === null || cwd === "") return reject(res, 400, "缺少 cwd 参数");
          try {
            json(res, 200, { ok: true, ...workspaceView(cwd, deps) });
          } catch (error) {
            reject(res, 500, String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/skill/global`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          const body = await readBody(req, res);
          if (body === undefined) return;
          const { path, enable } = body as { path?: unknown; enable?: unknown };
          if (typeof path !== "string" || typeof enable !== "boolean") return reject(res, 400, "参数无效");
          if (!assertPathInRoots(path, deps.extraRoots)) return reject(res, 400, "路径不在已知技能根目录内");
          try {
            const entry = listSkillEntries(undefined, deps.extraRoots).find((candidate) => candidate.path === path);
            if (entry === undefined) return reject(res, 404, "技能不存在或已变化，请刷新");
            if (entry.readOnly) return reject(res, 400, "该技能只读");
            toggleGlobalDisabled(entry, enable);
            deps.onChanged();
            json(res, 200, { ok: true });
          } catch (error) {
            reject(res, 500, String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/skill/workspace`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          const body = await readBody(req, res);
          if (body === undefined) return;
          const { cwd, name, enable } = body as { cwd?: unknown; name?: unknown; enable?: unknown };
          if (typeof cwd !== "string" || typeof name !== "string" || typeof enable !== "boolean" || cwd === "" || name === "") {
            return reject(res, 400, "参数无效");
          }
          try {
            const action = toggleWorkspaceSkill(cwd, name, enable, deps);
            deps.onChanged();
            json(res, 200, { ok: true, action });
          } catch (error) {
            reject(res, 400, error instanceof Error ? error.message : String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/skill/import/scan`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return reject(res, 403, "origin denied");
          const body = await readBody(req, res);
          if (!body) return;
          if (typeof body.source !== "string" || body.source.length > 4096) return reject(res, 400, "无效来源");
          try {
            const source = body.source.trim();
            const scan = await importer.scan(source.startsWith("https://") ? { kind: "github", url: source } : { kind: "local", path: source });
            json(res, 200, { ok: true, ...scan });
          } catch (error) {
            reject(res, 400, error instanceof Error ? error.message : String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/skill/import/commit`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return reject(res, 403, "origin denied");
          const body = await readBody(req, res);
          if (!body) return;
          if (typeof body.token !== "string" || !Array.isArray(body.selected) || !body.selected.every((id) => typeof id === "string")) return reject(res, 400, "无效选择");
          try {
            const result = importer.importSelected(body.token, body.selected);
            deps.onChanged();
            json(res, 200, { ok: true, ...result });
          } catch (error) {
            reject(res, 400, error instanceof Error ? error.message : String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/mcp/parse`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          const body = await readBody(req, res);
          if (body === undefined) return;
          if (typeof body.json !== "string" || body.json.length > MAX_BODY_BYTES) return reject(res, 400, "缺少 JSON 文本");
          try {
            const candidates = parseMcpConfigJson(body.json).map((candidate) => ({
              serverName: candidate.serverName,
              transport: candidate.transport,
              conflict: deps.mcpServers.some((row) => row.serverName === candidate.serverName || row.id === mcpEntryIdOf(candidate.serverName)),
            }));
            json(res, 200, { ok: true, candidates });
          } catch (error) {
            reject(res, 400, error instanceof Error ? error.message : String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/mcp/add`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          const body = await readBody(req, res);
          if (body === undefined) return;
          if (typeof body.json !== "string" || !Array.isArray(body.selected) || !body.selected.every((id) => typeof id === "string")) {
            return reject(res, 400, "参数无效");
          }
          if (deps.patchPath === undefined) return reject(res, 500, "无法定位 profile 配置文件");
          let parsed;
          try {
            parsed = parseMcpConfigJson(body.json);
          } catch (error) {
            return reject(res, 400, error instanceof Error ? error.message : String(error));
          }
          const chosen: McpServerConfig[] = [];
          for (const serverName of body.selected as string[]) {
            const candidate = parsed.find((item) => item.serverName === serverName);
            if (candidate === undefined) return reject(res, 400, `未知服务器 "${serverName}"`);
            if (deps.mcpServers.some((row) => row.serverName === candidate.serverName || row.id === mcpEntryIdOf(candidate.serverName))) {
              return reject(res, 400, `MCP 服务器 "${candidate.serverName}" 已存在`);
            }
            chosen.push(normalizeMcpConfig(candidate.serverName, candidate));
          }
          try {
            appendMcpServers(deps.patchPath, chosen);
            deps.onChanged();
            json(res, 200, { ok: true, added: chosen.map((server) => server.serverName), hmr: true });
          } catch (error) {
            reject(res, 400, error instanceof Error ? error.message : String(error));
          }
        },
      }),
      webServer.register({
        kind: "exact",
        path: `${BASE}/workspace/mcp`,
        handler: async (req, res) => {
          if (!sameOrigin(req)) return;
          const body = await readBody(req, res);
          if (body === undefined) return;
          const { cwd, serverName, entryId, title, denied } = body as {
            cwd?: unknown;
            serverName?: unknown;
            entryId?: unknown;
            title?: unknown;
            denied?: unknown;
          };
          if (typeof cwd !== "string" || typeof serverName !== "string" || typeof denied !== "boolean" || cwd === "" || serverName === "") {
            return reject(res, 400, "参数无效");
          }
          const key = workspaceKey(cwd);
          if (denied) {
            if (typeof entryId !== "string" || entryId === "") return reject(res, 400, "缺少 entryId");
            const workspace = workspaceState(deps.state, key, cwd);
            workspace.path = cwd;
            workspace.mcp[serverName] = { entryId, ...(typeof title === "string" && title !== "" ? { title } : {}) };
          } else {
            const workspace = deps.state.workspaces[key];
            if (workspace !== undefined) delete workspace.mcp[serverName];
          }
          try {
            saveState(deps.state);
          } catch (error) {
            reject(res, 500, `状态保存失败：${String(error)}`);
            return;
          }
          deps.onChanged();
          json(res, 200, { ok: true });
        },
      }),
    ];
    disposeRoutes = () => {
      for (const dispose of disposers) dispose();
    };
  });
  return () => { disposeRoutes(); importer.dispose(); };
}

async function globalViews(deps: RouteDeps): Promise<Record<string, unknown>[]> {
  const fileEntries = listSkillEntries(undefined, deps.extraRoots);
  const views = fileEntries.filter((entry) => !isProject(entry)).map(toView);
  const seen = new Set(fileEntries.map((entry) => entry.name));
  try {
    const runtime = await deps.runtimeSkills();
    for (const summary of runtime) {
      if (seen.has(summary.name)) continue;
      views.push({
        name: summary.name,
        description: summary.description,
        whenToUse: summary.whenToUse,
        invocation: summary.invocation,
        source: "runtime",
        rank: 250,
        path: undefined,
        disabled: false,
        kind: "runtime",
        managedStub: false,
        parseError: undefined,
        readOnly: true,
      });
    }
  } catch {
  }
  return views;
}

function workspaceView(cwd: string, deps: RouteDeps): Record<string, unknown> {
  const all = listSkillEntries(cwd, deps.extraRoots);
  const project = dedupByName(all.filter((entry) => isProject(entry) && !entry.managedStub)).map(toView);
  const disabled = workspaceDisabledNames(cwd, deps.extraRoots);
  const global = dedupByName(listSkillEntries(undefined, deps.extraRoots).filter((entry) => !isProject(entry)))
    .map((entry) => ({ ...toView(entry), workspaceDisabled: disabled.has(entry.name) }));
  const key = workspaceKey(cwd);
  const mcpDenials = deps.state.workspaces[key]?.mcp ?? {};
  return { cwd, label: workspaceLabel(cwd), project, global, mcpDenials, mcpServers: deps.mcpServers };
}

function dedupByName(entries: SkillEntry[]): SkillEntry[] {
  const seen = new Set<string>();
  const result: SkillEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push(entry);
  }
  return result;
}

function isProject(entry: SkillEntry): boolean {
  return entry.source === "project-dsh" || entry.source === "project-agents";
}

function toView(entry: SkillEntry): Record<string, unknown> {
  return {
    name: entry.name,
    description: entry.description,
    whenToUse: entry.whenToUse,
    invocation: entry.invocation,
    source: entry.source,
    rank: entry.rank,
    path: entry.path,
    disabled: entry.disabled,
    kind: entry.kind,
    managedStub: entry.managedStub,
    parseError: entry.parseError,
    readOnly: entry.readOnly,
  };
}

function toggleWorkspaceSkill(cwd: string, name: string, enable: boolean, deps: RouteDeps): string {
  const entries = listSkillEntries(cwd, deps.extraRoots);
  const projectEntry = entries.find((entry) => isProject(entry) && !entry.managedStub && entry.name === name);
  if (projectEntry !== undefined) {
    if (projectEntry.readOnly) throw new Error("该技能只读");
    toggleProjectSkill(projectEntry, enable);
    return enable ? "project-enable" : "project-disable";
  }
  if (enable) {
    removeWorkspaceStub(cwd, name);
    return "workspace-enable";
  }
  const globalEntry = entries.find((entry) => !isProject(entry) && !entry.managedStub && entry.name === name);
  if (globalEntry === undefined) {
    throw new Error(
      entries.some((entry) => entry.name === name && entry.managedStub)
        ? "该技能在本工作区已是禁用状态"
        : "未找到该技能，或它不支持工作区级控制",
    );
  }
  if (globalEntry.disabled) throw new Error("该技能已全局禁用，无需工作区级禁用");
  if (globalEntry.readOnly) throw new Error("该技能只读，不支持工作区级禁用");
  writeWorkspaceStub(cwd, globalEntry);
  return "workspace-disable";
}

function normalizeMcpConfig(serverName: string, candidate: { config: Record<string, unknown>; transport: "stdio" | "streamable-http" | "unknown" }): McpServerConfig {
  const record = candidate.config;
  if (candidate.transport === "stdio") {
    if (typeof record.command !== "string" || record.command === "") throw new Error(`服务器 "${serverName}" 缺少 command`);
    return {
      serverName,
      transport: "stdio",
      command: record.command,
      ...(Array.isArray(record.args) && record.args.every((item) => typeof item === "string") ? { args: record.args as string[] } : {}),
      ...(record.env !== undefined && typeof record.env === "object" && record.env !== null && !Array.isArray(record.env)
        ? { env: Object.fromEntries(Object.entries(record.env as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }
        : {}),
    };
  }
  if (typeof record.url !== "string" || record.url === "" || !/^https?:\/\//.test(record.url)) throw new Error(`服务器 "${serverName}" 的 url 无效`);
  return {
    serverName,
    transport: "streamable-http",
    url: record.url,
    ...(record.headers !== undefined && typeof record.headers === "object" && record.headers !== null && !Array.isArray(record.headers)
      ? { headers: Object.fromEntries(Object.entries(record.headers as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }
      : {}),
  };
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = headerOf(req, "origin");
  if (origin === undefined) return true;
  const host = headerOf(req, "host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | undefined> {
  if (req.method !== "POST") {
    reject(res, 405, "method not allowed");
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let failed = false;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        rejectPromise(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise());
    req.on("error", rejectPromise);
  }).catch(() => undefined);
  if (failed) {
    reject(res, 413, "请求体过大");
    return undefined;
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      reject(res, 400, "请求体必须是 JSON 对象");
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    reject(res, 400, "请求体不是有效 JSON");
    return undefined;
  }
}

function reject(res: ServerResponse, status: number, error: string): void {
  json(res, status, { ok: false, error });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}
