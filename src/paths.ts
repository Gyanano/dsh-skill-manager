import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME;
  return fromEnv !== undefined && fromEnv !== "" ? resolve(fromEnv) : join(homedir(), ".dsh");
}

export function agentsHome(): string {
  const fromEnv = process.env.DSH_AGENTS_HOME;
  return fromEnv !== undefined && fromEnv !== "" ? resolve(fromEnv) : join(homedir(), ".agents");
}

export function projectRootOf(cwd: string): string {
  const start = resolve(cwd);
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function workspaceKey(cwd: string): string {
  const resolved = resolve(cwd);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function workspaceLabel(cwd: string): string {
  const resolved = resolve(cwd);
  const base = dirname(resolved);
  return base === resolved ? resolved : resolved.slice(base.length + 1);
}

export function isPathInside(child: string, parent: string): boolean {
  const relative = isAbsolute(child) && isAbsolute(parent)
    ? relativePath(parent, child)
    : "";
  return relative !== "" && !relative.startsWith("..") && !isAbsolute(relative);
}

function relativePath(from: string, to: string): string {
  const fromParts = resolve(from).split(/[\\/]/);
  const toParts = resolve(to).split(/[\\/]/);
  let index = 0;
  while (index < fromParts.length && index < toParts.length && fromParts[index].toLowerCase() === toParts[index].toLowerCase()) index += 1;
  if (index === fromParts.length) return toParts.slice(index).join("/") || ".";
  const up = fromParts.length - index;
  return [...Array.from({ length: up }, () => ".."), ...toParts.slice(index)].join("/");
}
