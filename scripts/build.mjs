import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(root, "..");
const outdir = join(pkgRoot, "lib");
mkdirSync(outdir, { recursive: true });

const shared = {
  bundle: true,
  logLevel: "info",
  sourcemap: false,
  target: ["es2023"],
  legalComments: "none",
};

await build({
  ...shared,
  entryPoints: [join(pkgRoot, "src/index.ts")],
  outfile: join(outdir, "index.js"),
  format: "esm",
  platform: "node",
  target: ["node22"],
  banner: { js: "import { createRequire } from 'node:module';\nvar require = createRequire(import.meta.url);" },
  external: ["@deepseek-ai/*"],
});

const clientResult = await build({
  ...shared,
  entryPoints: [join(pkgRoot, "src/client/index.tsx")],
  outfile: join(outdir, "client.js"),
  format: "cjs",
  platform: "browser",
  external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/*"],
  write: false,
});

const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
for (const file of clientResult.outputFiles) {
  const body = file.text.replace(/^\/\/ @ts-check.*$/m, "").trimEnd();
  const wrapped = [
    "window.__ModuleLoader__.load({",
    `\tid: ${JSON.stringify(pkg.name)},`,
    "\tfactory: (require) => {",
    "\t\tvar module = { exports: {} };",
    "\t\tvar exports = module.exports;",
    "\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: \"Module\" });",
    body,
    "\t\treturn module.exports;",
    "\t}",
    "});",
    "",
  ].join("\n");
  writeFileSync(join(outdir, "client.js"), wrapped);
}

console.log("build done");
