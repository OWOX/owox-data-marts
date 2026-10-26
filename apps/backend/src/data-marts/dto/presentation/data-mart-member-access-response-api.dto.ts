import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataMartAccessReason } from '../../services/access-decision';
import { RoleScope } from '../../enums/role-scope.enum';

export class DataMartMemberAccessContextApiDto {
  @ApiProperty({ example: 'f1b2c3d4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'Paid ads' })
  name: string;
}

export class DataMartAccessLevelApiDto {
  @ApiProperty({ example: false })
  granted: boolean;

  @ApiProperty({
    enum: DataMartAccessReason,
    example: DataMartAccessReason.NO_SHARED_CONTEXT,
    description: 'The rule that decides this level for the member',
  })
  reason: DataMartAccessReason;
}

export class DataMartMemberAccessItemApiDto {
  @ApiProperty({ example: 'user-123' })
  userId: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiProperty({ enum: ['admin', 'editor', 'viewer'], example: 'viewer' })
  role: string;

  @ApiProperty({ enum: RoleScope, example: RoleScope.SELECTED_CONTEXTS })
  roleScope: RoleScope;

  @ApiProperty({
    type: [DataMartMemberAccessContextApiDto],
    description:
      "The member's contexts. They limit access only when roleScope is selected_contexts",
  })
  contexts: DataMartMemberAccessContextApiDto[];

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description: 'See the DataMart in the catalog and through MCP, and build reports on it',
  })
  use: DataMartAccessLevelApiDto;

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description: 'Edit and delete the DataMart, and manage its triggers',
  })
  maintain: DataMartAccessLevelApiDto;

  @ApiProperty({
    type: DataMartAccessLevelApiDto,
    description: "Change the DataMart's sharing and owners",
  })
  manageAccess: DataMartAccessLevelApiDto;
}

export class DataMartMemberAccessResponseApiDto {
  @ApiProperty({ type: [DataMartMemberAccessItemApiDto] })
  members: DataMartMemberAccessItemApiDto[];
}
