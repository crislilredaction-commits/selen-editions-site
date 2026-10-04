import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// No fallback to real modules or network: every runtime dependency must be supplied.
export function loadTypeScript(path, dependencies = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, URL, ...globals,
    require(name) {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return exports;
}
