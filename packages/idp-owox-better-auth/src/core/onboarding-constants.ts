/** Threshold for "recently created" user (1 day in ms). */
export const USER_AGE_THRESHOLD_MS = 1 * 24 * 60 * 60 * 1000;

/** Question identifiers for onboarding questionnaire. */
export const ONBOARDING_QUESTION = {
  USE_CASE: 'use_case',
  ORG_DOMAIN: 'org_domain',
  PRIMARY_ROLE: 'primary_role',
  PRIMARY_STORAGE: 'primary_storage',
} as const;

export type OnboardingQuestionId = (typeof ONBOARDING_QUESTION)[keyof typeof ONBOARDING_QUESTION];

/** Answer values for "What are you planning to use OWOX for?" (multi-select). */
export const USE_CASE_ANSWER = {
  SYNC_DWH_SHEETS: 'sync_dwh_sheets',
  SYNC_DWH_LOOKER: 'sync_dwh_looker',
  AI_INSIGHTS: 'ai_insights',
  IMPORT_EXTERNAL_DWH: 'import_external_dwh',
  IMPORT_EXTERNAL_SHEETS: 'import_external_sheets',
  OTHER: 'other',
} as const;

/** Answer values for "What is your primary role?" (single-select). */
export const PRIMARY_ROLE_ANSWER = {
  DATA_ANALYST_ENGINEER: 'data_analyst_engineer',
  DIGITAL_MARKETER: 'digital_marketer',
  HEAD_OF_ANALYTICS: 'head_of_analytics',
  C_LEVEL: 'c_level',
  OTHER: 'other',
} as const;

/** Answer values for "Your primary Storage" (single-select). */
export const PRIMARY_STORAGE_ANSWER = {
  GBQ: 'gbq',
  AWS_ATHENA: 'aws_athena',
  AWS_REDSHIFT: 'aws_redshift',
  SNOWFLAKE: 'snowflake',
  DATABRICKS: 'databricks',
  DONT_KNOW: 'dont_know',
  OTHER: 'other',
} as const;

/** Validation sets for server-side answer checking. */
export const VALID_USE_CASE_VALUES = new Set(Object.values(USE_CASE_ANSWER));
export const VALID_PRIMARY_ROLE_VALUES = new Set(Object.values(PRIMARY_ROLE_ANSWER));
export const VALID_PRIMARY_STORAGE_VALUES = new Set(Object.values(PRIMARY_STORAGE_ANSWER));
