import { ApiProperty } from '@nestjs/swagger';

export class ProjectMemberApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  displayName?: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  hasNotificationsEnabled: boolean;
}
