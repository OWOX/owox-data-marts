// Hand-authored type declarations for the @owox/connectors package.
//
// The package is built with a custom Vite pipeline and ships compiled
// JavaScript only (no emitted .d.ts). Without a `types` entry, TypeScript
// consumers (the backend) cannot resolve `@owox/connectors` under classic
// `moduleResolution: node` — existing imports "worked" only via warm
// incremental cache, and any NEW importing file failed `nest build` with
// TS2307. These declarations describe the public runtime surface so the module
// resolves cleanly on a cold build.
//
// Types are intentionally permissive: the engine is plain JavaScript, so this
// mirrors the (effectively `any`) behaviour consumers already had, without
// pretending to a richer contract. Richer per-member types can be added
// incrementally later.

/**
 * Engine namespace (`Core.ManifestParser`, `Core.EXECUTION_STATUS`,
 * `Core.ConfigDto`, …). The value side exposes every runtime member via an
 * index signature, so new members need no enumeration here.
 */
export const Core: { [key: string]: any };

/**
 * Type-only side of `Core`, merged with the value above. Only members used in
 * TYPE position need a declaration here (a value index signature cannot supply
 * type-space members). Currently only `Core.CONFIG_ATTRIBUTES` is used as a type.
 */
export namespace Core {
  type CONFIG_ATTRIBUTES = any;
}

/** List of available (bundled) connector names. */
export const AvailableConnectors: string[];

/** Map of bundled connector classes/factories, keyed by name. */
export const Connectors: Record<string, any>;
