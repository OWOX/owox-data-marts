// Imported by migration 1792800000000: keep it and its imports free of Nest and runtime services.
import { Core, type KeyParameterMisuse } from '@owox/connectors';
import {
  isCustomConnectorMetadata,
  type CredentialPublicMetadata,
  type CustomConnectorFieldSpec,
  type CustomConnectorPublicMetadata,
} from '../credentials/credential.types';
import { CUSTOM_CONNECTOR_DEFINITION_ID } from './source-credential-definitions';

export interface CustomConnectorFit {
  readonly fits: boolean;
  readonly reasons: readonly ('host' | 'field' | 'misuse')[];
}

/** What `ManifestParser.parse()` reports about a manifest's keys and hosts. */
export interface CustomConnectorKeyModel {
  allowedHosts: string[];
  keyParameters: string[];
  keyParameterBranches: Record<string, string[]> | null;
  keyParameterMisuse: KeyParameterMisuse[];
  parameters: Record<
    string,
    { isRequired?: boolean; label?: string; attributes?: string[]; default?: unknown }
  >;
  authentication?: { selectionParameter?: string };
}

/** What a new Credential must hold to fit a manifest, without values. */
export interface CustomConnectorCredentialRequirement {
  readonly hosts: string[];
  /** The selection's key parameters, generated ones aside; empty until a selective branch is picked. */
  readonly fieldList: (CustomConnectorFieldSpec & { readonly required: boolean })[];
  /** Every key parameter of every branch: a configuration never holds a value for one. */
  readonly keyParameters: string[];
  readonly selectionParameter?: string;
  /** The run error for each key parameter used where no request is built; no Credential fits while any is listed. */
  readonly misuse: string[];
}

/** The branch a configuration selects, as the engine reads it: its value, else the default. */
export function selectionOf(
  model: CustomConnectorKeyModel,
  config: Readonly<Record<string, unknown>>
): string | undefined {
  const name = model.authentication?.selectionParameter;
  if (!name) return undefined;
  const raw = config[name];
  // The engine trims a text value and runs the default in place of an empty one.
  const typed = typeof raw === 'string' ? raw.trim() : raw;
  const value =
    typed === undefined || typed === null || typed === '' ? model.parameters[name]?.default : typed;
  return typeof value === 'string' ? value : undefined;
}

/** The key parameters of `selection`; undefined without a valid one. */
export function selectedKeyParameters(
  model: CustomConnectorKeyModel,
  selection?: string
): string[] | undefined {
  const branches = model.keyParameterBranches;
  return branches === null
    ? model.keyParameters
    : selection !== undefined && Object.hasOwn(branches, selection)
      ? branches[selection]
      : undefined;
}

const isRequired = (model: CustomConnectorKeyModel, key: string) =>
  model.parameters[key]?.isRequired === true;

/** What fits the model for `selection`, read the way `fitCustomConnectorCredential` reads it. */
export function customConnectorCredentialRequirement(
  model: CustomConnectorKeyModel,
  selection?: string
): CustomConnectorCredentialRequirement {
  const selectionParameter = model.authentication?.selectionParameter;
  return {
    hosts: [...model.allowedHosts],
    fieldList: (selectedKeyParameters(model, selection) ?? [])
      // A run writes the generated refresh token; nobody enters it.
      .filter(key => key !== Core.GENERATED_REFRESH_TOKEN_CONFIG_FIELD)
      .map(key => ({
        key,
        label: model.parameters[key]?.label ?? key,
        secret: model.parameters[key]?.attributes?.includes(Core.CONFIG_ATTRIBUTES.SECRET) === true,
        required: isRequired(model, key),
      })),
    keyParameters: [...model.keyParameters],
    ...(selectionParameter !== undefined && { selectionParameter }),
    misuse: model.keyParameterMisuse.map(describeKeyParameterMisuse),
  };
}

/** Whether a custom connector Credential can run a manifest; `selection` picks the selective branch. */
export function fitCustomConnectorCredential(
  model: CustomConnectorKeyModel,
  metadata: CustomConnectorPublicMetadata,
  selection?: string
): CustomConnectorFit {
  const reasons: ('host' | 'field' | 'misuse')[] = [];
  const hosts = new Set(metadata.hosts.map(host => host.toLowerCase()));
  if (!model.allowedHosts.every(host => hosts.has(host.toLowerCase()))) reasons.push('host');

  const held = new Set(metadata.fieldList.map(field => field.key));
  const keys = selectedKeyParameters(model, selection);
  // Optional key parameters, like GeneratedRefreshToken, never decide fit.
  if (!keys?.filter(key => isRequired(model, key)).every(key => held.has(key))) {
    reasons.push('field');
  }

  if (model.keyParameterMisuse.length > 0) reasons.push('misuse');
  return { fits: reasons.length === 0, reasons };
}

export type CustomConnectorRefusal =
  | { kind: 'other-definition' }
  | { kind: 'misuse'; message: string }
  | { kind: 'unfit' };

/** Why a Credential cannot run the manifest for `selection`; null when it fits. */
export function customConnectorRefusal(
  model: CustomConnectorKeyModel,
  credential: { definitionId: string; publicMetadata: CredentialPublicMetadata | null },
  selection?: string
): CustomConnectorRefusal | null {
  const { definitionId, publicMetadata } = credential;
  if (
    definitionId !== CUSTOM_CONNECTOR_DEFINITION_ID ||
    !isCustomConnectorMetadata(publicMetadata)
  ) {
    return { kind: 'other-definition' };
  }
  const fit = fitCustomConnectorCredential(model, publicMetadata, selection);
  if (fit.fits) return null;
  // No Credential fits a manifest that misuses a key parameter, so the refusal names the misuse.
  return fit.reasons.includes('misuse')
    ? { kind: 'misuse', message: describeKeyParameterMisuse(model.keyParameterMisuse[0]) }
    : { kind: 'unfit' };
}

/** `customConnectorRefusal` for the branch a configuration selects. */
export const customConnectorConfigRefusal = (
  model: CustomConnectorKeyModel,
  credential: { definitionId: string; publicMetadata: CredentialPublicMetadata | null },
  config: Readonly<Record<string, unknown>>
) => customConnectorRefusal(model, credential, selectionOf(model, config));

/** The engine's own wording for a key parameter used where no request is built. */
export function describeKeyParameterMisuse({
  parameter,
  node,
  position,
}: KeyParameterMisuse): string {
  return (
    `Key parameter "${parameter}" cannot be used in ${position}` +
    (node ? ` of node "${node}"` : '')
  );
}
