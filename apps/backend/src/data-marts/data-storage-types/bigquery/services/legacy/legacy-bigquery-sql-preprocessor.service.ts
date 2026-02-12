import { Injectable } from '@nestjs/common';
import { LegacyDataMartsService } from '../../../../services/legacy-data-marts/legacy-data-marts.service';

@Injectable()
export class LegacyBigQuerySqlPreprocessor {
  constructor(private readonly legacyDataMartsService: LegacyDataMartsService) {}

  async prepare(sql: string): Promise<string> {
    return this.legacyDataMartsService.parseQuery(sql);
  }
}
