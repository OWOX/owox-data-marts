export interface GeneratedFieldMetadataDto {
  name: string;
  alias?: string;
  description?: string;
}

export interface GenerateDataMartMetadataResponseDto {
  title?: string;
  description?: string;
  fields?: GeneratedFieldMetadataDto[];
}
