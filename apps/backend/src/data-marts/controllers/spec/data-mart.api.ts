import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateDataMartRequestApiDto } from '../../dto/presentation/create-data-mart-request-api.dto';
import { DataMartResponseApiDto } from '../../dto/presentation/data-mart-response-api.dto';
import { CreateDataMartResponseApiDto } from '../../dto/presentation/create-data-mart-response-api.dto';
import { UpdateDataMartDescriptionApiDto } from '../../dto/presentation/update-data-mart-description-api.dto';
import { UpdateDataMartTitleApiDto } from '../../dto/presentation/update-data-mart-title-api.dto';
import { UpdateDataMartDefinitionApiDto } from '../../dto/presentation/update-data-mart-definition-api.dto';
import { UpdateDataMartSchemaApiDto } from '../../dto/presentation/update-data-mart-schema-api.dto';
import { DataMartValidationResponseApiDto } from '../../dto/presentation/data-mart-validation-response-api.dto';
import { SqlDryRunRequestApiDto } from '../../dto/presentation/sql-dry-run-request-api.dto';
import { SqlDryRunResponseApiDto } from '../../dto/presentation/sql-dry-run-response-api.dto';
import { DataMartRunsResponseApiDto } from '../../dto/presentation/data-mart-runs-response-api.dto';

export function CreateDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new DataMart' }),
    ApiBody({ type: CreateDataMartRequestApiDto }),
    ApiResponse({ status: 201, type: CreateDataMartResponseApiDto })
  );
}

export function ListDataMartsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List all DataMarts' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto, isArray: true })
  );
}

export function GetDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a DataMart by ID' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartDefinitionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart definition' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartDefinitionApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function PublishDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Publish DataMart' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartDescriptionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart description' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartDescriptionApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function UpdateDataMartTitleSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart title' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartTitleApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function DeleteDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Soft delete DataMart' }),
    ApiParam({ name: 'id', type: String }),
    ApiNoContentResponse({ description: 'DataMart deleted' })
  );
}

export function RunDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Manual run DataMart' }),
    ApiParam({ name: 'id', type: String }),
    ApiNoContentResponse({ description: 'DataMart run' })
  );
}

export function ValidateDataMartDefinitionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Validate DataMart definition' }),
    ApiParam({ name: 'id', type: String }),
    ApiOkResponse({ type: DataMartValidationResponseApiDto })
  );
}

export function UpdateDataMartSchemaSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart schema' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartSchemaApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function SqlDryRunSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Execute SQL dry run validation' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: SqlDryRunRequestApiDto }),
    ApiOkResponse({ type: SqlDryRunResponseApiDto })
  );
}

export function GetDataMartRunsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get DataMart run history' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiQuery({ name: 'limit', description: 'Limit the number of runs to return', required: false }),
    ApiQuery({ name: 'offset', description: 'Offset for pagination', required: false }),
    ApiOkResponse({ type: DataMartRunsResponseApiDto })
  );
}

export function CancelDataMartRunSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Cancel a DataMart run' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiParam({ name: 'runId', description: 'Run ID' }),
    ApiNoContentResponse({ description: 'DataMart run cancelled' })
  );
}

export function ListDataMartsByConnectorNameSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List DataMarts by connector name' }),
    ApiParam({ name: 'connectorName', description: 'Connector name' }),
    ApiOkResponse({ type: DataMartResponseApiDto, isArray: true })
  );
}
