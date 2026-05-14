import { ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratedFieldMetadataApiDto {
  @ApiPropertyOptional({ description: 'Exact field name as in the data mart schema' })
  name: string;

  @ApiPropertyOptional({ description: 'Business-friendly display name' })
  alias?: string;

  @ApiPropertyOptional({ description: 'Business-friendly description, one sentence' })
  description?: string;
}

export class GenerateDataMartMetadataResponseApiDto {
  @ApiPropertyOptional({ description: 'Suggested data mart title' })
  title?: string;

  @ApiPropertyOptional({ description: 'Suggested data mart description' })
  description?: string;

  @ApiPropertyOptional({
    type: () => [GeneratedFieldMetadataApiDto],
    description: 'Per-field suggestions',
  })
  fields?: GeneratedFieldMetadataApiDto[];
}
