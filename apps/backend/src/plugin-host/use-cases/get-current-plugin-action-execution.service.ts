import { Inject, Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import {
  CREDENTIAL_CONSUMER_BINDING_FACADE,
  isExpectedUnusableCredentialError,
  type CredentialConsumerBindingFacade,
} from '../../data-marts/credentials/facades/credential-consumer-binding.facade';
import { normalizeCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { GetCurrentPluginActionExecutionCommand } from '../dto/domain/plugin-action-execution.command';
import type { PluginActionWorkerContext } from '../dto/domain/plugin-action-execution.dto';
import {
  ExecutionNotFoundError,
  ExecutionTokenRequiredError,
} from '../errors/plugin-action.errors';
import { PluginActionExecutionService } from '../services/plugin-action-execution.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { toCredentialHandles } from '../utils/credential-handles.util';

/** Credentials come from the plugin's current release, as frontend calls get them. */
@Injectable()
export class GetCurrentPluginActionExecutionService {
  private readonly logger = new Logger(GetCurrentPluginActionExecutionService.name);

  constructor(
    private readonly executions: PluginActionExecutionService,
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService,
    @Inject(CREDENTIAL_CONSUMER_BINDING_FACADE)
    private readonly credentialBindings: CredentialConsumerBindingFacade
  ) {}

  async run(command: GetCurrentPluginActionExecutionCommand): Promise<PluginActionWorkerContext> {
    const { context } = command;
    if (!context.executionId) {
      throw new ExecutionTokenRequiredError();
    }

    const execution = await this.executions.findWithInput(context.executionId);
    if (!execution?.deadlineAt || execution.installationId !== context.installationId) {
      throw new ExecutionNotFoundError();
    }

    const plugin = await this.plugins.findById(execution.pluginId);
    const current = plugin?.currentVersionId
      ? await this.versions.findById(plugin.currentVersionId)
      : null;
    const started =
      current?.id === execution.pluginVersionId
        ? current
        : await this.versions.findById(execution.pluginVersionId);
    if (!plugin || !current || !started) {
      throw new ExecutionNotFoundError();
    }

    const consumer = {
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles ?? [],
      consumerType: 'plugin-installation' as const,
      consumerId: execution.installationId,
    };
    const requirements = current.credentialRequirements ?? [];
    const isExact = (requirement: (typeof requirements)[number]) =>
      normalizeCredentialRequirement(requirement).definitionId !== null;
    const ready = await this.credentialBindings.assertConsumerReady({
      ...consumer,
      requirements: requirements.filter(isExact),
    });
    // AI Credentials never deny a backend its context: an unusable one is only left out. An SDK
    // without AI support would get handles that only fail, so it gets none.
    const readyAi = command.aiCredentials
      ? await Promise.all(
          requirements
            .filter(requirement => !isExact(requirement))
            .map(requirement =>
              this.credentialBindings
                .assertConsumerReady({ ...consumer, requirements: [requirement] })
                .catch((error: unknown) => {
                  if (!isExpectedUnusableCredentialError(error)) throw error;
                  // The plugin sees only a missing handle; the reason stays here.
                  this.logger.warn(
                    `AI Credential ${normalizeCredentialRequirement(requirement).key} left out of execution ${execution.id}: ${castError(error).message}`
                  );
                  return [];
                })
            )
        )
      : [];

    return {
      executionId: execution.id,
      action: execution.action,
      input: execution.input,
      trigger: execution.trigger,
      scheduleId: execution.scheduleId,
      deadlineAt: execution.deadlineAt,
      plugin: { id: plugin.id, repositoryId: plugin.githubRepoId },
      pluginVersion: started.semver,
      installationId: execution.installationId,
      projectId: execution.projectId,
      userId: execution.userId,
      credentialHandles: toCredentialHandles([...ready, ...readyAi.flat()]),
    };
  }
}
