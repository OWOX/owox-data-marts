import { BadRequestException } from '@nestjs/common';
import { Core } from '@owox/connectors';
import type { z } from 'zod';

import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { ConnectorSpecification } from '../../connector-types/connector-specification';
import {
  mapConnectorFieldsSchema,
  type SourceFieldsSchema,
} from './connector-fields-schema.mapper';
import { mapConnectorSpecification } from './connector-specification.mapper';

/**
 * The configuration form of a custom connector, built from its manifest with the mapper the
 * bundled connectors use, so both come out in the same shape.
 */
export function specificationFromManifest(
  manifest: Record<string, unknown>
): ConnectorSpecification {
  const source = declarativeSourceFromManifest(manifest);
  return parseOrExplain(
    ConnectorSpecification,
    mapConnectorSpecification(source.parameters),
    'parameter'
  );
}

/** The nodes and fields a Data Mart can pick from a custom connector, built from its manifest. */
export function fieldsSchemaFromManifest(manifest: Record<string, unknown>): ConnectorFieldsSchema {
  const source = declarativeSourceFromManifest(manifest);
  return parseOrExplain(
    ConnectorFieldsSchema,
    mapConnectorFieldsSchema(source.getFieldsSchema() as SourceFieldsSchema),
    'node'
  );
}

function declarativeSourceFromManifest(manifest: Record<string, unknown>) {
  const context = new Core.AbstractContext({
    source: { name: 'custom', config: {} },
    storage: { name: 'unused', config: {} },
    runConfig: {},
    env: { datamartId: null, runId: null },
  });
  let model;
  try {
    model = new Core.ManifestParser().parse(JSON.stringify(manifest));
  } catch (e) {
    throw new BadRequestException(`Invalid manifest: ${(e as Error).message}`);
  }
  return new Core.DeclarativeSource(context, model);
}

/** Spec keys the manifest spells differently, so a problem names the key the author wrote. */
const MANIFEST_KEYS: Record<string, string> = { title: 'label', required: 'isRequired' };

/**
 * The schemas are stricter than the manifest parser, a parameter's requiredType or an options
 * list of strings among them, so a manifest the parser accepts can still fail here. Such a
 * failure is the author's to fix, so it is reported against the parameter or node it is in.
 */
function parseOrExplain<T>(
  schema: z.ZodType<T>,
  items: { name: string }[],
  kind: 'parameter' | 'node'
): T {
  const parsed = schema.safeParse(items);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map(issue => {
    const [index, ...path] = issue.path;
    const name = typeof index === 'number' ? items[index]?.name : undefined;
    const where = path.map(key => MANIFEST_KEYS[key] ?? key).join('.');
    return `${kind} "${String(name)}" ${where}: ${issue.message}`;
  });
  throw new BadRequestException(`Invalid manifest: ${problems.join('; ')}`);
}
