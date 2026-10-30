// Imported by migrations: keep it and its imports free of Nest and runtime services.
import { AvailableConnectors, Connectors, Core } from '@owox/connectors';
import {
  CredentialDefinitionContractSchema,
  type CredentialDefinitionContract,
} from '../credentials/credential.types';

export { CUSTOM_CONNECTOR_DEFINITION_ID } from '../credentials/services/builtin-credential-definitions';

/** Declared on an AuthType variant, or on a connector manifest when it has no AuthType. */
interface CredentialDeclaration {
  /** Reuse this existing definition instead of generating one. */
  readonly credentialDefinitionId?: string;
  readonly credentialDisplayName?: string;
  /** The provider may return a new refresh token on a refresh, which the run reports. */
  readonly rotatesRefreshToken?: boolean;
}

interface SourceParameter {
  readonly label?: string;
  readonly isRequired?: boolean;
  readonly attributes?: readonly string[];
  readonly oneOf?: readonly SourceVariant[];
}

interface SourceVariant extends CredentialDeclaration {
  readonly label: string;
  readonly value: string;
  readonly attributes?: readonly string[];
  readonly items: Readonly<Record<string, SourceParameter>>;
  /** Each parameter's key in the connector's OAuth output. */
  readonly oauthParams?: { readonly mapping?: Readonly<Record<string, unknown>> };
}

/** A connector as its package declares it: manifest and Source parameters. */
export interface ConnectorSpecSource {
  readonly name: string;
  readonly manifest: CredentialDeclaration & { readonly title: string; readonly category?: string };
  readonly parameters: Readonly<Record<string, SourceParameter>>;
}

export interface SourceCredentialBinding {
  readonly definitionId: string;
  /** Where the values go in the configuration; [] is the top level. */
  readonly path: readonly string[];
  /** The variant has the connector's OAuth flow. */
  readonly connect: boolean;
  /** Credential field key to the connector parameter at `path`. */
  readonly fieldMap: Readonly<Record<string, string>>;
  /** Runs on the Credential take turns under its rotation lease, from the first. */
  readonly rotatesRefreshToken?: true;
}

export interface SourceCredentialDefinitions {
  readonly definitions: CredentialDefinitionContract[];
  /** By connector name. */
  readonly bindings: Readonly<Record<string, readonly SourceCredentialBinding[]>>;
}

export function buildSourceCredentialDefinitions(
  connectors: readonly ConnectorSpecSource[]
): SourceCredentialDefinitions {
  const { SECRET, CREDENTIAL, OAUTH_FLOW, HIDE_IN_CONFIG_FORM, MULTILINE } = Core.CONFIG_ATTRIBUTES;
  const has = (item: { attributes?: readonly string[] } | undefined, attribute: string) =>
    item?.attributes?.includes(attribute) ?? false;
  const definitions: CredentialDefinitionContract[] = [];
  const bindings: Record<string, SourceCredentialBinding[]> = {};

  for (const { name, manifest, parameters } of connectors) {
    const variants = parameters.AuthType?.oneOf ?? [];
    const units = variants.length
      ? variants.map(variant => ({
          variant,
          declaration: variant,
          candidates: Object.entries(variant.items),
          displayName:
            variants.length > 1 ? `${manifest.title} (${variant.label})` : manifest.title,
        }))
      : [
          {
            variant: undefined,
            declaration: manifest,
            candidates: Object.entries(parameters).filter(
              ([, item]) => has(item, SECRET) || has(item, CREDENTIAL)
            ),
            displayName: manifest.title,
          },
        ];

    bindings[name] = [];
    for (const { variant, declaration, displayName, candidates } of units) {
      const keys = candidates.filter(([, item]) => !has(item, HIDE_IN_CONFIG_FORM));
      if (keys.length === 0) continue;
      const reused = declaration.credentialDefinitionId;
      if (reused && keys.length > 1) {
        throw new Error(`${name} has ${keys.length} key parameters; ${reused} holds one value`);
      }
      const definitionId = reused ?? `source:${name}:${variant?.value ?? 'default'}`;
      bindings[name].push({
        definitionId,
        path: variant ? ['AuthType', variant.value] : [],
        connect: has(variant, OAUTH_FLOW),
        // A reused built-in (github, google-service-account) stores its key as one `value`.
        fieldMap: Object.fromEntries(
          reused ? [['value', keys[0][0]]] : keys.map(([key]) => [key, key])
        ),
        ...(declaration.rotatesRefreshToken && { rotatesRefreshToken: true }),
      });
      if (reused) continue;

      const identity = keys.find(([, item]) => has(item, CREDENTIAL) && !has(item, SECRET))?.[0];
      definitions.push(
        CredentialDefinitionContractSchema.parse({
          id: definitionId,
          displayName: declaration.credentialDisplayName ?? displayName,
          category: manifest.category,
          connectors: [name],
          auth: {
            type: 'fields',
            fields: keys.map(([key, item]) => ({
              key,
              label: item.label ?? key,
              input: has(item, MULTILINE) ? 'multiline' : has(item, SECRET) ? 'password' : 'text',
              secret: has(item, SECRET),
              required: item.isRequired === true,
              identity: key === identity,
            })),
          },
        })
      );
    }
  }
  return { definitions, bindings };
}

