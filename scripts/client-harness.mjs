import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "lib", "client.js"), "utf8");

const styleTags = [];
const documentStub = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: "" }),
  head: {
    appendChild(tag) {
      styleTags.push(tag);
    },
  },
};

const registrations = [];
const windowStub = {
  __ModuleLoader__: {
    load(registration) {
      registrations.push(registration);
    },
  },
};

function jsxStub() {
  throw new Error("harness: components must not render during apply");
}

const modules = {
  react: { Component: class {} },
  "react/jsx-runtime": { jsx: jsxStub, jsxs: jsxStub, Fragment: "Fragment" },
  "react-dom": { createPortal: jsxStub },
  "@deepseek-ai/dsh-client-ui-primitives": {
    IconSkillOutlineRegular: () => null,
    IconSettingsOutlineRegular: () => null,
    Switch: () => null,
    Tooltip: () => null,
  },
};

const sandboxRequire = (spec) => {
  if (!(spec in modules)) throw new Error(`harness: unexpected require "${spec}"`);
  return modules[spec];
};

vm.runInNewContext(code, { window: windowStub, document: documentStub, require: sandboxRequire, console }, { filename: "client.js" });

assert.equal(registrations.length, 1, "module loader received exactly one registration");
assert.equal(registrations[0].id, "dsh-skill-manager", "registration id equals the package name");
assert.equal(typeof registrations[0].factory, "function", "registration carries a factory");

const plugin = registrations[0].factory(sandboxRequire);
assert.equal(plugin.name, "dsh-skill-manager-client");
assert.equal(
  JSON.stringify(plugin.inject),
  JSON.stringify(["slots", "locale", "sessions", "remote", "remote.pluginManager"]),
);
assert.equal(typeof plugin.apply, "function");

const declared = new Set(["main", "sidebar.panellist", "conversation.input.left"]);

function createStubContext(remotePluginManager) {
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
        if (!declared.has(parent)) throw new Error(`slot "${parent}" is not declared`);
        factory();
      },
      register(options, component) {
        if (!declared.has(options.name)) throw new Error(`slot "${options.name}" is not declared`);
        if (typeof component !== "function") throw new Error("registration needs a component");
        registered.push(options);
        return () => {};
      },
    },
    locale: {
      register(namespace, dictionaries) {
        ctx.localeRegistration = { namespace, dictionaries };
        return () => {};
      },
      bind() {
        return (key) => String(key);
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({ byId: { s1: { cwd: "C:/work/demo" } } }),
      },
    },
    remote: {
      $on: () => () => {},
      pluginManager: remotePluginManager,
    },
  };
  return { ctx, registered };
}

const okRemote = {
  async listPlugins() {
    return {
      ok: true,
      value: [{ entryId: "mcp-kimi-cu", moduleName: "@deepseek-ai/dsh-mcp-client", enabled: true }],
    };
  },
  async setPluginEnabled() {
    return { ok: true, value: { changed: true, application: "applied", stage: "enable", target: "mcp-kimi-cu" } };
  },
};

const okRun = createStubContext(okRemote);
plugin.apply(okRun.ctx);

const names = okRun.registered.map((entry) => entry.name).sort();
assert.equal(
  JSON.stringify(names),
  JSON.stringify(["conversation.input.left", "main", "sidebar.panellist"]),
);

const panel = okRun.registered.find((entry) => entry.name === "main");
assert.equal(panel.key, "skills");
const panelFace = panel.inject();
assert.equal(panelFace.t("panel"), "panel");

const listed = await panelFace.pluginManager.listPlugins();
assert.equal(Array.isArray(listed), true, "listPlugins unwraps the Remote {ok,value} envelope");
assert.equal(listed[0].entryId, "mcp-kimi-cu");
const changed = await panelFace.pluginManager.setPluginEnabled("mcp-kimi-cu", false);
assert.equal(changed.application, "applied", "setPluginEnabled unwraps the Remote envelope");

const entry = okRun.registered.find((item) => item.name === "sidebar.panellist");
assert.equal(entry.id, "skills");
assert.equal(entry.order, 20);
assert.equal(entry.label(), "panel");

const composer = okRun.registered.find((item) => item.name === "conversation.input.left");
assert.equal(composer.id, "workspace-skills");
const composerFace = composer.inject("s1");
assert.equal(composerFace.cwd, "C:/work/demo");
assert.equal(composerFace.t("panel"), "panel");

assert.ok(okRun.ctx.localeRegistration !== undefined, "locale dictionaries registered");
assert.equal(okRun.ctx.localeRegistration.namespace, "skill-manager");
const zhKeys = Object.keys(okRun.ctx.localeRegistration.dictionaries.zh).sort();
const enKeys = Object.keys(okRun.ctx.localeRegistration.dictionaries.en).sort();
assert.equal(JSON.stringify(zhKeys), JSON.stringify(enKeys), "zh/en dictionaries share one key set");

const failRemote = {
  async listPlugins() {
    return { ok: false, error: { code: "gateway/unavailable", message: "host offline" } };
  },
  async setPluginEnabled() {
    return { ok: false, error: { code: "gateway/denied", message: "denied" } };
  },
};
const failRun = createStubContext(failRemote);
plugin.apply(failRun.ctx);
const failPanel = failRun.registered.find((item) => item.name === "main");
const failFace = failPanel.inject();
await assert.rejects(
  () => failFace.pluginManager.listPlugins(),
  (error) => String(error?.message ?? error).includes("gateway/unavailable"),
);
await assert.rejects(
  () => failFace.pluginManager.setPluginEnabled("mcp-kimi-cu", true),
  (error) => String(error?.message ?? error).includes("gateway/denied"),
);

console.log("client-harness: bundle loads, 3 slots registered, Remote envelope unwrapped, dictionaries consistent");
