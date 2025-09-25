import type { RunType } from '../../enums/run-type.enum';

export interface ConnectorListItem {
  name: string;
  displayName: string;
  description: string;
  logoBase64: string | null;
  docUrl: string | null;
}

export interface ConnectorRunFormData {
  runType: RunType;
  data: Record<string, string | number | boolean | undefined>;
}
