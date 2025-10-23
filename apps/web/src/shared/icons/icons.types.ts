import { type AwsAthenaIcon } from './aws-athena-icon';
import { type GoogleBigQueryIcon } from './google-bigquery-icon';
import { type GitHubIcon } from './github-icon';
import { type GoogleSheetsIcon } from './google-sheets-icon';
import { type ODataIcon } from './odata-icon';
import { type LookerStudioIcon } from './looker-studio-icon';
import { type SnowflakeIcon } from './snowflake-icon';
import { type DatabricksIcon } from './databricks-icon';
import { type AwsRedshiftIcon } from './aws-redshift-icon';
import { type AzureSynapseIcon } from './azure-synapse-icon';
import { type RawBase64Icon } from './raw-base64-icon';
import { type OWOXBIIcon } from './owox-bi-icon';
import { type SlackIcon } from './slack-icon';
import { type DataMartPlusIcon } from './data-mart-plus-icon';
import { type XAdsIcon } from './x-ads-icon';
import { type FacebookAdsIcon } from './facebook-ads-icon';
import { type LinkedInAdsIcon } from './linkedin-ads-icon';
import { type LucideIcon } from 'lucide-react';

export type LocalIcon =
  | typeof AwsAthenaIcon
  | typeof GoogleBigQueryIcon
  | typeof GitHubIcon
  | typeof GoogleSheetsIcon
  | typeof ODataIcon
  | typeof LookerStudioIcon
  | typeof SnowflakeIcon
  | typeof DatabricksIcon
  | typeof AwsRedshiftIcon
  | typeof AzureSynapseIcon
  | typeof OWOXBIIcon
  | typeof SlackIcon
  | typeof DataMartPlusIcon
  | typeof XAdsIcon
  | typeof FacebookAdsIcon
  | typeof LinkedInAdsIcon
  | typeof RawBase64Icon;
export type AppIcon = LucideIcon | LocalIcon;
