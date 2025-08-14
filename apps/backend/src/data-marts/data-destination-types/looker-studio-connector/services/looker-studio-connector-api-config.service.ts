import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { ReportService } from '../../../services/report.service';
import { ConfigFieldType } from '../enums/config-field-type.enum';
import { ConnectionConfig, ConnectionConfigSchema } from '../schemas/connection-config.schema';

import { ConfigField, GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';

@Injectable()
export class LookerStudioConnectorApiConfigService {
  private readonly logger = new Logger(LookerStudioConnectorApiConfigService.name);

  constructor(private readonly reportsService: ReportService) {}

  public async getConfig(request: GetConfigRequest): Promise<GetConfigResponse> {
    this.logger.log('getConfig called with request:', request);

    const connectionConfigOpt = ConnectionConfigSchema.safeParse(request.connectionConfig);
    if (!connectionConfigOpt.success) {
      this.logger.error('Incompatible request config', connectionConfigOpt.error);
      throw new BusinessViolationException('Incompatible request config provided');
    }

    const connectionConfig: ConnectionConfig = connectionConfigOpt.data;
    const requiredConfigParams: ConfigField[] = [];

    const availableReports = await this.reportsService.getAllByDestinationIdAndLookerStudioSecret(
      connectionConfig.destinationId,
      connectionConfig.destinationSecretKey
    );

    const reportSelector: ConfigField = {
      name: 'reportId',
      displayName: 'Select the Data Mart',
      helpText: 'You can select within data marts available for current connection.',
      type: ConfigFieldType.SELECT_SINGLE,
      isDynamic: true,
      options: [],
    };

    availableReports.forEach(report => {
      reportSelector.options?.push({
        value: report.id,
        label: report.dataMart.title,
      });
    });

    requiredConfigParams.push(reportSelector);

    return {
      configParams: requiredConfigParams,
      dateRangeRequired: false,
      isSteppedConfig: false,
    };
  }
}
