import type { DataMartMetadataScope } from '../shared/data-mart-metadata-scope.enum';

export interface GenerateDataMartMetadataRequestDto {
  scope: DataMartMetadataScope;
  useSample: boolean;
  fieldName?: string;
}
