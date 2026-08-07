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
import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { UpdateBlendedFieldsConfigApiDto } from '../../dto/presentation/update-blended-fields-config-api.dto';
import { UpdateDataMartDefinitionApiDto } from '../../dto/presentation/update-data-mart-definition-api.dto';
import { UpdateDataMartSchemaApiDto } from '../../dto/presentation/update-data-mart-schema-api.dto';
import { DataMartAiHelperAvailabilityResponseApiDto } from '../../dto/presentation/data-mart-ai-helper-availability-response-api.dto';
import { DataMartValidationResponseApiDto } from '../../dto/presentation/data-mart-validation-response-api.dto';
import { DataMartInputSourceChangeImpactResponseApiDto } from '../../dto/presentation/data-mart-input-source-change-impact-response-api.dto';
import { DataMartRunsResponseApiDto } from '../../dto/presentation/data-mart-runs-response-api.dto';
import { DataMartRunDetailResponseApiDto } from '../../dto/presentation/data-mart-run-response-api.dto';
import { UpdateDataMartOwnersApiDto } from '../../dto/presentation/update-data-mart-owners-api.dto';
import { PaginatedDataMartsResponseApiDto } from '../../dto/presentation/paginated-data-marts-response-api.dto';
import { RunDataMartRequestApiDto } from '../../dto/presentation/run-data-mart-request-api.dto';
import { RunDataMartResponseApiDto } from '../../dto/presentation/run-data-mart-response-api.dto';
import { UpdateDataMartAvailabilityApiDto } from '../../dto/presentation/update-availability-api.dto';
import { UpdateEntityContextsRequestApiDto } from '../../dto/presentation/context-api.dto';
import { DATA_MARTS_PAGE_SIZE } from '../../use-cases/list-data-marts.service';
import { BatchDataMartDataLastUpdatedResponseApiDto } from '../../dto/presentation/data-mart-data-last-updated-response-api.dto';
import { RefreshDataMartDataLastUpdatedRequestApiDto } from '../../dto/presentation/refresh-data-mart-data-last-updated-request-api.dto';
import { DEFAULT_PROJECT_LIST_LIMIT } from '../../utils/normalize-project-list-pagination';

export function CreateDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a new DataMart' }),
    ApiBody({ type: CreateDataMartRequestApiDto }),
    ApiResponse({ status: 201, type: CreateDataMartResponseApiDto })
  );
}

export function ListDataMartsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List visible Data Marts',
      description:
        'Returns Data Marts visible to the current project member. Viewer access is required. ' +
        `Each response page contains at most ${DATA_MARTS_PAGE_SIZE} items.`,
    }),
    ApiOkResponse({
      description: 'A page of visible Data Marts with the next offset when more items exist.',
      type: PaginatedDataMartsResponseApiDto,
    })
  );
}

export function GetDataMartSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a DataMart by ID' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiResponse({ status: 200, type: DataMartResponseApiDto })
  );
}

export function GetDataMartInputSourceChangeImpactSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Count what depends on a DataMart before its input source is changed',
      description:
        'Returns how many relationships reference this DataMart in each direction and how many reports are built on it, so the caller can show the blast radius of repointing it at another input source.',
    }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiOkResponse({ type: DataMartInputSourceChangeImpactResponseApiDto })
  );
}

export function RefreshDataMartDataLastUpdatedSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Refresh the Data Last Updated snapshot for one or more DataMarts',
      description:
        'Measures live, against the warehouse, when the source tables behind each DataMart last changed, and persists what resolves as the last-known value. Ids sharing a storage are measured together, so that storage’s client is built once. Free of consumption; best effort — ids that could not be measured are simply absent from the response and keep their previous value.',
    }),
    ApiBody({ type: RefreshDataMartDataLastUpdatedRequestApiDto }),
    ApiOkResponse({ type: BatchDataMartDataLastUpdatedResponseApiDto })
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

