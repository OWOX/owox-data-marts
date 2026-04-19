import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportResponseApiDto } from '../../dto/presentation/report-response-api.dto';
import { CreateReportRequestApiDto } from '../../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../../dto/presentation/update-report-request-api.dto';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export function CreateReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new report' }),
    ApiBody({ type: CreateReportRequestApiDto }),
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

export function ListReportsByProjectSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all reports for a project' }),
    ApiQuery({
      name: 'ownerFilter',
      required: false,
      enum: OwnerFilter,
      example: OwnerFilter.HAS_OWNERS,
      description: 'Filter reports by whether they have owners',
    }),
    ApiOkResponse({
      description: 'List of reports for the project',
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

export function UpdateReportSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update an existing report' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiBody({ type: UpdateReportRequestApiDto }),
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
      schema: { type: 'object', properties: { sql: { type: 'string' } } },
    })
  );
}

export function CopyReportAsDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Copy a report as a new data mart with SQL definition' }),
    ApiParam({ name: 'id', description: 'Report ID' }),
    ApiCreatedResponse({
      description: 'The new data mart has been successfully created.',
      schema: { type: 'object', properties: { dataMartId: { type: 'string' } } },
    })
  );
}
