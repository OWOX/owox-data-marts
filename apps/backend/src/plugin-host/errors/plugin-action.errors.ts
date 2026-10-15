import { HttpStatus } from '@nestjs/common';
import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { PluginHostError } from './plugin-host.errors';

export interface ActionInputError {
  readonly instancePath: string;
  readonly message: string;
}

export class ActionNotDeclaredError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(action: string) {
    super(
      'ACTION_NOT_DECLARED',
      `Action "${action}" is not declared in the current version of this plugin`
    );
  }
}

export class ActionInputTooLargeError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.PAYLOAD_TOO_LARGE;

  constructor() {
    super(
      'INPUT_TOO_LARGE',
      `Action input is larger than ${PLUGIN_ACTION_LIMITS.maxInputBytes / 1024} KiB`
    );
  }
}

export class ActionInputInvalidError extends PluginHostError {
  readonly memberVisible = true;

  constructor(errors: readonly ActionInputError[]) {
    super('INVALID_INPUT', 'Action input does not match the action schema', { errors });
  }
}

export class TooManyExecutionsError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.TOO_MANY_REQUESTS;

  constructor(
    message = `This installation already has ${PLUGIN_ACTION_LIMITS.maxRunningPerInstallation} running executions`
  ) {
    super('TOO_MANY_EXECUTIONS', message);
  }
}

export class ExecutionTokenNotAllowedError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor(message = 'A backend action cannot start another action') {
    super('EXECUTION_TOKEN_NOT_ALLOWED', message);
  }
}

export class ExecutionTokenRequiredError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor() {
    super('EXECUTION_TOKEN_REQUIRED', 'Only a backend action can read its own execution');
  }
}

export class ExecutionNotFoundError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor() {
    super('EXECUTION_NOT_FOUND', 'Execution was not found');
  }
}

export class InstallationInactiveError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.FORBIDDEN;

  constructor() {
    super('INSTALLATION_INACTIVE', 'The plugin installation is no longer active');
  }
}
