import { ApiProperty } from '@nestjs/swagger';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { MemberPluginScheduleApiDto } from './plugin-schedule-api.dto';

export class ProjectPluginScheduleApiDto extends MemberPluginScheduleApiDto {
  @ApiProperty() pluginId: string;
  @ApiProperty({ description: "The current version's display name." }) pluginName: string;
  @ApiProperty() installationId: string;

  @ApiProperty({ enum: ['installed', 'uninstalled'] })
  installationState: 'installed' | 'uninstalled';

  @ApiProperty({ type: UserProjectionDto, nullable: true }) owner: UserProjectionDto | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description:
      'False while the owner is not an active project member: the schedule skips its runs. Null when the check failed.',
  })
  ownerIsMember: boolean | null;

  @ApiProperty({ description: 'True for the installation owner and for a project admin.' })
  canManage: boolean;
}

export class ProjectPluginScheduleListApiDto {
  @ApiProperty({ type: [ProjectPluginScheduleApiDto] }) items: ProjectPluginScheduleApiDto[];
  @ApiProperty() total: number;
}
