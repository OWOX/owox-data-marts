// source-credential-injector.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';
import { legacyCredentialIdOf } from './connector-credential-injector.service';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';
import { SourceCredentialUnavailableException } from '../../exceptions/source-credential-unavailable.exception';
import {
  CREDENTIAL_NO_LONGER_FITS,
  SourceCredentialBindingService,
  type ResolvedSourceCredential,
} from '../../connector-types/source-credential-binding.service';
import {
  sourceBindingFor,
  type SourceCredentialBinding,
} from '../../connector-types/source-credential-definitions';
import {
  customConnectorConfigRefusal,
  type CustomConnectorKeyModel,
} from '../../connector-types/custom-connector-credential-fit';
import { OLD_ROW_TOKEN_FIELD } from '../../connector-types/source-key-fields';
import { isCustomConnectorMetadata } from '../../credentials/credential.types';
import {
  CredentialService,
  ROTATION_LEASE_STALE_MS,
} from '../../credentials/services/credential.service';
import { Core } from '@owox/connectors';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD, GENERATED_REFRESH_TOKEN_CONFIG_FIELD } = Core;

const ROTATION_LEASE_POLL_MS = 500;
/** How many Credentials a run follows a rebinding configuration to before it gives up. */
const ROTATION_LEASE_ROUNDS = 3;
/** A run waits until a held lease would go stale. */
export const RUN_ROTATION_LEASE_WAIT_MS = ROTATION_LEASE_STALE_MS;
/** Short enough that a builder test still answers inside the web request's 30 s timeout. */
export const BUILDER_TEST_ROTATION_LEASE_WAIT_MS = 5_000;
export const ROTATION_LEASE_BUSY =
  "Another run is refreshing this Credential's token; the next run retries.";

/** A configuration ready to run on its bound Credential. */
export interface BoundSourceConfig {
  /** The configuration with the Credential's values and without its old key references. */
  readonly config: Record<string, unknown>;
  readonly credentialId: string;
  /** The secret values the run starts from, for the compare-and-set of a rotated token. */
  readonly expected: Readonly<Record<string, string | undefined>>;
  /** Parameters a custom connector Credential filled, for OW_KEY_PARAMETERS. */
  readonly keyParameters?: string[];
  /** The rotation lease on this Credential; released once the rotated token is stored. */
  readonly rotationLease?: { readonly credentialId: string; readonly leaseId: string };
}

/** A custom connector Credential's values for a builder test. */
export interface TestCredentialValues {
  /** Flat, like typed test values. */
  readonly parameters: Record<string, string>;
  readonly keyParameters: string[];
  /** The secret values the test starts from, for the compare-and-set of a rotated token. */
  readonly expected: Readonly<Record<string, string | undefined>>;
  /** Every value the Credential holds. */
  readonly values: string[];
}

/** Where a Credential's values go: a built-in variant, or a custom connector's top level. */
interface CredentialTarget {
  readonly path: readonly string[];
  readonly fieldMap: Readonly<Record<string, string>>;
  readonly binding?: SourceCredentialBinding;
  readonly keyParameters?: readonly string[];
  /** The run may report a rotated refresh token. */
  readonly rotatesRefreshToken: boolean;
}

@Injectable()
export class SourceCredentialInjectorService {
  private readonly logger = new Logger(SourceCredentialInjectorService.name);

  constructor(
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly connectorService: ConnectorService,
    private readonly sourceCredentials: SourceCredentialBindingService,
    private readonly credentialService: CredentialService
  ) {}

