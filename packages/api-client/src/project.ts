import { OWOXApiError } from './errors.js';

export type OWOXProjectSettings = {
  description: string | null;
};

export type OWOXProjectSetupStepState = {
  done: boolean;
  completedAt: string | null;
};

export type OWOXProjectSetupProgressSteps = {
  hasStorage: OWOXProjectSetupStepState;
  hasDraftDataMart: OWOXProjectSetupStepState;
  hasPublishedDataMart: OWOXProjectSetupStepState;
  hasDestination: OWOXProjectSetupStepState;
  hasReport: OWOXProjectSetupStepState;
  hasReportRun: OWOXProjectSetupStepState;
  hasTeammatesInvited: OWOXProjectSetupStepState;
  hasGoogleSheetsDestination: OWOXProjectSetupStepState;
  hasGoogleSheetsExtension: OWOXProjectSetupStepState;
  hasGoogleSheetsReportRun: OWOXProjectSetupStepState;
};

export type OWOXProjectSetupProgress = {
  version: number;
  stepsSchemaVersion: number;
  progress: number;
  steps: OWOXProjectSetupProgressSteps;
};

type ProjectRequester = {
  getJson<T>(path: string): Promise<T>;
  putJson<T>(path: string, jsonBody: unknown): Promise<T>;
};

const PROJECT_SETUP_STEP_KEYS = [
  'hasStorage',
  'hasDraftDataMart',
  'hasPublishedDataMart',
  'hasDestination',
  'hasReport',
  'hasReportRun',
  'hasTeammatesInvited',
  'hasGoogleSheetsDestination',
  'hasGoogleSheetsExtension',
  'hasGoogleSheetsReportRun',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProjectSetupStepState(value: unknown): value is OWOXProjectSetupStepState {
  return (
    isRecord(value) &&
    typeof value.done === 'boolean' &&
    (typeof value.completedAt === 'string' || value.completedAt === null)
  );
}

function parseProjectSettings(response: unknown): OWOXProjectSettings {
  if (
    !isRecord(response) ||
    !('description' in response) ||
    (typeof response.description !== 'string' && response.description !== null)
  ) {
    throw new OWOXApiError('OWOX Project Settings API returned an unexpected response shape', {
      details: response,
    });
  }

  return { description: response.description };
}

function parseProjectSetupProgress(response: unknown): OWOXProjectSetupProgress {
  if (
    !isRecord(response) ||
    typeof response.version !== 'number' ||
    !Number.isInteger(response.version) ||
    response.version < 1 ||
    typeof response.stepsSchemaVersion !== 'number' ||
    !Number.isInteger(response.stepsSchemaVersion) ||
    response.stepsSchemaVersion < 1 ||
    typeof response.progress !== 'number' ||
    !Number.isInteger(response.progress) ||
    response.progress < 0 ||
    response.progress > 100 ||
    !isRecord(response.steps)
  ) {
    throw new OWOXApiError(
      'OWOX Project Setup Progress API returned an unexpected response shape',
      { details: response }
    );
  }

  const steps = response.steps;
  if (
    !PROJECT_SETUP_STEP_KEYS.every(key => isProjectSetupStepState(steps[key])) ||
    !Object.values(steps).every(isProjectSetupStepState)
  ) {
    throw new OWOXApiError(
      'OWOX Project Setup Progress API returned an unexpected response shape',
      { details: response }
    );
  }

  return response as OWOXProjectSetupProgress;
}

export class ProjectApi {
  constructor(private readonly requester: ProjectRequester) {}

  async getSettings(): Promise<OWOXProjectSettings> {
    return parseProjectSettings(await this.requester.getJson<unknown>('/api/projects/settings'));
  }

  async getSetupProgress(): Promise<OWOXProjectSetupProgress> {
    return parseProjectSetupProgress(
      await this.requester.getJson<unknown>('/api/project-setup-progress')
    );
  }

  async updateDescription(description: string | null): Promise<OWOXProjectSettings> {
    return parseProjectSettings(
      await this.requester.putJson<unknown>('/api/projects/settings/description', { description })
    );
  }
}
