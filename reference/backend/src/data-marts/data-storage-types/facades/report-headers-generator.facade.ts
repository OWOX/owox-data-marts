import { Inject, Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartSchema } from '../data-mart-schema.type';
import { REPORT_HEADERS_GENERATOR_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { ReportHeadersGenerator } from '../interfaces/report-headers-generator.interface';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';

@Injectable()
export class ReportHeadersGeneratorFacade {
  constructor(
    @Inject(REPORT_HEADERS_GENERATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, ReportHeadersGenerator>
  ) {}

  async generateHeadersFromSchema(
    storageType: DataStorageType,
    dataMartSchema: DataMartSchema
  ): Promise<ReportDataHeader[]> {
    if (!dataMartSchema) {
      throw new BusinessViolationException('Data mart schema must be provided');
    }

    const generator = await this.resolver.resolve(storageType);
    return generator.generateHeaders(dataMartSchema);
  }
}