  /** The configuration on its bound Credential's values; null when it has no binding. */
  async resolveBoundConfig(
    projectId: string,
    dataMartId: string,
    connectorName: string,
    configId: string,
    config: Record<string, unknown>,
    manifest: Record<string, unknown> | null
  ): Promise<BoundSourceConfig | null> {
    const resolve = () => this.sourceCredentials.resolveForConfig(projectId, dataMartId, configId);
    const first = await resolve();
    if (!first) return null;
    const targetOf = (credential: ResolvedSourceCredential) =>
      manifest
        ? customTarget(connectorName, credential, manifest, config)
        : builtinTarget(connectorName, credential);
    const { credential: resolved, leaseId } = await this.leaseRotation(
      first,
      resolve,
      RUN_ROTATION_LEASE_WAIT_MS,
      credential => targetOf(credential).rotatesRefreshToken
    );

    try {
      // Judged on the read under the lease.
      const target = targetOf(resolved);
      const refreshed =
        target.binding !== undefined &&
        (await this.refreshBound(projectId, connectorName, resolved, target.binding));
      const rotated = await this.takeNewerRotatedToken(projectId, connectorName, config, resolved);
      // Re-read after a write so the loser of a concurrent one runs on the winner's values;
      // by id, since the lease covers this Credential whatever the binding names now.
      const credential =
        refreshed || rotated
          ? await this.sourceCredentials.resolveCredential(projectId, resolved.credentialId)
          : resolved;

      const { config: injected, filled, token } = applyCredential(config, target, credential);
      await this.sourceCredentials.markConfigUsed(dataMartId, configId, credential.credentialId);

      return {
        config: injected,
        credentialId: credential.credentialId,
        expected: expectedOf(credential),
        ...(target.keyParameters && {
          keyParameters: keyParametersOf(target.keyParameters, filled, token),
        }),
        ...(leaseId && { rotationLease: { credentialId: resolved.credentialId, leaseId } }),
      };
    } catch (error) {
      if (leaseId) await this.credentialService.releaseRotation(resolved.credentialId, leaseId);
      throw error;
    }
  }

