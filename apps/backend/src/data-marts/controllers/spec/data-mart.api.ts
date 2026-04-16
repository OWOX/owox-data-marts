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
import { BatchDataMartHealthStatusRequestApiDto } from '../../dto/presentation/batch-data-mart-health-status-request-api.dto';
import { BatchDataMartHealthStatusResponseApiDto } from '../../dto/presentation/batch-data-mart-health-status-response-api.dto';
import { UpdateDataMartDescriptionApiDto } from '../../dto/presentation/update-data-mart-description-api.dto';
import { UpdateDataMartTitleApiDto } from '../../dto/presentation/update-data-mart-title-api.dto';
import { UpdateDataMartDefinitionApiDto } from '../../dto/presentation/update-data-mart-definition-api.dto';
import { UpdateDataMartSchemaApiDto } from '../../dto/presentation/update-data-mart-schema-api.dto';
import { DataMartValidationResponseApiDto } from '../../dto/presentation/data-mart-validation-response-api.dto';
import { DataMartRunsResponseApiDto } from '../../dto/presentation/data-mart-runs-response-api.dto';
import { DataMartRunResponseApiDto } from '../../dto/presentation/data-mart-run-response-api.dto';
import { UpdateDataMartOwnersApiDto } from '../../dto/presentation/update-data-mart-owners-api.dto';
import { PaginatedDataMartsResponseApiDto } from '../../dto/presentation/paginated-data-marts-response-api.dto';
import { RunDataMartRequestApiDto } from '../../dto/presentation/run-data-mart-request-api.dto';
import { UpdateDataMartAvailabilityApiDto } from '../../dto/presentation/update-availability-api.dto';
import { OwnerFilter } from '../../enums/owner-filter.enum';

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
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      example: 0,
      description: 'Number of DataMarts to skip before returning results',
    }),
    ApiQuery({
      name: 'ownerFilter',
      required: false,
      enum: OwnerFilter,
      example: OwnerFilter.HAS_OWNERS,
      description: 'Filter DataMarts by whether they have technical or business owners',
    }),
    ApiResponse({ status: 200, type: PaginatedDataMartsResponseApiDto })
  );
}

export function GetDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a DataMart by ID' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto })
  );
}

export function BatchDataMartHealthStatusSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Batch get DataMart health status' }),
    ApiBody({ type: BatchDataMartHealthStatusRequestApiDto }),
    ApiOkResponse({ type: BatchDataMartHealthStatusResponseApiDto })
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

export function UpdateDataMartOwnersSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart owners' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartOwnersApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function DeleteDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Soft delete DataMart' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiOkResponse({ description: 'DataMart deleted' })
  );
}

export function RunDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Manual run DataMart' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: RunDataMartRequestApiDto, required: false }),
    ApiResponse({
      status: 201,
      description: 'DataMart run created',
      schema: {
        type: 'object',
        required: ['runId'],
        properties: {
          runId: {
            type: 'string',
            format: 'uuid',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
        },
      },
    })
  );
}

export function ValidateDataMartDefinitionSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Validate DataMart definition' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
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

export function GetDataMartRunsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get DataMart run history' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 20,
      description: 'Maximum number of runs to return',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      example: 0,
      description: 'Number of runs to skip before returning results',
    }),
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

export function GetDataMartRunByIdSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get DataMart run by ID' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiParam({ name: 'runId', description: 'Run ID' }),
    ApiOkResponse({ type: DataMartRunResponseApiDto })
  );
}

export function GetMemberOwnershipWarningsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List member ownership warnings' }),
    ApiOkResponse({
      description:
        'Technical-owner warnings for project members whose role makes ownership ineffective',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['userId', 'warning'],
          properties: {
            userId: {
              type: 'string',
              example: 'user-123',
            },
            warning: {
              type: 'string',
              example: 'Technical Owner — requires Technical User role to be effective',
            },
          },
        },
      },
    })
  );
}

export function UpdateDataMartAvailabilitySpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart availability' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateDataMartAvailabilityApiDto }),
    ApiNoContentResponse({ description: 'DataMart availability updated' })
  );
}