let connectors: readonly ConnectorSpecSource[] | undefined;
let bundled: SourceCredentialDefinitions | undefined;

/** The bundled connectors as their package declares them, read on first use. */
export function bundledSourceConnectors(): readonly ConnectorSpecSource[] {
  return (connectors ??= AvailableConnectors.map(bundledConnector));
}

/** The definitions of the bundled connectors, built on first use. */
export function sourceCredentialDefinitions(): SourceCredentialDefinitions {
  return (bundled ??= buildSourceCredentialDefinitions(bundledSourceConnectors()));
}

export function sourceDefinitionIdsFor(connectorName: string): readonly string[] {
  return sourceBindingsFor(connectorName).map(binding => binding.definitionId);
}

/** The connectors whose bindings use the definition, generated or reused. */
export function sourceConnectorsOf(definitionId: string): string[] {
  const { bindings } = sourceCredentialDefinitions();
  return Object.keys(bindings).filter(name =>
    bindings[name].some(binding => binding.definitionId === definitionId)
  );
}

export function sourceBindingFor(
  connectorName: string,
  definitionId: string
): SourceCredentialBinding | null {
  return (
    sourceBindingsFor(connectorName).find(binding => binding.definitionId === definitionId) ?? null
  );
}

/** The binding whose variant runs the connector's OAuth flow at `fieldPath`, like "AuthType.oauth2". */
export function sourceConnectBindingFor(
  connectorName: string,
  fieldPath: string
): SourceCredentialBinding | null {
  return (
    sourceBindingsFor(connectorName).find(
      binding => binding.connect && binding.path.join('.') === fieldPath
    ) ?? null
  );
}

/** The OAuth output for each Credential field, read through the connector's `oauthParams.mapping`. */
export function sourceFieldValues(
  binding: SourceCredentialBinding,
  mapping: Record<string, { key?: string }> | undefined,
  output: Record<string, unknown>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [field, parameter] of Object.entries(binding.fieldMap)) {
    // Without a mapping the output is keyed by parameter, as the run-time injector reads it.
    const key = mapping ? mapping[parameter]?.key : parameter;
    if (key !== undefined && output[key] != null) values[field] = output[key];
  }
  return values;
}

export function sourceBindingsFor(connectorName: string): readonly SourceCredentialBinding[] {
  const { bindings } = sourceCredentialDefinitions();
  return Object.hasOwn(bindings, connectorName) ? bindings[connectorName] : [];
}

/** Reads a bundled connector's parameters as ConnectorService does. */
function bundledConnector(name: string): ConnectorSpecSource {
  const { manifest, [`${name}Source`]: SourceClass } = Connectors[name];
  const context = new Core.AbstractContext({
    source: { name, config: {} },
    storage: { name: 'unused', config: {} },
    runConfig: {},
    env: { datamartId: null, runId: null },
  });
  const source = SourceClass
    ? new SourceClass(context)
    : new Core.DeclarativeSource(
        context,
        new Core.ManifestParser().parse(JSON.stringify(manifest))
      );
  return { name, manifest, parameters: source.parameters };
}
