import { Injectable } from '@nestjs/common';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import type { StartedPluginActionExecution } from '../dto/domain/plugin-action-execution.dto';
import type { PluginInstallation } from '../entities/plugin-installation.entity';
import type { PluginVersion } from '../entities/plugin-version.entity';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../enums/plugin-action-execution-status.enum';
import {
  ActionInputInvalidError,
  ActionInputTooLargeError,
  ActionNotDeclaredError,
} from '../errors/plugin-action.errors';
import { createExecutionToken } from '../utils/execution-token.util';
import { findJsonShapeProblem } from '../utils/json-shape.util';
import { resolveBackendUrl } from '../utils/plugin-manifest.util';
import { ActionInputValidatorService } from './action-input-validator.service';
import { PluginActionDispatcherService } from './plugin-action-dispatcher.service';
import { PluginActionExecutionService } from './plugin-action-execution.service';

export interface PluginActionStart {
  readonly installation: Pick<PluginInstallation, 'id' | 'projectId' | 'userId'>;
  readonly version: PluginVersion;
  readonly action: string;
  /** Undefined is stored as null. */
  readonly input: unknown;
  /** The role the backend acts with, stored on the execution. */
  readonly role: string;
  readonly trigger: PluginActionTrigger;
}

/** Validation, insert and dispatch of an action start; callers resolve who starts it. */
@Injectable()
export class PluginActionStarterService {
  constructor(
    private readonly validator: ActionInputValidatorService,
    private readonly executions: PluginActionExecutionService,
    private readonly dispatcher: PluginActionDispatcherService
  ) {}

  /** Answers once the execution is recorded: the outcome is read from the execution. */
  async start(request: PluginActionStart): Promise<StartedPluginActionExecution> {
    const { installation, version, action } = request;
    // An own property only: `constructor` must not resolve through Object.prototype.
    if (!version.backend || !Object.hasOwn(version.backend.actions, action)) {
      throw new ActionNotDeclaredError(action);
    }
    const declaration = version.backend.actions[action];

    const input = request.input ?? null;
    // First, so that measuring and storing never see deeper nesting.
    const shapeProblem = findJsonShapeProblem(input);
    if (shapeProblem) {
      throw new ActionInputInvalidError([{ instancePath: '', message: shapeProblem }]);
    }
    // A null input is stored as NULL, 0 bytes.
    const inputBytes = input === null ? 0 : Buffer.byteLength(JSON.stringify(input));
    if (inputBytes > PLUGIN_ACTION_LIMITS.maxInputBytes) {
      throw new ActionInputTooLargeError();
    }
    // Unlocked and early, so a refused start never uses a validation worker; insertRunning decides under its lock.
    await this.executions.assertWithinStartLimits(installation.id, Date.now());
    if (declaration.input) {
      const errors = await this.validator.validate(version.id, action, declaration.input, input);
      if (errors.length > 0) {
        throw new ActionInputInvalidError(errors);
      }
    }

    const backendUrl = resolveBackendUrl(version.backend, version.deliveryUrl);
    const { token, tokenHash } = createExecutionToken();
    // Outside a transaction: insertRunning's lock must be the first statement of its own.
    const execution = await this.executions.insertRunning({
      pluginId: version.pluginId,
      pluginVersionId: version.id,
      installationId: installation.id,
      projectId: installation.projectId,
      userId: installation.userId,
      action,
      input,
      inputBytes,
      role: request.role,
      timeoutSeconds: declaration.timeoutSeconds,
      tokenHash,
      trigger: request.trigger,
    });

    // Not awaited: dispatch never rejects and records every outcome on the row itself.
    void this.dispatcher.dispatch(execution, backendUrl, token, declaration.timeoutSeconds);

    return { id: execution.id, status: PluginActionExecutionStatus.RUNNING };
  }
}
