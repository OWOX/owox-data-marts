import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  BatchRunDataQualityRequestApiDto,
  BatchRunDataQualityResponseApiDto,
  DataQualityConfigResponseApiDto,
  DataQualityConfigValueApiDto,
  DataQualityRunResponseApiDto,
  LatestDataQualityRunResponseApiDto,
  RunDataQualityRequestApiDto,
  RunDataQualityResponseApiDto,
} from '../../dto/presentation/data-quality-api.dto';

const dataMartParam = () => ApiParam({ name: 'dataMartId', description: 'Data Mart id' });
const readErrors = () =>
  applyDecorators(
    ApiForbiddenResponse({ description: 'SEE access is required' }),
    ApiNotFoundResponse({ description: 'Data Mart was not found in the current project' })
  );

export function GetDataQualityConfigSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get the effective Data Quality configuration' }),
    dataMartParam(),
    ApiOkResponse({ type: DataQualityConfigResponseApiDto }),
    readErrors()
  );
}

export function ReplaceDataQualityConfigSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Replace or reset the Data Quality configuration' }),
    ApiExtraModels(DataQualityConfigValueApiDto),
    dataMartParam(),
    ApiBody({
      schema: {
        oneOf: [{ $ref: getSchemaPath(DataQualityConfigValueApiDto) }, { type: 'null' }],
      },
    }),
    ApiOkResponse({ type: DataQualityConfigResponseApiDto }),
    ApiBadRequestResponse({ description: 'Configuration failed validation' }),
    ApiForbiddenResponse({ description: 'EDIT access is required' }),
    ApiNotFoundResponse({ description: 'Data Mart was not found in the current project' })
  );
}

export function RunDataQualitySpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Run Data Quality, optionally saving configuration atomically' }),
    ApiExtraModels(DataQualityConfigValueApiDto),
    dataMartParam(),
    ApiBody({ type: RunDataQualityRequestApiDto, required: false }),
    ApiCreatedResponse({ type: RunDataQualityResponseApiDto }),
    ApiBadRequestResponse({ description: 'Configuration failed validation' }),
    ApiForbiddenResponse({ description: 'EDIT access is required' }),
    ApiNotFoundResponse({ description: 'Data Mart was not found in the current project' }),
    ApiConflictResponse({ description: 'Data Mart is ineligible or already has an active run' })
  );
}

export function RunDataQualityBatchSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Independently enqueue Data Quality runs for up to 200 Data Marts' }),
    ApiBody({ type: BatchRunDataQualityRequestApiDto }),
    ApiOkResponse({ type: BatchRunDataQualityResponseApiDto }),
    ApiBadRequestResponse({ description: 'Batch request failed validation' })
  );
}

export function GetLatestDataQualityRunSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get the latest compact Data Quality run' }),
    ApiExtraModels(LatestDataQualityRunResponseApiDto),
    dataMartParam(),
    ApiOkResponse({
      schema: {
        oneOf: [{ $ref: getSchemaPath(LatestDataQualityRunResponseApiDto) }, { type: 'null' }],
      },
    }),
    readErrors()
  );
}

export function GetDataQualityRunDetailSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a full Data Quality run report' }),
    dataMartParam(),
    ApiParam({ name: 'runId', description: 'Public DataMartRun id' }),
    ApiOkResponse({ type: DataQualityRunResponseApiDto }),
    readErrors()
  );
}
