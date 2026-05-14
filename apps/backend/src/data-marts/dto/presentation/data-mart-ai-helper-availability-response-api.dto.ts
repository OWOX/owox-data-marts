import { ApiProperty } from '@nestjs/swagger';

export class DataMartAiHelperAvailabilityResponseApiDto {
  @ApiProperty({
    description:
      'Whether AI-powered metadata generation is configured on this deployment. ' +
      'When false, frontend SHOULD hide the AI-helper buttons.',
  })
  enabled: boolean;
}
