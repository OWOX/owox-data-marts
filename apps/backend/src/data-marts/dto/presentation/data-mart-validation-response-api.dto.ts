import { ApiProperty } from '@nestjs/swagger';

export class DataMartValidationResponseApiDto {
  @ApiProperty()
  valid: boolean;

  @ApiProperty()
  errorMessage?: string;

  @ApiProperty()
  reason?: Record<string, unknown>;

  @ApiProperty()
  details?: Record<string, unknown>;
}
