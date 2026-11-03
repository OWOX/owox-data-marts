import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Core } from '@owox/connectors';
import { castError } from '@owox/internal-helpers';
import { describeKeyParameterMisuse } from '../../connector-types/custom-connector-credential-fit';
import { customConnectorKeyModel } from '../../connector-types/custom-connector-key-model';
import { SourceCredentialBindingService } from '../../connector-types/source-credential-binding.service';
import { CredentialService } from '../../credentials/services/credential.service';
import type { CustomConnectorTestResultDto } from '../../dto/domain/custom-connector.dto';
import type { TestCustomConnectorCommand } from '../../dto/domain/test-custom-connector.command';
import { SourceCredentialUnavailableException } from '../../exceptions/source-credential-unavailable.exception';
import { allowedCredentialUpdates } from '../../services/connector/connector-credential-injector.service';
import {
  BUILDER_TEST_ROTATION_LEASE_WAIT_MS,
  ROTATION_LEASE_BUSY,
  SourceCredentialInjectorService,
} from '../../services/connector/source-credential-injector.service';
import { ConnectorTestService } from '../../services/connector/connector-test.service';

const ROTATED_TOKEN_NOT_STORED =
  'The test finished, but the token the provider rotated could not be saved to the Credential. ' +
  'If the next run fails to authenticate, reconnect the Credential.';
const ROTATION_LEASE_BUSY_IN_TEST =
  "Another run is refreshing this Credential's token. Try again in a minute.";

/** A builder test on typed values, or on a Credential's values merged server-side. */
@Injectable()
export class TestCustomConnectorService {
  private readonly logger = new Logger(TestCustomConnectorService.name);

  constructor(
    private readonly tests: ConnectorTestService,
    private readonly sourceCredentials: SourceCredentialBindingService,
    private readonly injector: SourceCredentialInjectorService,
    private readonly credentials: CredentialService
  ) {}

  async run({
    projectId,
    input,
    credential: caller,
  }: TestCustomConnectorCommand): Promise<CustomConnectorTestResultDto> {
    if (!caller) return this.tests.runTest({ ...input, projectId });

    const { credentialId, userId, roles } = caller;
    const { manifest, node, configuration } = input;
    // The runner gets only this node, so fit and misuse are judged on it, not its siblings.
    const runs = this.tests.pruneToNode(manifest, node);
    const model = customConnectorKeyModel(runs);
    const misuse = model.keyParameterMisuse;
    if (misuse.length > 0) {
      throw new BadRequestException(misuse.map(describeKeyParameterMisuse).join('; '));
    }
    const typed = Object.keys(configuration).filter(name => model.keyParameters.includes(name));
    if (typed.length > 0) {
      throw new BadRequestException(
        `Remove ${typed.join(', ')} from the configuration: the Credential provides the keys.`
      );
    }

    const connectorName = String(manifest.name ?? 'Custom');
    await this.sourceCredentials.checkConfigCredential({
      projectId,
      userId,
      roles,
      credentialId,
      connectorName,
      config: configuration,
      model,
    });
    const resolve = () => this.sourceCredentials.resolveCredential(projectId, credentialId);
    const { credential, leaseId } = await this.injector
      .leaseRotation(await resolve(), resolve, BUILDER_TEST_ROTATION_LEASE_WAIT_MS, () =>
        Object.hasOwn(model.parameters, Core.GENERATED_REFRESH_TOKEN_CONFIG_FIELD)
      )
      .catch((error: unknown) => {
        // The author can retry now; the run's copy talks about the next scheduled run.
        throw error instanceof SourceCredentialUnavailableException &&
          error.message === ROTATION_LEASE_BUSY
          ? new SourceCredentialUnavailableException(ROTATION_LEASE_BUSY_IN_TEST)
          : error;
      });
    try {
      const values = this.injector.testValues(connectorName, configuration, runs, credential);

      let rotated: Record<string, unknown> = {};
      const result = await this.tests.runTest({
        ...input,
        projectId,
        configuration: { ...configuration, ...values.parameters },
        credential: {
          keyParameters: values.keyParameters,
          values: values.values,
          onRotated: credentials => {
            rotated = { ...rotated, ...credentials };
          },
        },
      });
      const updates = allowedCredentialUpdates(rotated);
      if (
        Object.keys(updates).length > 0 &&
        !(await this.storeRotated(credentialId, projectId, updates, values.expected))
      ) {
        result.logs.push(ROTATED_TOKEN_NOT_STORED);
      }
      return result;
    } finally {
      // After the rotated token is stored, so a run that waited redeems the new one.
      if (leaseId) await this.credentials.releaseRotation(credentialId, leaseId);
    }
  }

  /** A system write, whoever ran the test. */
  private async storeRotated(
    credentialId: string,
    projectId: string,
    updates: Record<string, string>,
    expected: Readonly<Record<string, string | undefined>>
  ): Promise<boolean> {
    try {
      const { updated } = await this.credentials.updateSecretFields(
        credentialId,
        projectId,
        updates,
        expected
      );
      return updated;
    } catch (error) {
      this.logger.error(
        `Failed to store the token rotated in a test on Credential ${credentialId}: ${castError(error).message}`
      );
      return false;
    }
  }
}
