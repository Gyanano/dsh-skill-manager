import { workspaceDisabledNames, type ExtraRoots } from "./skill-files";
import { workspaceKey } from "./paths";
import type { ManagerState } from "./state";
import type { HostContext, ToolExec } from "./types";

const CACHE_TTL_MS = 3000;

export function installGate(ctx: HostContext, state: ManagerState, extraRoots: ExtraRoots): void {
  const cache = new Map<string, { at: number; names: Set<string> }>();
  const disabledSkills = (cwd: string): Set<string> => {
    const key = workspaceKey(cwd);
    const cached = cache.get(key);
    const now = Date.now();
    if (cached !== undefined && now - cached.at < CACHE_TTL_MS) return cached.names;
    const names = workspaceDisabledNames(cwd, extraRoots);
    cache.set(key, { at: now, names });
    return names;
  };
  ctx.on("tools/pre-execute", async (exec: ToolExec, next: () => unknown) => {
    const cwd = exec?.agent?.session?.header?.cwd;
    if (cwd === undefined || cwd === "") return next();
    const key = workspaceKey(cwd);
    if (typeof exec.name === "string" && exec.name.startsWith("mcp__")) {
      const server = exec.name.slice("mcp__".length).split("__", 1)[0];
      const denial = server !== "" ? state.workspaces[key]?.mcp[server] : undefined;
      if (denial !== undefined) {
        const title = denial.title ?? server;
        return { kind: "deny", reason: `MCP 服务器「${title}」已在当前工作区禁用（dsh-skill-manager）。如需使用，请在输入框技能设置中恢复。` };
      }
    }
    if (exec.name === "skill") {
      const requested = exec.arguments?.name;
      if (typeof requested === "string" && disabledSkills(cwd).has(requested)) {
        return { kind: "deny", reason: `技能「${requested}」已在当前工作区禁用（dsh-skill-manager）。如需使用，请在输入框技能设置中恢复。` };
      }
    }
    return next();
  });
}
