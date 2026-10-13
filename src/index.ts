import { installGate } from "./gate";
import { dshHome } from "./paths";
import { registerRoutes, type RouteDeps } from "./routes";
import type { ExtraRoots } from "./skill-files";
import { loadState } from "./state";
import type { HostContext } from "./types";

export const name = "skill-manager";

export const inject = ["skills", "profileContext"];

interface LoaderEntryLike {
  options?: {
    name?: string;
    id?: unknown;
    config?: unknown;
  };
}

interface LoaderLike {
  entries?: () => LoaderEntryLike[];
}

export function apply(ctx: HostContext): void {
  const state = loadState(dshHome());
  const loaderRows = readLoaderRows(ctx);
  const deps: RouteDeps = {
    state,
    extraRoots: loaderRows.extraRoots,
    mcpServers: loaderRows.mcpServers,
    runtimeSkills: async () => {
      const registry = ctx.skills;
      if (registry === undefined) return [];
      try {
        const summaries = await registry.list();
        return summaries.filter((summary) => summary.path === undefined);
      } catch {
        return [];
      }
    },
    onChanged: () => {},
  };
  ctx.inject(["profileContext"], (scoped) => {
    const profile = scoped.get("profileContext") as { patchPath?: string } | undefined;
    if (profile?.patchPath !== undefined) deps.patchPath = profile.patchPath;
  });
  ctx.effect(() => registerRoutes(ctx, deps), "skill-manager: http routes");
  installGate(ctx, state, loaderRows.extraRoots);
}

interface LoaderRows {
  extraRoots: ExtraRoots;
  mcpServers: Array<{ id: string; serverName: string; transport: string }>;
}

function readLoaderRows(ctx: HostContext): LoaderRows {
  const customSkillDirs: string[] = [];
  let bundledSkillDir: string | undefined;
  const mcpServers: LoaderRows["mcpServers"] = [];
  const loader = ctx.get("loader") as LoaderLike | undefined;
  if (loader !== undefined && typeof loader.entries === "function") {
    let entries: LoaderEntryLike[] = [];
    try {
      entries = loader.entries();
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const options = entry?.options;
      if (options === undefined) continue;
      const moduleName = options.name;
      if (moduleName === undefined) continue;
      const config = options.config;
      const record = typeof config === "object" && config !== null ? (config as Record<string, unknown>) : undefined;
      if (moduleName === "@deepseek-ai/dsh-skill-filesystem" && record !== undefined) {
        if (Array.isArray(record.customSkillDirs)) {
          for (const dir of record.customSkillDirs) {
            if (typeof dir === "string" && dir !== "") customSkillDirs.push(dir);
          }
        }
        if (typeof record.bundledSkillDir === "string" && record.bundledSkillDir !== "") {
          bundledSkillDir = record.bundledSkillDir;
        }
      }
      if (moduleName === "@deepseek-ai/dsh-mcp-client") {
        const id = typeof options.id === "string" ? options.id : "";
        const serverName = record !== undefined && typeof record.serverName === "string" ? record.serverName : "";
        const transport = record !== undefined && typeof record.transport === "string" ? record.transport : "";
        if (id !== "" && serverName !== "") mcpServers.push({ id, serverName, transport });
      }
    }
  }
  return { extraRoots: { customSkillDirs, bundledSkillDir }, mcpServers };
}
