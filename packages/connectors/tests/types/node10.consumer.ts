// INTEGRATION type-level test: a TypeScript consumer resolving @owox/connectors
// by its PACKAGE SPECIFIER under classic node10 resolution
// (`moduleResolution: node`) — the exact mode apps/backend/tsconfig.json uses.
//
// Compiled via `tsc --noEmit -p tests/types/tsconfig.node10.json`. node10 reads
// the top-level `types` field of package.json (it ignores `exports`); before
// that field existed this import failed with TS2307 "Cannot find module
// '@owox/connectors'". This is the regression guard for that original bug.

import { Core, AvailableConnectors, Connectors } from '@owox/connectors';

const parser = new Core.ManifestParser();
void parser;

type Attrs = Core.CONFIG_ATTRIBUTES;
void (undefined as unknown as Attrs);

const name: string = AvailableConnectors[0];
void name;

const klass = Connectors['SomeConnector'];
void klass;
