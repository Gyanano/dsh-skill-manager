import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dshHome } from "./paths";

export interface WorkspaceMcpDenial {
  entryId: string;
  title?: string;
}

export interface WorkspaceState {
  path: string;
  mcp: Record<string, WorkspaceMcpDenial>;
}

export interface ManagerState {
  version: 1;
  workspaces: Record<string, WorkspaceState>;
}

const EMPTY_STATE: ManagerState = { version: 1, workspaces: {} };

export function stateFilePath(home?: string): string {
  return join(home ?? dshHome(), "storages", "dsh-skill-manager", "state.json");
}

export function loadState(home?: string): ManagerState {
  const file = stateFilePath(home);
  if (!existsSync(file)) return { version: 1, workspaces: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ManagerState>;
    if (parsed.version !== 1 || typeof parsed.workspaces !== "object" || parsed.workspaces === null) {
      return { version: 1, workspaces: {} };
    }
    return { version: 1, workspaces: parsed.workspaces };
  } catch {
    return { version: 1, workspaces: {} };
  }
}

export function saveState(state: ManagerState, home?: string): void {
  const file = stateFilePath(home);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}

export function workspaceState(state: ManagerState, key: string, path: string): WorkspaceState {
  const existing = state.workspaces[key];
  if (existing !== undefined) return existing;
  const created: WorkspaceState = { path, mcp: {} };
  state.workspaces[key] = created;
  return created;
}