export function UpdateDataMartContextsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Replace the contexts attached to a Data Mart',
      description:
        'Editors may only attach contexts they themselves are bound to. Admins may attach any context.',
    }),
    ApiParam({ name: 'id', description: 'Data Mart ID' }),
    ApiBody({ type: UpdateEntityContextsRequestApiDto }),
    ApiOkResponse({ description: 'Data Mart contexts updated' }),
    ApiResponse({
      status: 403,
      description: 'Caller is not allowed to attach one of the contexts',
    }),
    ApiResponse({ status: 404, description: 'Data Mart or Context not found' })
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
    ApiOperation({
      summary: 'Start a manual Data Mart run',
      description:
        'Starts a connector Data Mart run. Technical User access to the Data Mart is required.',
    }),
    ApiParam({ name: 'id', description: 'Data Mart ID' }),
    ApiBody({ type: RunDataMartRequestApiDto, required: false }),
    ApiResponse({
      status: 201,
      description: 'DataMart run created',
      type: RunDataMartResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid payload, unsupported Data Mart type, or unpublished Data Mart',
    }),
    ApiResponse({ status: 404, description: 'Data Mart not found' })
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
    ApiOperation({
      summary: 'List Data Mart runs',
      description:
        'Returns newest-first run history for one visible Data Mart. Business User access is required.',
    }),
    ApiParam({ name: 'id', description: 'Data Mart ID' }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      default: DEFAULT_PROJECT_LIST_LIMIT,
      description: 'Maximum number of runs to return. Defaults to 100 when omitted.',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      default: 0,
      description: 'Number of runs to skip. Defaults to zero when omitted.',
    }),
    ApiOkResponse({
      description: 'Newest-first page of Data Mart runs.',
      type: DataMartRunsResponseApiDto,
    }),
    ApiResponse({ status: 404, description: 'Data Mart not found' })
  );
}

export function CancelDataMartRunSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancel a Data Mart run',
      description:
        'Cancels an active connector, standard report, or Data Quality run. Technical User access to the Data Mart is required.',
    }),
    ApiParam({ name: 'id', description: 'Data Mart ID' }),
    ApiParam({ name: 'runId', description: 'Run ID' }),
    ApiNoContentResponse({ description: 'Data Mart run cancelled' }),
    ApiResponse({ status: 400, description: 'The run type cannot be cancelled' }),
    ApiResponse({ status: 404, description: 'Data Mart or run not found' }),
    ApiResponse({ status: 409, description: 'The run is no longer active' })
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
    ApiOperation({
      summary: 'Get a Data Mart run',
      description:
        'Returns one run belonging to a visible Data Mart, including Data Quality detail when applicable. Business User access is required.',
    }),
    ApiParam({ name: 'id', description: 'Data Mart ID' }),
    ApiParam({ name: 'runId', description: 'Run ID' }),
    ApiOkResponse({ type: DataMartRunDetailResponseApiDto }),
    ApiResponse({ status: 404, description: 'Data Mart or run not found' })
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

export function UpdateBlendedFieldsConfigSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Update DataMart blended fields config' }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiBody({ type: UpdateBlendedFieldsConfigApiDto }),
    ApiOkResponse({ type: DataMartResponseApiDto })
  );
}

export function GetBlendableSchemaSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get blendable schema for a DataMart',
      description:
        'Returns native fields, blended fields pulled from joined DataMarts, and the list of available sources reachable via relationships.',
    }),
    ApiParam({ name: 'id', description: 'DataMart ID' }),
    ApiOkResponse({ type: BlendableSchemaDto })
  );
}

export function DataMartAiHelperAvailabilitySpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Check whether the AI helper is configured on this deployment',
      description:
        'Returns { enabled: true } when AI keys are present and metadata generation is available; { enabled: false } otherwise. Frontend uses this to decide whether to render AI-helper buttons.',
    }),
    ApiOkResponse({ type: DataMartAiHelperAvailabilityResponseApiDto })
  );
}
