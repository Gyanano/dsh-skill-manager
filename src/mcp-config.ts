import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";

export interface McpServerConfig {
  serverName: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface ParsedMcpCandidate {
  serverName: string;
  config: Record<string, unknown>;
  transport: "stdio" | "streamable-http" | "unknown";
}

const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const LOCK_TIMEOUT_MS = 10_000;

export function parseMcpConfigJson(text: string): ParsedMcpCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(text));
  } catch {
    throw new Error("不是有效的 JSON");
  }
  const servers = findMcpServers(parsed);
  if (servers === undefined || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error('未找到 "mcpServers" 对象');
  }
  const candidates: ParsedMcpCandidate[] = [];
  for (const [name, raw] of Object.entries(servers as Record<string, unknown>)) {
    if (!SERVER_NAME_PATTERN.test(name)) throw new Error(`服务器名 "${name}" 无效（限 1-32 位字母、数字、下划线、连字符）`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`服务器 "${name}" 的配置必须是对象`);
    const record = raw as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : typeof record.command === "string" ? "stdio" : typeof record.url === "string" ? "streamable-http" : "unknown";
    const transport = type === "http" || type === "streamable-http" ? "streamable-http" : type === "stdio" ? "stdio" : "unknown";
    if (transport === "unknown") throw new Error(`服务器 "${name}" 无法识别传输类型（需要 command 或 url 字段）`);
    candidates.push({ serverName: name, config: record, transport });
  }
  return candidates;
}

function findMcpServers(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const direct = (parsed as Record<string, unknown>)["mcpServers"];
  if (direct !== undefined) return direct;
  for (const value of Object.values(parsed as Record<string, unknown>)) {
    const nested = findMcpServers(value);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function stripJsonComments(text: string): string {
  return text.replace(/^\s*#.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");
}

export function mcpEntryIdOf(serverName: string): string {
  return `mcp-${serverName}`;
}

export function appendMcpServers(patchPath: string, servers: McpServerConfig[]): void {
  const existing = readExistingNames(patchPath);
  for (const server of servers) {
    if (!SERVER_NAME_PATTERN.test(server.serverName)) throw new Error(`服务器名 "${server.serverName}" 无效`);
    if (existing.has(server.serverName) || existing.has(mcpEntryIdOf(server.serverName))) {
      throw new Error(`MCP 服务器 "${server.serverName}" 已存在于配置中`);
    }
  }
  withProfileLock(join(patchPath, "..", "package.json"), () => {
    const text = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "[]\n";
    const document = parseDocument(text, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: string) => value }] });
    if (document.errors[0] !== undefined) throw new Error("cordis.patch.yml 解析失败");
    const contents = document.contents as unknown as { items?: unknown[] } | null;
    if (contents === null || contents === undefined || !Array.isArray(contents.items)) {
      throw new Error("cordis.patch.yml 顶层必须是 YAML 序列");
    }
    const existing = contents.items.find((item) =>
      typeof item === "object" && item !== null && "has" in (item as Record<string, unknown>)
      && (item as { has(key: string): boolean }).has("insert") && !(item as { has(key: string): boolean }).has("id"));
    const insertBlock = (existing ?? (() => {
      const created = document.createNode({ insert: [] });
      contents.items.push(created);
      return created;
    })()) as unknown as { get(key: string): { items?: unknown[] } };
    const list = insertBlock.get("insert");
    if (!Array.isArray(list.items)) throw new Error("insert 块必须是序列");
    for (const server of servers) {
      const node = document.createNode({
        id: mcpEntryIdOf(server.serverName),
        name: "@deepseek-ai/dsh-mcp-client",
        config: server.transport === "stdio"
          ? {
              serverName: server.serverName,
              transport: "stdio",
              command: server.command,
              ...(server.args !== undefined && server.args.length > 0 ? { args: server.args } : {}),
              ...(server.env !== undefined && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
            }
          : {
              serverName: server.serverName,
              transport: "streamable-http",
              url: server.url,
              ...(server.headers !== undefined && Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
            },
      });
      list.items.push(node);
    }
    atomicWrite(patchPath, String(document));
  });
}

function readExistingNames(patchPath: string): Set<string> {
  const names = new Set<string>();
  if (!existsSync(patchPath)) return names;
  const document = parseDocument(readFileSync(patchPath, "utf8"), { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: string) => value }] });
  const items = (document.contents as { items?: Array<{ toJSON?(): unknown }> } | null)?.items ?? [];
  const visitRow = (row: unknown): void => {
    const record = row as Record<string, unknown>;
    if (typeof record?.id === "string") names.add(record.id);
    if (typeof record?.name === "string" && record.name === "@deepseek-ai/dsh-mcp-client") {
      const config = record.config as { serverName?: unknown } | undefined;
      if (typeof config?.serverName === "string") names.add(config.serverName);
    }
  };
  for (const item of items) {
    const json = typeof item?.toJSON === "function" ? item.toJSON() : item;
    visitRow(json);
    const nested = (json as { insert?: unknown })?.insert;
    if (Array.isArray(nested)) for (const row of nested) visitRow(row);
  }
  return names;
}

function withProfileLock(lockTarget: string, operation: () => void): void {
  const lockPath = `${lockTarget}.dsm-lock`;
  mkdirSync(dirname(lockTarget), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let handle: number | undefined;
  for (;;) {
    try {
      handle = openSync(lockPath, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() > deadline) {
        throw new Error("配置文件忙，请稍后重试");
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    operation();
  } finally {
    closeSync(handle);
    rmSync(lockPath, { force: true });
  }
}

function atomicWrite(path: string, text: string): void {
  const temporary = `${path}.dsm-tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
