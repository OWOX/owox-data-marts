import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ReportResponseApiDto } from '../../dto/presentation/report-response-api.dto';
import { ReconnectGoogleSheetResponseDto } from '../../dto/presentation/google-sheets/reconnect-google-sheet-response.dto';
import {
  createReportRequestBodySchema,
  REPORT_OPENAPI_MODELS,
  updateReportRequestBodySchema,
} from './report-openapi';

export function CreateReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new report' }),
    ApiExtraModels(...REPORT_OPENAPI_MODELS),
    ApiBody({ schema: createReportRequestBodySchema }),
    ApiCreatedResponse({
      description: 'The report has been successfully created.',
      type: ReportResponseApiDto,
    })
  );
}

export function ListReportsByDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all reports for a data mart' }),
    ApiParam({ name: 'dataMartId', description: 'Data mart ID' }),
    ApiOkResponse({
      description: 'List of reports for the data mart',
      type: [ReportResponseApiDto],
    })
  );
}

export function GetReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a report by ID' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiOkResponse({
      description: 'The report',
      type: ReportResponseApiDto,
    })
  );
}

export function DeleteReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete a report' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiOkResponse({
      description: 'The report has been successfully deleted.',
    })
  );
}

export function RunReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Trigger a manual report run' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiCreatedResponse({
      description: 'The manual report run trigger has been successfully created.',
    })
  );
}

export function ReconnectGoogleSheetSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Reconnect a Google Sheets report to a sheet named after the report',
      description:
        'Points the report at a sheet (tab) named after the report title, creating it when ' +
        'the spreadsheet has none, and repairs the stored sheet ID. Recovers a report whose ' +
        'sheet was deleted or re-created. No request body.',
    }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiOkResponse({
      description: 'The report has been reconnected to the sheet.',
      type: ReconnectGoogleSheetResponseDto,
    })
  );
}

export function UpdateReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update an existing report' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiExtraModels(...REPORT_OPENAPI_MODELS),
    ApiBody({ schema: updateReportRequestBodySchema }),
    ApiOkResponse({
      description: 'The report has been successfully updated.',
      type: ReportResponseApiDto,
    })
  );
}

export function ListReportsByInsightTemplateSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get email reports that use an insight template' }),
    ApiParam({ name: 'dataMartId', description: 'Data mart ID' }),
    ApiParam({ name: 'insightTemplateId', description: 'Insight template ID' }),
    ApiOkResponse({
      description: 'List of email reports that use the insight template as their template source',
      type: [ReportResponseApiDto],
    })
  );
}

export function GetReportGeneratedSqlSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get the generated SQL for a report' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiOkResponse({
      description: 'The generated SQL query for the report.',
      schema: {
        type: 'object',
        required: ['sql', 'canModifySource'],
        properties: {
          sql: { type: 'string' },
          canModifySource: {
            type: 'boolean',
            description:
              'Whether the caller has maintenance (edit) access to the source data mart. False for read-only viewers, who can read and copy the SQL but cannot dry-run it or copy it as a new data mart.',
          },
        },
      },
    })
  );
}

export function CopyReportAsDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Copy a report as a new data mart with SQL definition' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiCreatedResponse({
      description: 'The new data mart has been successfully created.',
      schema: {
        type: 'object',
        required: ['dataMartId'],
        properties: { dataMartId: { type: 'string', format: 'uuid' } },
      },
    })
  );
}
