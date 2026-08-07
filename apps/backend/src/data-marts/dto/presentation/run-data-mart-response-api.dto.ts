import { ApiProperty } from '@nestjs/swagger';

export class RunDataMartResponseApiDto {
  @ApiProperty({
    format: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Identifier of the newly created Data Mart run.',
  })
  runId: string;
}
