import { InviteTeammatesCard } from '../../../shared/components/InviteTeammatesCard';
import type { User } from '../../../features/idp/types';
import {
  GroupId,
  ProgressKey,
  SetupStepId,
  StepActionType,
  type SetupGroup,
  type SetupStep,
} from './types';

// Onboarding constants (mirrored from packages/idp-owox-better-auth/src/core/onboarding-constants.ts)
const ONBOARDING_QUESTION = {
  USE_CASE: 'use_case',
} as const;

const USE_CASE_ANSWER = {
  SYNC_DWH_SHEETS: 'sync_dwh_sheets',
  IMPORT_EXTERNAL_SHEETS: 'import_external_sheets',
} as const;

const SHEETS_USE_CASES = [USE_CASE_ANSWER.SYNC_DWH_SHEETS, USE_CASE_ANSWER.IMPORT_EXTERNAL_SHEETS];

/**
 * Check if user has selected Google Sheets related use cases during onboarding
 */
function hasSheetsUseCase(user: User | null): boolean {
  if (!user?.onboarding?.length) return false;
  const useCaseAnswer = user.onboarding.find(a => a.questionId === ONBOARDING_QUESTION.USE_CASE);
  if (!useCaseAnswer) return false;
  const answerValue = useCaseAnswer.answerValue;
  if (Array.isArray(answerValue)) {
    return answerValue.some(uc =>
      SHEETS_USE_CASES.includes(uc as (typeof SHEETS_USE_CASES)[number])
    );
  }
  return SHEETS_USE_CASES.includes(answerValue as (typeof SHEETS_USE_CASES)[number]);
}

const ROUTES = {
  DATA_MARTS: '/data-marts',
  CREATE_DATA_MART: '/data-marts/create',
  DATA_STORAGES: '/data-storages',
  DESTINATIONS: '/data-destinations',
} as const;

