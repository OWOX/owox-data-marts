import { ApiProperty } from '@nestjs/swagger';

export class RunInsightResponseApiDto {
  @ApiProperty({ example: 'run-uuid-5678-abcd-1234' })
  runId: string;
}
