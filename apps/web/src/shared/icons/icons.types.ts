import { type AwsAthenaIcon } from './aws-athena-icon';
import { type GoogleBigQueryIcon } from './google-bigquery-icon';
import { type GitHubIcon } from './github-icon';
import { type GoogleSheetsIcon } from './google-sheets-icon';
import { type LucideIcon } from 'lucide-react';

export type LocalIcon =
  | typeof AwsAthenaIcon
  | typeof GoogleBigQueryIcon
  | typeof GitHubIcon
  | typeof GoogleSheetsIcon;
export type AppIcon = LucideIcon | LocalIcon;
