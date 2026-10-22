import type { SkillInvocation } from "./types";

const TRUE_WORDS = new Set(["true", "yes", "on", "1"]);
const FALSE_WORDS = new Set(["false", "no", "off", "0"]);
const INVOCATION_KEYS = new Set(["disable-model-invocation", "user-invocable"]);

export interface ParsedSkillFile {
  name?: string;
  description?: string;
  whenToUse?: string;
  invocation: SkillInvocation | undefined;
  body: string;
  hasFrontmatter: boolean;
  invalidInvocation: boolean;
}

export interface FrontmatterEdit {
  removeKeys: string[];
  appendLines: string[];
}

export function parseSkillFile(text: string): ParsedSkillFile {
  if (!text.startsWith("---")) {
    return { invocation: undefined, body: text, hasFrontmatter: false, invalidInvocation: false };
  }
  const newlineIndex = text.indexOf("\n");
  if (text.slice(0, newlineIndex === -1 ? text.length : newlineIndex).trim() !== "---") {
    return { invocation: undefined, body: text, hasFrontmatter: false, invalidInvocation: false };
  }
  const lines = text.split(/\r?\n/);
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      closing = index;
      break;
    }
  }
  if (closing === -1) {
    return { invocation: undefined, body: text, hasFrontmatter: false, invalidInvocation: false };
  }
  const data = new Map<string, string>();
  let invalidInvocation = false;
  const header = lines.slice(1, closing);
  for (let index = 0; index < header.length; index += 1) {
    const line = header[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (key === "") continue;
    const raw = line.slice(separator + 1).trim();
    const block = /^([>|])([1-9]?)([+-]?)$/.exec(raw);
    if (block !== null) {
      const collected: string[] = [];
      let cursor = index + 1;
      let indent = block[2] === "" ? undefined : Number(block[2]);
      while (cursor < header.length) {
        const next = header[cursor];
        if (next.trim() === "") {
          collected.push("");
          cursor += 1;
          continue;
        }
        const width = next.length - next.trimStart().length;
        if (indent === undefined) {
          if (width === 0) break;
          indent = width;
        }
        if (width < indent) break;
        collected.push(next.slice(indent));
        cursor += 1;
      }
      while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
      index = cursor - 1;
      data.set(key, renderBlockScalar(collected, block[1] === ">"));
      continue;
    }
    data.set(key, stripQuotes(raw));
  }
  const invocation = resolveInvocation(data);
  if (invocation === undefined) invalidInvocation = data.has("disable-model-invocation") || data.has("user-invocable");
  const body = lines.slice(closing + 1).join("\n");
  return {
    name: optionalString(data.get("name")),
    description: optionalString(data.get("description")),
    whenToUse: optionalString(data.get("whenToUse")),
    invocation,
    body,
    hasFrontmatter: true,
    invalidInvocation,
  };
}

export function editFrontmatter(text: string, edit: FrontmatterEdit): string {
  const newlineAt = text.indexOf("\n");
  if (!text.startsWith("---") || newlineAt === -1 || text.slice(0, newlineAt).trim() !== "---") return text;
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
    return !edit.removeKeys.includes(key);
  });
  return ["---", ...kept, ...edit.appendLines, "---", ...lines.slice(closing + 1)].join("\n");
}

export function workspaceStubDocument(name: string, description: string, whenToUse: string | undefined): string {
  const lines = [
    "---",
    `name: ${yamlScalar(name)}`,
    `description: ${yamlScalar(description)}`,
  ];
  if (whenToUse !== undefined) lines.push(`whenToUse: ${yamlScalar(whenToUse)}`);
  lines.push("disable-model-invocation: true");
  lines.push("user-invocable: false");
  lines.push("---");
  lines.push("");
  lines.push(STUB_MARKER);
  lines.push("");
  return lines.join("\n");
}

export const STUB_MARKER = "This skill is disabled in this workspace by dsh-skill-manager.";

export function isManagedStubBody(body: string): boolean {
  return body.includes(STUB_MARKER);
}

function resolveInvocation(data: Map<string, string>): SkillInvocation | undefined {
  const modelRaw = data.get("disable-model-invocation");
  const userRaw = data.get("user-invocable");
  if (modelRaw === undefined && userRaw === undefined) return { modelInvocable: true, userInvocable: true };
  const model = modelRaw === undefined ? false : strictBoolean(modelRaw);
  const user = userRaw === undefined ? true : strictBoolean(userRaw);
  if (model === undefined || user === undefined) return undefined;
  return { modelInvocable: !model, userInvocable: user };
}

function strictBoolean(value: string): boolean | undefined {
  const lowered = value.toLowerCase();
  if (TRUE_WORDS.has(lowered)) return true;
  if (FALSE_WORDS.has(lowered)) return false;
  return undefined;
}

function optionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value === "" ? undefined : value;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function renderBlockScalar(lines: string[], folded: boolean): string {
  if (lines.length === 0) return "";
  if (!folded) return lines.join("\n").replace(/\n+$/, "");
  let rendered = "";
  let pendingBreaks = 0;
  for (const line of lines) {
    if (line === "") {
      pendingBreaks += 1;
      continue;
    }
    if (rendered === "") rendered = line;
    else if (pendingBreaks === 0) rendered += ` ${line}`;
    else rendered += `${"\n".repeat(pendingBreaks)}${line}`;
    pendingBreaks = 0;
  }
  return rendered;
}

function yamlScalar(value: string): string {
  return /^[\w./ -]+$/.test(value) && value.trim() === value ? value : JSON.stringify(value);
}

export function isInvocationKey(key: string): boolean {
  return INVOCATION_KEYS.has(key);
}
