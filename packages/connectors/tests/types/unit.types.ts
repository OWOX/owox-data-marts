// UNIT type-level test for the hand-authored @owox/connectors declaration.
//
// Compiled (not run) via `tsc --noEmit -p tests/types/tsconfig.unit.json`.
// It references types/index.d.ts DIRECTLY by relative path, so it isolates the
// declaration's shape from any package.json resolution concern (that is covered
// by the node10 / nodenext consumer tests).
//
// How the assertions bite:
//   * A positive use that stops compiling (e.g. a removed member) fails the build.
//   * A `@ts-expect-error` line fails the build if the expected error STOPS
//     occurring — so weakening a precise shape to `any` is caught as TS2578.

import { Core, AvailableConnectors, Connectors } from '../../types/index';

// Value side: `Core` exposes every runtime member through its index signature.
// If `Core` were narrowed to a closed object type without `ManifestParser`,
// this line would fail.
const parser = new Core.ManifestParser();
void parser;

// Type side: `Core.CONFIG_ATTRIBUTES` must resolve in TYPE position.
// Removing it from the type-only `namespace Core` triggers TS2694 here.
type Attrs = Core.CONFIG_ATTRIBUTES;
const attrs: Attrs = undefined as Attrs;
void attrs;

// `AvailableConnectors` is a `string[]`.
const name: string = AvailableConnectors[0];
void name;

// `Connectors` is a record keyed by string.
const klass = Connectors['SomeConnector'];
void klass;

// Negative: `AvailableConnectors` (string[]) is NOT assignable to a number.
// If the shape were weakened to `any`, this error would vanish and the unused
// directive would fail the build (TS2578).
// @ts-expect-error AvailableConnectors is string[], not number
const wrongType: number = AvailableConnectors;
void wrongType;

// Negative: `Connectors` (a record) is NOT assignable to a string.
// @ts-expect-error Connectors is Record<string, any>, not string
const wrongConnectors: string = Connectors;
void wrongConnectors;
