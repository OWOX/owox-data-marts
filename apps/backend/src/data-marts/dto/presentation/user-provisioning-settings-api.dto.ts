import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import type { UserProvisioningMode } from '../domain/user-provisioning-settings.dto';

const USER_PROVISIONING_MODES: readonly UserProvisioningMode[] = ['automatic', 'manual'];

export class UpdateUserProvisioningSettingsRequestApiDto {
  @ApiProperty({ enum: USER_PROVISIONING_MODES })
  @IsIn(USER_PROVISIONING_MODES)
  mode: UserProvisioningMode;

  @ApiProperty({ enum: ProjectRole })
  @IsEnum(ProjectRole)
  defaultRole: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  @IsEnum(RoleScope)
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds: string[];
}

export class UserProvisioningOrganizationApiDto {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  mainProjectId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  mainProjectTitle?: string | null;
}

export class UserProvisioningSettingsValueApiDto {
  @ApiProperty({ enum: USER_PROVISIONING_MODES })
  mode: UserProvisioningMode;

  @ApiProperty({ enum: ProjectRole })
  defaultRole: ProjectRole;

  @ApiProperty({ enum: RoleScope })
  roleScope: RoleScope;

  @ApiProperty({ type: [String] })
  contextIds: string[];
}

export class UserProvisioningSettingsResponseApiDto {
  @ApiProperty()
  isApplicable: boolean;

  @ApiPropertyOptional({ type: UserProvisioningOrganizationApiDto, nullable: true })
  organization: UserProvisioningOrganizationApiDto | null;

  @ApiPropertyOptional({ type: UserProvisioningSettingsValueApiDto, nullable: true })
  settings: UserProvisioningSettingsValueApiDto | null;
}