  /**
   * For a Credential whose refresh token may rotate: waits up to `waitMs` for its rotation lease,
   * then reads it again. The lease, when taken, is on the Credential returned; the caller releases it.
   * Throws SourceCredentialUnavailableException when the lease stays held.
   */
  async leaseRotation(
    credential: ResolvedSourceCredential,
    reread: () => Promise<ResolvedSourceCredential | null>,
    waitMs: number,
    rotatesRefreshToken: (credential: ResolvedSourceCredential) => boolean
  ): Promise<{ credential: ResolvedSourceCredential; leaseId?: string }> {
    let candidate = credential;
    for (let round = 0; round < ROTATION_LEASE_ROUNDS; round++) {
      // A rotated token is always redeemed in turn; a first refresh until a run found the token stays.
      const leased =
        Boolean(rotatedTokenOf(candidate)) ||
        (rotatesRefreshToken(candidate) && !candidate.refreshTokenStaticAt);
      if (!leased) return { credential: candidate };
      const leaseId = await this.waitForRotationLease(candidate.credentialId, waitMs);
      let current: ResolvedSourceCredential;
      try {
        current = (await reread()) ?? candidate;
      } catch (error) {
        await this.credentialService.releaseRotation(candidate.credentialId, leaseId);
        throw error;
      }
      const same = current.credentialId === candidate.credentialId;
      // A run that held the lease meanwhile may have found the token stays, so waiting runs need not take turns.
      const nowStatic = Boolean(current.refreshTokenStaticAt) && !rotatedTokenOf(current);
      if (same && !nowStatic) return { credential: current, leaseId };
      await this.credentialService.releaseRotation(candidate.credentialId, leaseId);
      if (same) return { credential: current };
      // Rebound while waiting: the run uses the new Credential, so that one is leased instead.
      candidate = current;
    }
    throw new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY);
  }

  /** A custom connector Credential's values for a builder test: no binding, refresh or usage mark. */
  testValues(
    connectorName: string,
    config: Record<string, unknown>,
    manifest: Record<string, unknown>,
    credential: ResolvedSourceCredential
  ): TestCredentialValues {
    const target = customTarget(connectorName, credential, manifest, config);
    const { filled, token } = applyCredential({}, target, credential);
    return {
      parameters: {
        ...filled,
        ...(token ? { [GENERATED_REFRESH_TOKEN_CONFIG_FIELD]: token } : {}),
      },
      keyParameters: keyParametersOf(target.keyParameters ?? [], filled, token),
      expected: expectedOf(credential),
      values: Object.values(credentialValues(credential)),
    };
  }

  /** A bundled connector's configuration on a Credential's values, for a preview: no binding or refresh. */
  previewBoundConfig(
    config: Record<string, unknown>,
    connectorName: string,
    credential: ResolvedSourceCredential
  ): Record<string, unknown> {
    return applyCredential(config, builtinTarget(connectorName, credential), credential).config;
  }

  /** Polls for the lease until `waitMs` has passed; never redeems a token without it. */
  private async waitForRotationLease(credentialId: string, waitMs: number): Promise<string> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const leaseId = await this.credentialService.claimRotation(credentialId);
      if (leaseId) return leaseId;
      if (Date.now() >= deadline) {
        throw new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY);
      }
      await new Promise(resolve => setTimeout(resolve, ROTATION_LEASE_POLL_MS));
    }
  }

  /** Writes the token the connector refreshed into the Credential; true when it tried. */
  private async refreshBound(
    projectId: string,
    connectorName: string,
    credential: ResolvedSourceCredential,
    binding: SourceCredentialBinding
  ): Promise<boolean> {
    try {
      const refreshed = await this.connectorService.refreshBoundCredential(
        connectorName,
        credential,
        binding
      );
      if (!refreshed) return false;
      const current = credentialValues(credential);
      await this.credentialService.updateSecretFields(
        credential.credentialId,
        projectId,
        refreshed.fields,
        Object.fromEntries(Object.keys(refreshed.fields).map(field => [field, current[field]])),
        refreshed.expiresAt
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to refresh Credential ${credential.credentialId}: ${castError(error).message}. Using its current values.`
      );
      return false;
    }
  }

  /** A token an N-1 run rotated on the old row since it was last taken, on the Credential's grant, wins until the Credential rotates its own; true when tried. */
  private async takeNewerRotatedToken(
    projectId: string,
    connectorName: string,
    config: Record<string, unknown>,
    credential: ResolvedSourceCredential
  ): Promise<boolean> {
    const oldRowId = legacyCredentialIdOf(config);
    if (!oldRowId || !('fields' in credential.secret)) return false;
    const {
      [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: current,
      [OLD_ROW_TOKEN_FIELD]: base,
      ...keys
    } = credential.secret.fields;
    if (!base || current !== base) return false;
    const row = await this.connectorSourceCredentialsService.getCredentialsById(oldRowId);
    const rotated: unknown = row?.credentials?.[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
    if (
      !row ||
      row.projectId !== projectId ||
      row.connectorName?.toLowerCase() !== connectorName.toLowerCase() ||
      typeof rotated !== 'string' ||
      !rotated ||
      rotated === base
    ) {
      return false;
    }
    const rowValues = new Set(Object.values(row.credentials));
    if (!Object.values(keys).every(value => rowValues.has(value))) return false;
    await this.credentialService.updateSecretFields(
      credential.credentialId,
      projectId,
      { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: rotated, [OLD_ROW_TOKEN_FIELD]: rotated },
      { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: base, [OLD_ROW_TOKEN_FIELD]: base }
    );
    return true;
  }
}

function builtinTarget(
  connectorName: string,
  credential: ResolvedSourceCredential
): CredentialTarget {
  const binding = sourceBindingFor(connectorName, credential.definitionId);
  if (!binding) throw boundaryError(connectorName, credential);
  return {
    path: binding.path,
    fieldMap: binding.fieldMap,
    binding,
    rotatesRefreshToken: binding.rotatesRefreshToken === true,
  };
}

/** A custom connector Credential runs only on the manifest version it fits. */
function customTarget(
  connectorName: string,
  credential: ResolvedSourceCredential,
  manifest: Record<string, unknown>,
  config: Record<string, unknown>
): CredentialTarget {
  const { publicMetadata } = credential;
  const model = new Core.ManifestParser().parse(
    JSON.stringify(manifest)
  ) as CustomConnectorKeyModel;
  const refusal = customConnectorConfigRefusal(model, credential, config);
  if (refusal?.kind === 'other-definition') throw boundaryError(connectorName, credential);
  if (refusal) {
    throw new SourceCredentialUnavailableException(
      refusal.kind === 'misuse' ? refusal.message : CREDENTIAL_NO_LONGER_FITS
    );
  }
  if (!isCustomConnectorMetadata(publicMetadata)) throw boundaryError(connectorName, credential);
  return {
    path: [],
    // A field the manifest does not key leaves the configuration's own value.
    fieldMap: Object.fromEntries(
      publicMetadata.fieldList
        .filter(({ key }) => model.keyParameters.includes(key))
        .map(({ key }) => [key, key])
    ),
    keyParameters: model.keyParameters,
    // The parser declares it for every oauth2 authentication, not only a refresh grant.
    rotatesRefreshToken: Object.hasOwn(model.parameters, GENERATED_REFRESH_TOKEN_CONFIG_FIELD),
  };
}

function boundaryError(
  connectorName: string,
  { credentialId, definitionId }: ResolvedSourceCredential
): ConnectorCredentialBoundaryError {
  return new ConnectorCredentialBoundaryError(
    `Credential ${credentialId} (${definitionId}) does not belong to connector ${connectorName}.`
  );
}

/** A bound Credential's values by field: public ones, then secret ones. */
function credentialValues({
  secret,
  publicMetadata,
}: ResolvedSourceCredential): Record<string, string> {
  return {
    ...(publicMetadata && 'fields' in publicMetadata ? publicMetadata.fields : {}),
    ...('fields' in secret ? secret.fields : 'value' in secret ? { value: secret.value } : {}),
  };
}

/** The configuration without its old key references, on the Credential's values at the target. */
function applyCredential(
  config: Record<string, unknown>,
  target: CredentialTarget,
  credential: ResolvedSourceCredential
): { config: Record<string, unknown>; filled: Record<string, string>; token: string | undefined } {
  const values = credentialValues(credential);
  const filled: Record<string, string> = {};
  for (const [field, parameter] of Object.entries(target.fieldMap)) {
    if (Object.hasOwn(values, field)) filled[parameter] = values[field];
  }
  const token = rotatedTokenOf(credential);
  // A bound configuration never reads its old key rows.
  const withoutOldKeys = JSON.parse(
    JSON.stringify(config, (key, value: unknown) =>
      key === '_secrets_id' || key === '_source_credential_id' ? undefined : value
    )
  ) as Record<string, unknown>;
  return {
    config: withValuesAt(withoutOldKeys, target.path, {
      ...filled,
      ...(token ? { [GENERATED_REFRESH_TOKEN_CONFIG_FIELD]: { value: token } } : {}),
    }),
    filled,
    token,
  };
}

/** OW_KEY_PARAMETERS: what the Credential filled, plus a token the run may rotate or receives. */
function keyParametersOf(
  keyParameters: readonly string[],
  filled: Record<string, string>,
  token: string | undefined
): string[] {
  return [
    ...Object.keys(filled),
    ...(token || keyParameters.includes(GENERATED_REFRESH_TOKEN_CONFIG_FIELD)
      ? [GENERATED_REFRESH_TOKEN_CONFIG_FIELD]
      : []),
  ];
}

/** Every secret value the run read and the rotated token; a key changed meanwhile drops the rotation. */
function expectedOf({ secret }: ResolvedSourceCredential): Record<string, string | undefined> {
  return {
    [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: undefined,
    ...('fields' in secret ? secret.fields : {}),
  };
}

function rotatedTokenOf({ secret }: ResolvedSourceCredential): string | undefined {
  return 'fields' in secret ? secret.fields[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD] : undefined;
}

/** `values` at `path`; a variant path like ['AuthType', 'oauth2'] also makes it the only variant. */
function withValuesAt(
  config: Record<string, unknown>,
  path: readonly string[],
  values: Record<string, unknown>
): Record<string, unknown> {
  if (path.length === 0) return { ...config, ...values };
  const [parameter, variant] = path;
  const current = (config[parameter] as Record<string, unknown> | undefined)?.[variant];
  const items =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...config, [parameter]: { [variant]: { ...items, ...values } } };
}
