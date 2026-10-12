export interface SkillView {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: { modelInvocable: boolean; userInvocable: boolean };
  source: string;
  rank: number;
  path?: string;
  disabled: boolean;
  kind: "bundle" | "flat" | "runtime";
  managedStub: boolean;
  parseError?: string;
  readOnly: boolean;
  workspaceDisabled?: boolean;
}

export interface WorkspaceView {
  ok: true;
  cwd: string;
  label: string;
  project: SkillView[];
  global: SkillView[];
  mcpDenials?: Record<string, { entryId: string; title?: string }>;
  mcpServers?: McpServerInfo[];
}

export interface McpServerInfo {
  id: string;
  serverName: string;
  transport: string;
}

export interface PluginRow {
  entryId?: string;
  patchId?: string;
  moduleName?: string;
  meta?: {
    title?: string | { en: string } & Record<string, string>;
    description?: string | { en: string } & Record<string, string>;
    error?: string;
  };
  enabled?: boolean;
  fiberPhase?: string | null;
}

export interface ChangeResult {
  changed: boolean;
  application: "cancelled" | "failed" | "applied" | "restart-required" | "overridden";
  stage: string;
  target: string;
  enabled?: boolean;
  error?: {
    code: string;
    diagnostic?: string;
  };
  warnings?: string[];
}

export interface PluginManagerRemote {
  listPlugins(): Promise<PluginRow[]>;
  setPluginEnabled(entryId: string, enabled: boolean): Promise<ChangeResult>;
}

const BASE = "/plugins/dsh-skill-manager/api";

export async function fetchGlobalView(): Promise<{ skills: SkillView[]; mcpServers: McpServerInfo[] }> {
  const data = await getJson<{ skills: SkillView[]; mcpServers?: McpServerInfo[] }>(`${BASE}/global`);
  return { skills: data.skills, mcpServers: data.mcpServers ?? [] };
}

export async function fetchWorkspaceView(cwd: string): Promise<WorkspaceView> {
  return getJson<WorkspaceView>(`${BASE}/workspace?cwd=${encodeURIComponent(cwd)}`);
}

export async function toggleGlobalSkill(path: string, enable: boolean): Promise<void> {
  await postJson(`${BASE}/skill/global`, { path, enable });
}

export async function toggleWorkspaceSkill(cwd: string, name: string, enable: boolean): Promise<void> {
  await postJson(`${BASE}/skill/workspace`, { cwd, name, enable });
}

export interface ImportScan {
  token: string;
  destination: string;
  candidates: Array<{ id: string; name: string; description: string; relativePath: string; conflict: boolean; error?: string }>;
}

export async function scanSkills(source: string): Promise<ImportScan> {
  return postResult<ImportScan>(`${BASE}/skill/import/scan`, { source });
}

export async function importSkills(token: string, selected: string[]): Promise<void> {
  await postJson(`${BASE}/skill/import/commit`, { token, selected });
}

async function postResult<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as T & { ok?: boolean; error?: string };
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export async function toggleWorkspaceMcp(
  cwd: string,
  serverName: string,
  entryId: string,
  title: string | undefined,
  denied: boolean,
): Promise<void> {
  await postJson(`${BASE}/workspace/mcp`, { cwd, serverName, entryId, title, denied });
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => undefined)) as (T & { error?: string }) | undefined;
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${String(response.status)}`);
  if (body === undefined) throw new Error("响应不是有效 JSON");
  return body;
}

async function postJson(path: string, payload: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => undefined)) as { ok?: boolean; error?: string } | undefined;
  if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? `HTTP ${String(response.status)}`);
}

export function mcpServersOf(rows: PluginRow[]): PluginRow[] {
  return rows.filter(
    (row) => row.moduleName === "@deepseek-ai/dsh-mcp-client" && typeof row.entryId === "string",
  );
}

export function metaText(value: string | { en: string } & Record<string, string> | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  return typeof value.en === "string" ? value.en : fallback;
}

export function serverNameOf(entryId: string): string {
  let name = entryId;
  if (name.includes(":")) name = name.slice(name.lastIndexOf(":") + 1);
  if (name.startsWith("mcp-")) name = name.slice("mcp-".length);
  return name;
}

export function resolveServerName(entryId: string, scanned: McpServerInfo[] | undefined): string {
  if (Array.isArray(scanned)) {
    const match = scanned.find((server) => entryId === server.id || entryId.endsWith(`:${server.id}`) || server.id.endsWith(entryId));
    if (match !== undefined && typeof match.serverName === "string" && match.serverName !== "") return match.serverName;
  }
  return serverNameOf(entryId);
}
