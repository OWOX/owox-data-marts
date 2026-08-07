import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CanPerformOperationsResponseDto } from '../../../data-marts/dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto } from '../../../data-marts/dto/domain/project-balance.dto';
import { InternalProjectBilling } from '../../../data-marts/services/project-billing/internal-project-billing.service';
import { LicenseConsumptionRequestDto } from '../dto/license-key-api.dto';
import { LicensedRequest, LicenseKeyGuard } from '../guards/license-key.guard';

@Controller('license')
@ApiExcludeController()
@UseGuards(LicenseKeyGuard)
export class LicenseGatewayController {
  constructor(private readonly projectBilling: InternalProjectBilling) {}

  @Post('can-perform')
  @HttpCode(200)
  async canPerform(@Req() request: LicensedRequest): Promise<CanPerformOperationsResponseDto> {
    return this.projectBilling.canPerformOperations(request.licensedProjectId!);
  }

  @Post('consumption')
  @HttpCode(202)
  async consumption(
    @Req() request: LicensedRequest,
    @Body() dto: LicenseConsumptionRequestDto
  ): Promise<void> {
    await this.projectBilling.publishForwardedConsumption(
      dto.kind,
      dto.payload,
      request.licensedProjectId!
    );
  }

  @Post('balance')
  @HttpCode(200)
  async balance(@Req() request: LicensedRequest): Promise<ProjectBalanceDto> {
    return this.projectBilling.getBalance(request.licensedProjectId!);
  }
}
