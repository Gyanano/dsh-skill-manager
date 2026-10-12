import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../src/index";

const home = mkdtempSync(join(tmpdir(), "dsm-harness-"));
const originalHome = process.env.DSH_HOME;
process.env.DSH_HOME = home;

interface RecordedRoute {
  path: string;
  handler(req: unknown, res: unknown): Promise<void> | void;
}

interface Listener {
  event: string;
  fn: (exec: unknown, next: () => unknown) => unknown;
}

try {
  const routes: RecordedRoute[] = [];
  const listeners: Listener[] = [];
  const disposers: Array<() => void> = [];
  const skillsList = async () => [
    {
      name: "in-memory-skill",
      description: "registered at runtime",
      invocation: { modelInvocable: true, userInvocable: true },
      source: "runtime",
      provider: "runtime",
    },
  ];
  const ctx = {
    get(key: string) {
      if (key === "loader") {
        return {
          entries: () => [
            { options: { name: "@deepseek-ai/dsh-skill-filesystem", config: { customSkillDirs: ["C:/custom-skills"], bundledSkillDir: "C:/bundled" } } },
            { options: { name: "@deepseek-ai/dsh-web-app" } },
          ],
        };
      }
      if (key === "webServer") {
        return {
          register(route: RecordedRoute) {
            routes.push(route);
            return () => {
              const index = routes.indexOf(route);
              if (index !== -1) routes.splice(index, 1);
            };
          },
        };
      }
      return undefined;
    },
    inject(services: string[], callback: (scoped: unknown) => void) {
      const scoped = {
        get: (key: string) => (services.includes(key) ? ctx.get(key) : undefined),
      };
      const result = callback(scoped as never);
      if (typeof result === "function") disposers.push(result as () => void);
      return () => {};
    },
    on(event: string, fn: Listener["fn"]) {
      listeners.push({ event, fn });
      return () => {};
    },
    effect(callback: () => unknown, label: string) {
      const result = callback();
      if (typeof result === "function") disposers.push(result as () => void);
      return () => {};
    },
    skills: { list: skillsList },
  };

  apply(ctx as never);
  assert.equal(routes.length, 5, "routes registered");
  assert.equal(listeners.filter((entry) => entry.event === "tools/pre-execute").length, 1, "gate registered");

  const paths = routes.map((route) => route.path).sort();
  assert.deepEqual(paths, [
    "/plugins/dsh-skill-manager/api/global",
    "/plugins/dsh-skill-manager/api/skill/global",
    "/plugins/dsh-skill-manager/api/skill/workspace",
    "/plugins/dsh-skill-manager/api/workspace",
    "/plugins/dsh-skill-manager/api/workspace/mcp",
  ]);

  const route = routes.find((entry) => entry.path.endsWith("/global"))!;
  let responseBody = "";
  await route.handler(
    { method: "GET", url: "/x", headers: {} },
    {
      writeHead() {},
      end(body?: string) {
        responseBody = body ?? "";
      },
    },
  );
  const parsed = JSON.parse(responseBody) as { ok: boolean; skills: Array<{ name: string }> };
  assert.equal(parsed.ok, true);
  assert.ok(parsed.skills.some((skill) => skill.name === "in-memory-skill"));

  const gate = listeners.find((entry) => entry.event === "tools/pre-execute")!;
  const denyOutcome = (await (gate.fn as (exec: unknown, next: () => unknown) => unknown)(
    { name: "mcp__kimi-cu__click", arguments: {}, agent: { session: { header: { cwd: home } } } },
    () => "allowed",
  )) as { kind?: string };
  assert.equal(denyOutcome, "allowed", "no denial recorded for this workspace yet");

  const stateFile = join(home, "storages", "dsh-skill-manager", "state.json");
  const mcpRoute = routes.find((entry) => entry.path.endsWith("/workspace/mcp"))!;
  let postResponse = "";
  await mcpRoute.handler(
    {
      method: "POST",
      url: "/x",
      headers: {},
      on(event: string, listener: (chunk?: Buffer) => void) {
        if (event === "data") listener(Buffer.from(JSON.stringify({ cwd: home, serverName: "kimi-cu", entryId: "mcp-kimi-cu", title: "Kimi CU", denied: true })));
        if (event === "end") listener();
      },
    },
    {
      writeHead() {},
      end(body?: string) {
        postResponse = body ?? "";
      },
    },
  );
  assert.equal(JSON.parse(postResponse).ok, true);
  assert.ok(require("node:fs").existsSync(stateFile), "state persisted");

  const gateAfter = (await (gate.fn as (exec: unknown, next: () => unknown) => unknown)(
    { name: "mcp__kimi-cu__click", arguments: {}, agent: { session: { header: { cwd: home } } } },
    () => "allowed",
  )) as { kind?: string; reason?: string };
  assert.equal(gateAfter.kind, "deny");
  assert.ok(String(gateAfter.reason).includes("Kimi CU"));

  const passThrough = (await (gate.fn as (exec: unknown, next: () => unknown) => unknown)(
    { name: "mcp__other__tool", arguments: {}, agent: { session: { header: { cwd: home } } } },
    () => "allowed",
  )) as unknown;
  assert.equal(passThrough, "allowed");

  for (const dispose of disposers.reverse()) dispose();
  assert.equal(routes.length, 0, "routes disposed");

  console.log("harness: host apply/gate/routes OK");
} finally {
  if (originalHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
}
