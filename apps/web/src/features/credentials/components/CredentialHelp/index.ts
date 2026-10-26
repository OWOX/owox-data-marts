import type { ComponentType } from 'react';
import type { CredentialCategory } from '../../types';
import AwsAccessKeyIdDescription from './AwsAccessKeyIdDescription';
import AwsSecretAccessKeyDescription from './AwsSecretAccessKeyDescription';
import DatabricksTokenDescription from './DatabricksTokenDescription';
import GoogleBigQueryOAuthDescription from './GoogleBigQueryOAuthDescription';
import GoogleProviderChoiceDescription from './GoogleProviderChoiceDescription';
import GoogleServiceAccountDescription from './GoogleServiceAccountDescription';
import SnowflakeKeyPairDescription from './SnowflakeKeyPairDescription';
import SnowflakePassphraseDescription from './SnowflakePassphraseDescription';
import SnowflakePasswordDescription from './SnowflakePasswordDescription';
import SnowflakeProviderChoiceDescription from './SnowflakeProviderChoiceDescription';
import SnowflakeUsernameDescription from './SnowflakeUsernameDescription';

export { HelpLabel } from './HelpLabel';

export interface CredentialFieldHelp {
  tooltip?: string;
  placeholder?: string;
  Description?: ComponentType;
}

const AWS_SESSION_TOKEN_HELP =
  'Needed only for temporary credentials, whose Access Key ID starts with ASIA';

const SNOWFLAKE_USERNAME: CredentialFieldHelp = {
  tooltip: 'Your Snowflake username',
  placeholder: 'Enter username',
  Description: SnowflakeUsernameDescription,
};

// Keyed by definition id, then by field key: `secret` for a single-secret definition, `account` for OAuth.
const FIELD_HELP: Partial<Record<string, Partial<Record<string, CredentialFieldHelp>>>> = {
  'aws-access-key': {
    accessKeyId: {
      tooltip: 'Your AWS Access Key ID used for authentication',
      placeholder: 'Enter an access key id',
      Description: AwsAccessKeyIdDescription,
    },
    secretAccessKey: {
      tooltip: 'Your AWS Secret Access Key used for authentication',
      placeholder: 'Enter a secret access key',
      Description: AwsSecretAccessKeyDescription,
    },
    sessionToken: {
      tooltip: AWS_SESSION_TOKEN_HELP,
      placeholder: 'Enter a session token',
      Description: () => `${AWS_SESSION_TOKEN_HELP}.`,
    },
  },
  'snowflake-password': {
    username: SNOWFLAKE_USERNAME,
    password: {
      tooltip: 'Your Snowflake password or PAT (Programmatic access token)',
      placeholder: 'Enter password or PAT',
      Description: SnowflakePasswordDescription,
    },
  },
  'snowflake-key-pair': {
    username: SNOWFLAKE_USERNAME,
    privateKey: {
      tooltip: 'Paste your private key in PEM format',
      placeholder: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
      Description: SnowflakeKeyPairDescription,
    },
    privateKeyPassphrase: {
      tooltip: 'Enter the passphrase if your private key is encrypted',
      placeholder: 'Enter passphrase if key is encrypted',
      Description: SnowflakePassphraseDescription,
    },
  },
  'databricks-token': {
    token: {
      tooltip: 'Your Databricks Personal Access Token',
      placeholder: 'Enter your token',
      Description: DatabricksTokenDescription,
    },
  },
  'google-service-account': {
    secret: {
      tooltip: 'Paste the JSON key of the service account this Credential uses',
      Description: GoogleServiceAccountDescription,
    },
  },
  'google-oauth': {
    account: {
      tooltip: 'Authorize OWOX to access your BigQuery datasets',
      Description: GoogleBigQueryOAuthDescription,
    },
  },
};

const PROVIDER_CHOICE_HELP: Partial<Record<CredentialCategory, CredentialFieldHelp>> = {
  google: { Description: GoogleProviderChoiceDescription },
  snowflake: { Description: SnowflakeProviderChoiceDescription },
};

export function credentialFieldHelp(
  definitionId: string | undefined,
  key: string
): CredentialFieldHelp | undefined {
  return definitionId ? FIELD_HELP[definitionId]?.[key] : undefined;
}

export function providerChoiceHelp(
  category: CredentialCategory | undefined
): CredentialFieldHelp | undefined {
  return category && PROVIDER_CHOICE_HELP[category];
}
