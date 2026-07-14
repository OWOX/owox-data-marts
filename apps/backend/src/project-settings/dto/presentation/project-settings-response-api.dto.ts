import { ApiProperty } from '@nestjs/swagger';

export class ProjectSettingsResponseApiDto {
  @ApiProperty({ nullable: true })
  description: string | null;
}
