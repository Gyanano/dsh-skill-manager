import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "lib", "client.js"), "utf8");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:19387/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const workspaceResponse = {
  ok: true,
  cwd: "C:/work/demo",
  label: "demo",
  project: [
    { name: "local-tool", description: "project skill", invocation: { modelInvocable: true, userInvocable: true }, source: "project-dsh", rank: 100, path: "C:/work/demo/.dsh/skills/local-tool/SKILL.md", disabled: false, kind: "bundle", managedStub: false, readOnly: false },
  ],
  global: [
    { name: "office-docx", description: "global skill", invocation: { modelInvocable: true, userInvocable: true }, source: "user-dsh", rank: 400, path: "C:/users/x/.dsh/skills/office-docx.md", disabled: false, kind: "flat", managedStub: false, readOnly: false, workspaceDisabled: false },
    { name: "packed", description: "disabled globally", invocation: { modelInvocable: true, userInvocable: true }, source: "user-dsh", rank: 400, path: "C:/users/x/.dsh/skills/packed.md.disabled", disabled: true, kind: "flat", managedStub: false, readOnly: false, workspaceDisabled: false },
  ],
  mcpDenials: { "kimi-cu": { entryId: "include:mcp-kimi-cu", title: "kimi-cu" } },
  mcpServers: [{ id: "mcp-kimi-cu", serverName: "kimi-cu", transport: "stdio" }],
};

const fetchCalls = [];
const fetchStub = (path, init) => {
  fetchCalls.push({ path, init });
  const body = path.startsWith("/plugins/dsh-skill-manager/api/workspace")
    ? workspaceResponse
    : { ok: true, error: "unexpected route" };
  return Promise.resolve({ ok: true, json: async () => body });
};

const registrations = [];
const moduleWindow = dom.window;
moduleWindow.__ModuleLoader__ = {
  load(registration) {
    registrations.push(registration);
  },
};
moduleWindow.fetch = fetchStub;

const primitives = {
  IconSkillOutlineRegular: () => null,
  IconSettingsOutlineRegular: (props) => React.createElement("span", { "data-icon": "settings", ...props }),
  Switch: (props) => React.createElement("button", { "data-switch": props.label ?? "", "data-checked": String(props.checked), "data-disabled": String(props.disabled === true), onClick: () => props.onChange(!props.checked) }),
  Tooltip: (props) => React.createElement("span", null, props.children),
};

const sandboxRequire = (spec) => {
  switch (spec) {
    case "react": return React;
    case "react/jsx-runtime": return { jsx: (type, props, key) => ({ $$typeof: Symbol.for("react.element"), type, props, key, ref: null }) , jsxs: (type, props, key) => ({ $$typeof: Symbol.for("react.element"), type, props, key, ref: null }), Fragment: Symbol.for("react.fragment") };
    case "react-dom": return { createPortal };
    case "@deepseek-ai/dsh-client-ui-primitives": return primitives;
    default: throw new Error(`harness: unexpected require "${spec}"`);
  }
};

vm.runInNewContext(code, { window: moduleWindow, document: dom.window.document, require: sandboxRequire, console, fetch: fetchStub }, { filename: "client.js" });

assert.equal(registrations.length, 1);
const plugin = registrations[0].factory(sandboxRequire);

const registered = [];
const ctx = {
  effect(callback) {
    callback();
    return () => {};
  },
  inject(services, callback) {
    callback(this);
  },
  slots: {
    inject(parent, factory) {
      factory();
    },
    register(options, component) {
      registered.push({ options, component });
      return () => {};
    },
  },
  locale: {
    register: () => () => {},
    bind: () => (key, params) => {
      if (params === undefined) return String(key);
      return `${String(key)}:${JSON.stringify(params)}`;
    },
  },
  sessions: {
    list: { getSnapshot: () => ({ byId: { s1: { cwd: "C:/work/demo" } } }) },
  },
  remote: {
    $on: () => () => {},
    pluginManager: {
      async listPlugins() {
        return { ok: true, value: [{ entryId: "include:mcp-kimi-cu", moduleName: "@deepseek-ai/dsh-mcp-client", enabled: true }] };
      },
      async setPluginEnabled() {
        return { ok: true, value: { changed: true, application: "applied", stage: "enable", target: "include:mcp-kimi-cu" } };
      },
    },
  },
};

plugin.apply(ctx);

const composer = registered.find((item) => item.options.name === "conversation.input.left");
if (composer === undefined) {
  console.error("registered so far:", registered.map((item) => item.options.name));
}
assert.ok(composer !== undefined, "composer seat registered");
const face = composer.options.inject("s1");
assert.equal(face.cwd, "C:/work/demo");

const container = dom.window.document.createElement("div");
dom.window.document.body.appendChild(container);
const view = React.createElement(composer.component, face);
createRoot(container).render(view);

async function until(predicate, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`harness: timed out waiting for ${label}`);
}

const toggleIcon = () => container.querySelector("span[data-icon='settings']");
await until(() => toggleIcon() !== null, "settings icon");
toggleIcon().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

const pops = () => dom.window.document.body.querySelectorAll(".dsm-pop");
await until(() => pops().length === 1, "single portal popover");

const popText = () => pops()[0]?.textContent ?? "";
await until(() => popText().includes("workspaceProject"), "project section rendered");
assert.ok(popText().includes("local-tool"), "project skill listed");
assert.ok(popText().includes("office-docx"), "global skill listed");
assert.ok(popText().includes("packed"), "globally disabled skill listed");
assert.ok(popText().includes("kimi-cu"), "mcp server shown by resolved serverName");
assert.ok(popText().includes("workspaceExternal"), "external services placeholder rendered");

const deniedSwitch = pops()[0].querySelector("button[data-switch='include:mcp-kimi-cu']");
assert.ok(deniedSwitch !== null, "mcp row switch present");
assert.equal(deniedSwitch.getAttribute("data-checked"), "false", "denied server renders switch off");

const enabledServer = pops()[0].querySelector("button[data-switch]");
assert.ok(enabledServer !== null);

const disabledGlobal = [...pops()[0].querySelectorAll("button[data-switch]")].find((node) => node.getAttribute("data-switch") === "packed");
assert.ok(disabledGlobal !== null);
assert.equal(disabledGlobal.getAttribute("data-disabled"), "true", "globally disabled skill switch locked");

const projectSwitch = [...pops()[0].querySelectorAll("button[data-switch]")].find((node) => node.getAttribute("data-switch") === "local-tool");
assert.ok(projectSwitch !== null);
assert.equal(projectSwitch.getAttribute("data-checked"), "true", "enabled project skill renders switch on");

assert.ok(fetchCalls.some((call) => call.path.startsWith("/plugins/dsh-skill-manager/api/workspace?cwd=")), "workspace route fetched");

container.querySelector("span[data-icon='settings']")?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
await until(() => pops().length === 0, "popover closes on second toggle");

console.log("popover-harness: WorkspaceControl portal renders once, loads workspace data, resolves MCP names, toggles cleanly");
