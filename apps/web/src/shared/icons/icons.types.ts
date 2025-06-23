import { type AwsAthenaIcon } from './aws-athena-icon';
import { type GoogleBigQueryIcon } from './google-bigquery-icon';
import { type GitHubIcon } from './github-icon';
import { type LucideIcon } from 'lucide-react';

export type LocalIcon = typeof AwsAthenaIcon | typeof GoogleBigQueryIcon | typeof GitHubIcon;
export type AppIcon = LucideIcon | LocalIcon;
