import fs from 'fs';
import vm from 'vm';

/**
 * Loads a GAS-style source file (a `var X = class X extends Y {...}` script with
 * no imports/exports) into the current realm so its class can be inspected in tests.
 *
 * Runs in `vm.runInThisContext` (not `vm.createContext`) so returned objects (arrays,
 * etc.) share the real Array/Object prototypes — a separate vm context would produce
 * cross-realm values that fail `toEqual`/`deepStrictEqual` even when structurally equal.
 *
 * @param {string} filePath - absolute path to the source file
 * @param {Record<string, unknown>} globalsStub - globals the file's top-level code needs
 *   (e.g. a minimal `AbstractSource` base class). Only values referenced before/without
 *   instantiation need to be real; constructor-only globals (CONFIG_ATTRIBUTES, etc.) can
 *   be omitted as long as tests don't call `new`.
 * @return {unknown} whatever global the file's `var <Name> = class ...` declares — caller
 *   must know the expected export name and read it off `globalThis` after calling this.
 */
export function loadGasClass(filePath, globalsStub = {}) {
  for (const [key, value] of Object.entries(globalsStub)) {
    globalThis[key] = value;
  }
  vm.runInThisContext(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
}
