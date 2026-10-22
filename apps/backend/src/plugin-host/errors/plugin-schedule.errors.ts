import { HttpStatus } from '@nestjs/common';
import type { ActionInputError } from './plugin-action.errors';
import { PluginHostError } from './plugin-host.errors';

export class InvalidScheduleError extends PluginHostError {
  readonly memberVisible = true;

  constructor(message: string) {
    super('INVALID_SCHEDULE', message);
  }
}

export class ScheduleParametersInvalidError extends PluginHostError {
  readonly memberVisible = true;

  constructor(errors: readonly ActionInputError[]) {
    super('INVALID_PARAMETERS', 'Schedule parameters do not match the action schema', { errors });
  }
}

export class ScheduleParametersTooLargeError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.PAYLOAD_TOO_LARGE;

  constructor(maxBytes: number) {
    super('PARAMETERS_TOO_LARGE', `Schedule parameters are larger than ${maxBytes / 1024} KiB`);
  }
}

export class TooManySchedulesError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(max: number) {
    super('TOO_MANY_SCHEDULES', `This installation already has ${max} schedules`);
  }
}

export class ScheduleBusyError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super('SCHEDULE_BUSY', 'The schedule is being run. Try again shortly.');
  }
}

export class SchedulePausedByAdminError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super(
      'SCHEDULE_PAUSED_BY_ADMIN',
      'A project admin paused this schedule. Resume it in Plugins → Schedules.'
    );
  }
}

export class ScheduleOwnerNotMemberError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor() {
    super(
      'OWNER_NOT_MEMBER',
      'The installation owner is no longer a project member, or their account is locked'
    );
  }
}

export class ScheduleOwnerCheckUnavailableError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.SERVICE_UNAVAILABLE;

  constructor() {
    super('OWNER_CHECK_UNAVAILABLE', 'Could not check the installation owner. Try again shortly.');
  }
}

export class ScheduleNotFoundError extends PluginHostError {
  readonly memberVisible = true;
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor() {
    super('SCHEDULE_NOT_FOUND', 'Schedule was not found');
  }
}
