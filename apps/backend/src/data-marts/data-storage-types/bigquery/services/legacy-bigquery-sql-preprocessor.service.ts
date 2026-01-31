import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';

@Injectable()
export class LegacyBigQuerySqlPreprocessor {
  private readonly logger = new Logger(LegacyBigQuerySqlPreprocessor.name);
  private readonly baseUrl?: string;
  private readonly requestTimeout = 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>('LEGACY_BIGQUERY_SQL_PARSER_URL');
    this.baseUrl = configured ? configured.replace(/\/$/, '') : undefined;
  }

  async prepare(sql: string): Promise<string> {
    if (!this.baseUrl) {
      throw new Error(
        'Legacy BigQuery SQL preprocessor is not configured. Please set LEGACY_BIGQUERY_SQL_PARSER_URL.'
      );
    }

    const response = await fetchWithBackoff(
      `${this.baseUrl}/parse`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ sql }),
      },
      this.requestTimeout
    );

    if (!response.ok) {
      const text = await response.text();
      const message = `Legacy BigQuery SQL preprocessor failed: ${response.status} ${response.statusText} ${text}`;
      this.logger.error(message);
      throw new Error(message);
    }

    const text = await response.text();
    if (!text) {
      return '';
    }

    try {
      const data = JSON.parse(text);
      if (typeof data?.sql === 'string') {
        return data.sql;
      }
      if (typeof data?.parsedSql === 'string') {
        return data.parsedSql;
      }
      if (typeof data?.query === 'string') {
        return data.query;
      }
    } catch (error) {
      this.logger.error('Legacy SQL preprocessor returned non-JSON response', error);
    }

    return text;
  }
}
