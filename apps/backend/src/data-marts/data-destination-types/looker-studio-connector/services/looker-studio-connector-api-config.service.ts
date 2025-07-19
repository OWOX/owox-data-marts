import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { ReportService } from '../../../services/report.service';
import { ConfigFieldType } from '../enums/config-field-type.enum';
import {
  ConnectorRequestConfigV1,
  ConnectorRequestConfigV1Schema,
} from '../schemas/connector-request-config.schema.v1';
import { ConfigField, GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';

@Injectable()
export class LookerStudioConnectorApiConfigService {
  private readonly logger = new Logger(LookerStudioConnectorApiConfigService.name);

  constructor(private readonly reportsService: ReportService) {}

  public async getConfig(request: GetConfigRequest): Promise<GetConfigResponse> {
    this.logger.debug('getConfig called with request:', request);

    const requestConfigOpt = ConnectorRequestConfigV1Schema.safeParse(request.configParams);
    if (!requestConfigOpt.success) {
      this.logger.error('Incompatible request config', requestConfigOpt.error);
      throw new BusinessViolationException('Incompatible request config provided');
    }

    const requestConfig: ConnectorRequestConfigV1 = requestConfigOpt.data;
    let isFurtherConfigRequired = true;
    const requiredConfigParams: ConfigField[] = [
      {
        name: '',
        text: 'OWOX Data Marts secret is required to access the data.',
        type: ConfigFieldType.INFO,
      },
      {
        name: 'secret',
        displayName: 'Connector Secret',
        helpText: 'Enter your connector secret',
        placeholder: 'sk-...',
        type: ConfigFieldType.TEXTAREA,
        isRequired: true,
        isDynamic: true,
      },
    ];

    if (requestConfig.secret) {
      const availableReports = await this.reportsService.getByLookerStudioSecret(
        requestConfig.secret
      );
      if (availableReports.length === 0) {
        throw new BusinessViolationException('No data marts available for the provided secret');
      }

      const reportSelector: ConfigField = {
        name: 'report',
        displayName: 'Select OWOX Data Mart',
        helpText: 'You can select within data marts available for current Secret.',
        type: ConfigFieldType.SELECT_SINGLE,
        isRequired: true,
        isDynamic: true,
        options: [],
      };

      availableReports.forEach(report => {
        reportSelector.options?.push({
          value: report.id,
          label: (report.title ?? report.dataMart.title) + ` [${report.dataMart.id}]`,
        });
      });

      requiredConfigParams.push(reportSelector);

      isFurtherConfigRequired = false;
    }

    return {
      configParams: requiredConfigParams,
      dateRangeRequired: false,
      isSteppedConfig: isFurtherConfigRequired,
    };
  }
}
