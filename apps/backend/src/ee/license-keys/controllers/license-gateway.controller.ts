import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CanPerformOperationsResponseDto } from '../../../data-marts/dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto } from '../../../data-marts/dto/domain/project-balance.dto';
import { InternalProjectBillingService } from '../../../data-marts/services/project-billing/internal-project-billing.service';
import { LicenseConsumptionRequestDto } from '../dto/license-key-api.dto';
import { LicensedRequest, LicenseKeyGuard } from '../guards/license-key.guard';

@Controller('license')
@ApiExcludeController()
@UseGuards(LicenseKeyGuard)
export class LicenseGatewayController {
  constructor(private readonly projectBillingService: InternalProjectBillingService) {
    if (!projectBillingService.isBalanceConfigured()) {
      throw new Error(
        'LICENSE_ISSUANCE_ENABLED requires the balance integration. Set BALANCE_ENDPOINT_BASE_URL, ' +
          'BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT and BALANCE_ENDPOINT_TARGET_AUDIENCE.'
      );
    }
    projectBillingService.assertForwardedConsumptionConfigured();
  }

  @Post('can-perform')
  @HttpCode(200)
  async canPerform(@Req() request: LicensedRequest): Promise<CanPerformOperationsResponseDto> {
    return this.projectBillingService.canPerformOperations(request.licenseKey!.projectId);
  }

  @Post('consumption')
  @HttpCode(202)
  async consumption(
    @Req() request: LicensedRequest,
    @Body() dto: LicenseConsumptionRequestDto
  ): Promise<void> {
    const license = request.licenseKey!;
    await this.projectBillingService.publishForwardedConsumption(dto.kind, dto.payload, {
      projectId: license.projectId,
      licenseKeyId: license.licenseKeyId,
      title: license.name,
      origin: license.origin,
    });
  }

  @Post('balance')
  @HttpCode(200)
  async balance(@Req() request: LicensedRequest): Promise<ProjectBalanceDto> {
    return this.projectBillingService.getBalance(request.licenseKey!.projectId);
  }
}
