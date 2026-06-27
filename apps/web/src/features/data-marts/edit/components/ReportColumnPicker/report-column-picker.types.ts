import type { BlendedField } from '../../../shared/types/relationship.types';

export interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  description?: string;
  isHiddenForReporting?: boolean;
  status?: string;
  fields?: NativeField[];
}

export interface BlendedGroup {
  aliasPath: string;
  title: string;
  alias: string;
  description?: string;
  isAccessibleForReporting: boolean;
  visibleFields: BlendedField[];
  selectedCount: number;
}