export const SETUP_STEPS: SetupStep[] = [
  {
    id: SetupStepId.CREATE_STORAGE,
    stepTitle: 'Create storage',
    stepDescription:
      'Storage is a connection to your data warehouse (BigQuery, Snowflake, etc.). It is required to create and run Data Marts.',
    successMessage: 'Storage created',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DATA_STORAGES,
      label: 'Create storage',
    },
    progressKey: ProgressKey.HAS_STORAGE,
  },
  {
    id: SetupStepId.CREATE_DATA_MART,
    stepTitle: 'Create draft Data Mart',
    stepDescription: 'A Data Mart defines what data to collect or transform.',
    successMessage: 'Draft Data Mart created',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.CREATE_DATA_MART,
      label: 'Create draft Data Mart',
    },
    progressKey: ProgressKey.HAS_DRAFT_DATA_MART,
  },
  {
    id: SetupStepId.PUBLISH_DATA_MART,
    stepTitle: 'Publish Data Mart',
    stepDescription: 'Publishing a Data Mart makes it available for Reports and Triggers.',
    successMessage: 'Data Mart published',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DATA_MARTS,
      label: 'Choose Data Mart and publish',
    },
    progressKey: ProgressKey.HAS_PUBLISHED_DATA_MART,
  },
  {
    id: SetupStepId.CREATE_DESTINATION,
    stepTitle: 'Create first destination',
    stepDescription:
      'Destinations are where your reports are delivered — Google Sheets, Data Studio, Email, and more.',
    successMessage: 'Destination created',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DESTINATIONS,
      label: 'Create destination',
    },
    progressKey: ProgressKey.HAS_DESTINATION,
  },
  {
    id: SetupStepId.CREATE_REPORT,
    stepTitle: 'Create report',
    stepDescription:
      'Open the Data Mart page, go to the Destinations tab and create a report for existing destination.',
    successMessage: 'Report created',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DATA_MARTS,
      label: 'Choose Data Mart and create report',
    },
    progressKey: ProgressKey.HAS_REPORT,
  },
  {
    id: SetupStepId.REPORT_RUN,
    stepTitle: 'Run your report',
    stepDescription: 'Run your report at least once to generate results.',
    successMessage: 'Report run successfully',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DATA_MARTS,
      label: 'Choose Data Mart and run',
    },
    progressKey: ProgressKey.HAS_REPORT_RUN,
  },
  {
    id: SetupStepId.INVITE_TEAMMATES,
    stepTitle: 'Invite teammates',
    stepDescription: 'Invite your teammates to collaborate in OWOX.',
    successMessage: 'Teammates invited',
    action: {
      type: StepActionType.COMPONENT,
      render: ({ onClick }) => <InviteTeammatesCard variant='button' onClick={onClick} />,
    },
    progressKey: ProgressKey.HAS_TEAMMATES_INVITED,
  },
  {
    id: SetupStepId.CREATE_GOOGLE_SHEETS_DESTINATION,
    stepTitle: 'Create Destination - Google Sheets',
    stepDescription: 'Create a destination to deliver reports to Google Sheets.',
    successMessage: 'Google Sheets destination created',
    action: {
      type: StepActionType.LINK,
      href: ROUTES.DESTINATIONS,
      label: 'Create Google Sheets destination',
    },
    progressKey: ProgressKey.HAS_GOOGLE_SHEETS_DESTINATION,
  },
  {
    id: SetupStepId.INSTALL_GOOGLE_SHEETS_EXTENSION,
    stepTitle: 'Install Google Sheets Extension',
    stepDescription:
      'Install the OWOX Data Marts extension from Google Workspace Marketplace to run reports directly in Sheets.',
    successMessage: 'Extension installed',
    action: {
      type: StepActionType.LINK,
      href: 'https://workspace.google.com/marketplace/app/owox_data_marts/94902851409',
      label: 'Install extension',
      openInNewTab: true,
    },
    progressKey: ProgressKey.HAS_GOOGLE_SHEETS_EXTENSION,
  },
  {
    id: SetupStepId.CREATE_RUN_REPORT_FROM_EXTENSION,
    stepTitle: 'Create & Run Report from Extension',
    stepDescription:
      'Open Google Sheets, launch the extension sidebar, create a report, and run it to see your data.',
    successMessage: 'Report created and run from extension',
    action: {
      type: StepActionType.LINK,
      href: 'https://sheets.new',
      label: 'Go to Google Sheets',
      openInNewTab: true,
    },
    progressKey: ProgressKey.HAS_GOOGLE_SHEETS_REPORT_RUN,
  },
];

export const SETUP_GROUPS: SetupGroup[] = [
  {
    id: GroupId.STORAGE,
    title: 'Create first storage',
    description: 'Connect your data warehouse to start working with OWOX.',
    stepIds: [SetupStepId.CREATE_STORAGE],
  },
  {
    id: GroupId.PUBLISH,
    title: 'Publish first Data Mart',
    description: 'Set up storage credentials, create, and publish your first Data Mart.',
    stepIds: [SetupStepId.CREATE_DATA_MART, SetupStepId.PUBLISH_DATA_MART],
  },
  {
    id: GroupId.REPORT,
    title: 'Get data to your report',
    description: 'Create a destination, report, and run it to get results.',
    stepIds: [SetupStepId.CREATE_DESTINATION, SetupStepId.CREATE_REPORT, SetupStepId.REPORT_RUN],
    isConditional: true,
    showCondition: (user: User | null) => !hasSheetsUseCase(user),
  },
  {
    id: GroupId.ENABLE_GOOGLE_SHEETS,
    title: 'Enable Google Sheets',
    description: 'Let your team build reports and add columns in Google Sheets without SQL.',
    stepIds: [
      SetupStepId.CREATE_GOOGLE_SHEETS_DESTINATION,
      SetupStepId.INSTALL_GOOGLE_SHEETS_EXTENSION,
      SetupStepId.CREATE_RUN_REPORT_FROM_EXTENSION,
    ],
    isConditional: true,
    showCondition: (user: User | null) => hasSheetsUseCase(user),
  },
  {
    id: GroupId.INVITE_TEAMMATES,
    title: 'Invite teammates',
    description: 'Invite your teammates to collaborate in OWOX.',
    stepIds: [SetupStepId.INVITE_TEAMMATES],
  },
];
