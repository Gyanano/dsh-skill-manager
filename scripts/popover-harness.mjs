import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "lib", "client.js"), "utf8");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:19387/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
const { createRoot } = await import("react-dom/client");
const { createPortal } = await import("react-dom");

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
  const body = path.endsWith("/skill/import/scan")
    ? { ok: true, token: "scan-test", destination: "C:/users/x/.dsh/skills", candidates: [{ id: "alpha", name: "alpha", description: "A skill", relativePath: "skills/alpha", conflict: false }, { id: "beta", name: "beta", description: "B skill", relativePath: "skills/beta", conflict: true }] }
    : path.endsWith("/skill/import/commit") ? { ok: true }
    : path.endsWith("/global") ? { ok: true, skills: workspaceResponse.global, mcpServers: workspaceResponse.mcpServers }
    : path.startsWith("/plugins/dsh-skill-manager/api/workspace") ? workspaceResponse
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
  Button: ({ children, icon, ...props }) => React.createElement("button", { type: "button", ...props }, icon, children),
  StateDot: () => null,
  IconInfoOutlineRegular: () => null,
  IconPlusOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconSkillOutlineRegular: () => null,
  IconSettingsOutlineRegular: (props) => React.createElement("span", { "data-icon": "settings", ...props }),
  Switch: (props) => React.createElement("button", { "data-switch": props.label ?? "", "data-checked": String(props.checked), "data-disabled": String(props.disabled === true), onClick: () => props.onChange(!props.checked) }),
  Tooltip: (props) => React.createElement("span", null, props.children),
};

const sandboxRequire = (spec) => {
  switch (spec) {
    case "react": return React;
    case "react/jsx-runtime": return jsxRuntime;
    case "react-dom": return { createPortal };
    case "@deepseek-ai/dsh-client-ui-primitives": return primitives;
    default: throw new Error(`harness: unexpected require "${spec}"`);
  }
};

vm.runInNewContext(code, { window: moduleWindow, document: dom.window.document, require: sandboxRequire, console, fetch: fetchStub, Node: dom.window.Node }, { filename: "client.js" });

assert.equal(registrations.length, 1);
const plugin = registrations[0].factory(sandboxRequire);

const registered = [];
let dictionaries;
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
    register: (_namespace, values) => {
      dictionaries = values;
      for (const dictionary of Object.values(values)) for (const template of Object.values(dictionary)) assert.equal(typeof template, "string", "DSH locale templates must be strings");
      return () => {};
    },
    bind: () => (key, params = {}) => {
      const rendered = dictionaries.zh[key].replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? ""));
      return `${key}:${rendered}`;
    },
  },
  sessions: {
    list: { getSnapshot: () => ({ byId: { s1: { cwd: "C:/work/demo" } } }) },
  },
  workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: "workspace-demo", path: "C:/work/demo", title: "demo" }] }) } },
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

const page = registered.find((item) => item.options.name === "main");
const pageRoot = createRoot(dom.window.document.body.appendChild(dom.window.document.createElement("div")));
pageRoot.render(React.createElement(page.component, page.options.inject()));
const findButton = (key) => [...dom.window.document.querySelectorAll("button")].find((node) => node.textContent.startsWith(`${key}:`));
await until(() => findButton("addSkill"), "add skill button");
findButton("addSkill").click();
await until(() => dom.window.document.querySelector("#dsm-import-source"), "import source input");
const input = dom.window.document.querySelector("#dsm-import-source");
Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "C:/public/skills");
input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
await until(() => findButton("scanSkills") && !findButton("scanSkills").disabled, "scan enabled");
findButton("scanSkills").click();
await until(() => dom.window.document.querySelectorAll("input[type=checkbox]").length === 2, "candidate preview");
const checkboxes = [...dom.window.document.querySelectorAll("input[type=checkbox]")];
assert.equal(checkboxes[1].disabled, true, "conflicts cannot be selected");
assert.equal(findButton("importSelected").disabled, true, "explicit selection required");
checkboxes[0].click();
await until(() => !findButton("importSelected").disabled, "import enabled");
findButton("importSelected").click();
await until(() => fetchCalls.some((call) => call.path.endsWith("/skill/import/commit")), "import submitted");
const commit = fetchCalls.find((call) => call.path.endsWith("/skill/import/commit"));
assert.deepEqual(JSON.parse(commit.init.body), { token: "scan-test", selected: ["alpha"] });
await until(() => !dom.window.document.querySelector("#dsm-import-source"), "import form closes after success");
findButton("tabWorkspace").click();
await until(() => dom.window.document.querySelector("select"), "workspace selector");
const select = dom.window.document.querySelector("select");
assert.equal(select.options[1].value, "C:/work/demo", "workspace path comes from official path field");
select.value = "C:/work/demo";
select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
await until(() => dom.window.document.querySelector(".dsm-pop"), "workspace settings independent of session");
assert.ok(dom.window.document.querySelector(".dsm-pop").textContent.includes("workspaceEffect"));
pageRoot.unmount();
console.log("popover-harness: real React refs/locales, popover lifecycle, import scan/selection/conflict/commit verified");
