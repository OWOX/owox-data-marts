import { ApiProperty } from '@nestjs/swagger';
import { InsightTemplateSourceDetailsApiDto } from './insight-template-source-details-api.dto';

export class InsightTemplateSourceListResponseApiDto {
  @ApiProperty({ type: [InsightTemplateSourceDetailsApiDto] })
  data: InsightTemplateSourceDetailsApiDto[];
}
