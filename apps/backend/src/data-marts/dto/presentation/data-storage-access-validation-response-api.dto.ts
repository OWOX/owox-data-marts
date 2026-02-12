import { ApiProperty } from '@nestjs/swagger';

export class DataStorageAccessValidationResponseApiDto {
  @ApiProperty()
  valid: boolean;

  @ApiProperty()
  errorMessage?: string;
}
