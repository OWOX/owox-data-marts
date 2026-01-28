import { ApiProperty } from '@nestjs/swagger';

export class ReceiverInfoApiDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  displayName?: string;

  @ApiProperty({ required: false })
  avatarUrl?: string;

  @ApiProperty()
  hasNotificationsEnabled: boolean;
}
