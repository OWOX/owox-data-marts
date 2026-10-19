import { ApiProperty } from '@nestjs/swagger';

export class ProjectSettingsResponseApiDto {
  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  revision: number;
}
