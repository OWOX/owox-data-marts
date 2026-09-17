// E2E type-level test: a modern consumer resolving @owox/connectors under
// `moduleResolution: nodenext`, which reads the `exports["."].types` condition
// of package.json (NOT the top-level `types` field that node10 uses).
//
// Compiled via `tsc --noEmit -p tests/types/tsconfig.nodenext.json`. Together
// with node10.consumer.ts this proves BOTH resolution algorithms see the
// bundled declarations against the package's real package.json — the complete
// published type contract a downstream consumer relies on.

import { Core, AvailableConnectors, Connectors } from '@owox/connectors';

const parser = new Core.ManifestParser();
void parser;

type Attrs = Core.CONFIG_ATTRIBUTES;
void (undefined as unknown as Attrs);

const name: string = AvailableConnectors[0];
void name;

const klass = Connectors['SomeConnector'];
void klass;
