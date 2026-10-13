import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temporary = mkdtempSync(join(tmpdir(), "dsm-mcp-test-"));
try {
  const outfile = join(temporary, "mcp.mjs");
  await build({ entryPoints: [join(process.cwd(), "src/mcp-config.ts")], outfile, bundle: true, format: "esm", platform: "node", target: ["node22"], logLevel: "warning", banner: { js: "import { createRequire as __crc } from 'node:module'; const require = __crc(import.meta.url);" } });
  const module = await import(pathToFileURL(outfile).href);

  const profile = join(temporary, "desktop");
  const patchPath = join(profile, "cordis.patch.yml");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}\n");
  writeFileSync(patchPath, [
    "# keep me",
    "- id: existing",
    '  name: "@deepseek-ai/other"',
    "- insert:",
    "    - id: keep-row",
    '      name: "@deepseek-ai/keep"',
  ].join("\n"));

  module.appendMcpServers(patchPath, [{ serverName: "kimi-cu", transport: "stdio", command: "C:\\path\\tool.exe", args: ["mcp"] }]);
  const afterFirst = readFileSync(patchPath, "utf8");
  assert.ok(afterFirst.includes("# keep me"), "comments preserved");
  assert.ok(afterFirst.includes("keep-row"), "existing rows preserved");
  assert.ok(afterFirst.includes("serverName: kimi-cu"), "server appended");
  assert.ok(afterFirst.includes("id: mcp-kimi-cu"), "entry id derived");
  assert.match(afterFirst, /command: C:\\path\\tool\.exe/);

  assert.throws(() => module.appendMcpServers(patchPath, [{ serverName: "kimi-cu", transport: "stdio", command: "x" }]), /已存在/);
  assert.throws(() => module.appendMcpServers(patchPath, [{ serverName: "bad name!", transport: "stdio", command: "x" }]), /无效/);

  module.appendMcpServers(patchPath, [{ serverName: "zap", transport: "stdio", command: "zap-mcp" }]);
  assert.ok(readFileSync(patchPath, "utf8").includes("serverName: zap"));

  module.appendMcpServers(patchPath, [{ serverName: "web-one", transport: "streamable-http", url: "https://example.com/mcp" }]);
  const final = readFileSync(patchPath, "utf8");
  assert.ok(final.includes("transport: streamable-http"));
  assert.ok(final.includes("url: https://example.com/mcp"));

  const parsed = module.parseMcpConfigJson('{ "mcpServers": { "a": { "command": "a" }, "b": { "url": "https://x/mcp" } } }');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].transport, "stdio");
  assert.equal(parsed[1].transport, "streamable-http");
  const nested = module.parseMcpConfigJson('{ "outer": { "mcpServers": { "c": { "command": "c" } } } }');
  assert.equal(nested.length, 1);
  assert.throws(() => module.parseMcpConfigJson("{ bad"), /JSON/);
  assert.throws(() => module.parseMcpConfigJson('{"mcpServers":{"d":{}}}'), /传输类型/);

  console.log("mcp-config selftest passed: append, preserve, duplicate, names, http, parse");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
