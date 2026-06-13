# Enterprise Edition modules

Everything under `apps/backend/src/ee` is **NOT** covered by the repository's default ELv2 license.
It is covered by the **OWOX Enterprise License** — see [`licenses/ee.md`](../../../../licenses/ee.md)
and the licensing table in the root [`LICENSE.md`](../../../../LICENSE.md).

---

## Loading mechanism

`apps/backend/src/ee-module.loader.ts` is the **only** EE-aware file in core.
It performs a non-static dynamic `import()` using a path variable so TypeScript does not statically
resolve the import; the compiled CommonJS output resolves the path at runtime via `require()`.

On error (module not found) or when disabled, the loader returns an empty stub `DynamicModule` and
logs a single info message. The application starts normally in all cases.

---

## Three disable levels

| Level                                       | Mechanism                                                              | Effect                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/ee` directory absent (community build) | Dynamic `import()` throws `ERR_MODULE_NOT_FOUND` — loader returns stub | Application is identical to current community behaviour                                                    |
| Directory present, globally disabled        | `EE_MODULES_ENABLED=false`                                             | Same — loader returns stub before attempting import                                                        |
| Directory present, submodule disabled       | `ADVANCED_SEARCH_ENABLED` not `true` (default)                         | `AdvancedSearchModule.register()` returns a bare module with no providers, no controllers, no DDL, no cron |

---

## Runtime license verification

`EeLicenseService` (in `ee/shared/`) wraps `AppEditionConfig.isEnterpriseEdition()`.
`AppEditionConfig` is initialized by `CommonModule` and reads the `LICENSE_KEY` env variable —
a signed JWT issued by OWOX. When the key is absent or expired, the edition falls back to
`COMMUNITY`.

`EeLicenseService.verifyLicensed()` throws `ForbiddenException('Enterprise license required')`
when the active edition is not `ENTERPRISE`.

---

## Convention for new EE submodules

Every EE submodule **must**:

1. Be a `DynamicModule` with a static `register()` factory method.
2. Check its own env gate at the top of `register()` and return `{ module: SubModule }` when
   the gate is off — no providers, no controllers, no side effects.
3. Be registered inside `EeModule.register()` (`apps/backend/src/ee/ee.module.ts`).
4. Follow [MODULAR_CONVENTIONS.md](../../MODULAR_CONVENTIONS.md) internally
   (controllers / services / use-cases / facades / shared).
5. Have unit tests for all facade implementations (CI gate).

---

## Model

The model and its quantization are hard-coded in `embedding/embedding-provider.ts`
(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, `dtype: q8`, 384-dim, multilingual). They
define the index: changing either silently invalidates every stored embedding until a full
reconcile completes, so both are constants rather than env knobs. `@huggingface/transformers`
downloads the model lazily on the first `embed()` call.

---

## Benchmarks

Measured on a synthetic corpus (N=5 000 data marts, 2 500 edges, DIM=384, 50 iterations).
Machine: Apple Silicon M-series, Node.js 22.16.0.

| Operation            | p50      | p95       | max       | Throughput      |
| -------------------- | -------- | --------- | --------- | --------------- |
| `rank()` full-corpus | 99.96 ms | 103.20 ms | 109.17 ms | ~50 k marts/sec |
| `bufferToVec`        | —        | —         | —         | ~8 M vecs/sec   |

`rank()` scores every mart with cosine similarity (DIM=384) plus keyword matching and
graph extendability, then sorts. At 5 000 marts a single query takes ~100 ms; typical
production corpora (< 500 marts per project) land well under 10 ms.
