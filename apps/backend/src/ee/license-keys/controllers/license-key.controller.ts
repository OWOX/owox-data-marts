import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RejectApiKeyAuth, RejectPluginAuth } from '../../../idp/decorators';
import { AuthorizationContext, Role, Strategy } from '../../../idp/types';
import {
  CreateLicenseKeyRequestDto,
  CreateLicenseKeyResponseDto,
  LicenseKeyResponseDto,
  UpdateLicenseKeyRequestDto,
} from '../dto/license-key-api.dto';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyService } from '../services/license-key.service';
import { UserProjectionsFetcherService } from '../../../data-marts/services/user-projections-fetcher.service';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

@Controller('license-keys')
@ApiTags('License Keys')
@RejectApiKeyAuth()
@RejectPluginAuth()
export class LicenseKeyController {
  constructor(
    private readonly licenseKeyService: LicenseKeyService,
    private readonly userProjectionsFetcher: UserProjectionsFetcherService
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  async list(@AuthContext() context: AuthorizationContext): Promise<LicenseKeyResponseDto[]> {
    const keys = await this.licenseKeyService.list(context.projectId);
    const creators = await this.userProjectionsFetcher.fetchRelevantUserProjections(keys);
    return keys.map(key =>
      toResponse(key, key.createdById ? (creators.getByUserId(key.createdById) ?? null) : null)
    );
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Post()
  @HttpCode(201)
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateLicenseKeyRequestDto
  ): Promise<CreateLicenseKeyResponseDto> {
    const issued = await this.licenseKeyService.create({
      projectId: context.projectId,
      userId: context.userId,
      name: dto.name,
      origin: dto.origin,
    });
    return {
      ...toResponse(
        issued.record,
        await this.userProjectionsFetcher.fetchCreatedByUser(issued.record)
      ),
      licenseKey: issued.licenseKey,
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Patch(':licenseKeyId')
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('licenseKeyId') licenseKeyId: string,
    @Body() dto: UpdateLicenseKeyRequestDto
  ): Promise<LicenseKeyResponseDto> {
    const updated = await this.licenseKeyService.rename(context.projectId, licenseKeyId, dto.name);
    return toResponse(updated, await this.userProjectionsFetcher.fetchCreatedByUser(updated));
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete(':licenseKeyId')
  @HttpCode(204)
  async revoke(
    @AuthContext() context: AuthorizationContext,
    @Param('licenseKeyId') licenseKeyId: string
  ): Promise<void> {
    return this.licenseKeyService.revoke(context.projectId, licenseKeyId);
  }
}

function toResponse(
  record: LicenseKey,
  createdByUser: UserProjectionDto | null
): LicenseKeyResponseDto {
  return {
    licenseKeyId: record.licenseKeyId,
    name: record.name,
    origin: record.origin,
    expiresAt: record.expiresAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    createdByUser,
  };
}
