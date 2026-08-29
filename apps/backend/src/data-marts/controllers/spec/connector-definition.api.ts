import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ConnectorFieldsResponseApiDto } from '../../dto/presentation/connector-fields-response-api.dto';
import { ConnectorSpecificationResponseApiDto } from '../../dto/presentation/connector-specification-response-api.dto';
import {
  ActivateCustomConnectorVersionResponseApiDto,
  ConnectorTestResultResponseApiDto,
  CreateCustomConnectorResponseApiDto,
  CustomConnectorDetailResponseApiDto,
  CustomConnectorListItemResponseApiDto,
  CustomConnectorVersionResponseApiDto,
  CustomConnectorVersionStateResponseApiDto,
  DeleteCustomConnectorResponseApiDto,
  PublishCustomConnectorResponseApiDto,
} from '../../dto/presentation/custom-connector-response.dto';
import {
  CreateCustomConnectorRequestApiDto,
  SaveDraftRequestApiDto,
  TestConnectorRequestApiDto,
  UpdateCustomConnectorRequestApiDto,
} from '../../dto/presentation/custom-connector.dto';

export function ListCustomConnectorsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List custom connectors',
      description:
        'Returns every custom connector defined in the current project, with the version number ' +
        'currently active for each. Viewer access is required.',
    }),
    ApiOkResponse({
      description: 'Custom connectors defined in the project.',
      type: CustomConnectorListItemResponseApiDto,
      isArray: true,
    })
  );
}

export function CreateCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a custom connector',
      description:
        'Registers a custom connector and stores the supplied manifest as its first draft version. ' +
        'Editor access is required.',
    }),
    ApiBody({ type: CreateCustomConnectorRequestApiDto }),
    ApiCreatedResponse({
      description: 'Custom connector created.',
      type: CreateCustomConnectorResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Connector name is invalid, reserved by a built-in connector, or already taken',
    })
  );
}

export function TestCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Run a custom connector manifest against its source',
      description:
        'Executes one node of an unsaved manifest and returns the records, the raw sample used for ' +
        'field discovery and the process logs. Editor access is required.',
    }),
    ApiBody({ type: TestConnectorRequestApiDto }),
    ApiCreatedResponse({
      description: 'Test run finished; `error` carries the failure when the run did not succeed.',
      type: ConnectorTestResultResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Manifest is invalid, the node is unknown, or the test concurrency limit is hit',
    })
  );
}

export function GetCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a custom connector with its version history',
      description:
        'Returns the connector together with every stored version. Viewer access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiOkResponse({
      description: 'Custom connector with its version history.',
      type: CustomConnectorDetailResponseApiDto,
    }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function GetCustomConnectorVersionSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get one version of a custom connector',
      description: 'Returns the manifest stored for that version. Viewer access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiParam({ name: 'version', description: 'Version number', type: Number }),
    ApiOkResponse({
      description: 'Stored version and its manifest.',
      type: CustomConnectorVersionResponseApiDto,
    }),
    ApiResponse({ status: 404, description: 'Custom connector or version not found' })
  );
}

export function UpdateCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update the display metadata of a custom connector',
      description:
        'Updates the title, description, logo or documentation URL. Omitted fields are left ' +
        'unchanged; an explicit null clears a nullable one. The connector name cannot be ' +
        'changed, because data marts reference their connector by name. Editor access is ' +
        'required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiBody({ type: UpdateCustomConnectorRequestApiDto }),
    ApiOkResponse({
      description: 'The connector after the update.',
      type: CustomConnectorDetailResponseApiDto,
    }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function SaveCustomConnectorDraftSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Save the draft manifest of a custom connector',
      description:
        'Overwrites the open draft, or opens a new draft version when the latest version is ' +
        'already published. Editor access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiBody({ type: SaveDraftRequestApiDto }),
    ApiOkResponse({
      description: 'Draft version the manifest was written to.',
      type: CustomConnectorVersionStateResponseApiDto,
    }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function PublishCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Publish the draft version of a custom connector',
      description:
        'Marks the latest draft published and activates it in the same change. The response ' +
        'carries `warnings`: credential-handling problems the publish did not refuse the ' +
        'manifest for, and the only notice the author gets of them. Editor access is ' +
        'required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiCreatedResponse({
      description: 'Published version.',
      type: PublishCustomConnectorResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Connector has no draft to publish, or the draft manifest is invalid',
    }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function ActivateCustomConnectorVersionSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Activate a published version of a custom connector',
      description:
        'Points the connector at an already published version, which is how a release is rolled ' +
        'back. Editor access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiParam({ name: 'version', description: 'Version number to activate', type: Number }),
    ApiCreatedResponse({
      description: 'Version now active for this connector.',
      type: ActivateCustomConnectorVersionResponseApiDto,
    }),
    ApiResponse({ status: 400, description: 'No published version with that number' }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function DeleteCustomConnectorSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete a custom connector',
      description:
        'Soft-deletes the connector, keeping its name reserved in the project. Refused while any ' +
        'Data Mart still references it. Editor access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiOkResponse({
      description: 'Custom connector deleted.',
      type: DeleteCustomConnectorResponseApiDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Custom connector is referenced by existing Data Marts',
    }),
    ApiResponse({ status: 404, description: 'Custom connector not found' })
  );
}

export function GetCustomConnectorSpecificationSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get the configuration specification of a custom connector',
      description:
        'Renders the parameter specification from the requested manifest version, falling back to ' +
        "the active version. PUBLISHED versions only: a draft is an editor's work in progress, " +
        'and the runner refuses one too. Values of parameters attributed SECRET (default, ' +
        'placeholder, options) are withheld. Viewer access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiQuery({
      name: 'version',
      required: false,
      type: Number,
      description: 'Published version to render. Defaults to the active version.',
    }),
    ApiOkResponse({ type: ConnectorSpecificationResponseApiDto, isArray: true }),
    ApiResponse({
      status: 404,
      description: 'Custom connector not found, or the version is missing or unpublished',
    })
  );
}

export function GetCustomConnectorFieldsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get the fields schema of a custom connector',
      description:
        'Renders the node/field schema from the requested manifest version, falling back to the ' +
        'active version. PUBLISHED versions only, matching the specification endpoint. Viewer ' +
        'access is required.',
    }),
    ApiParam({ name: 'id', description: 'Custom connector ID' }),
    ApiQuery({
      name: 'version',
      required: false,
      type: Number,
      description: 'Published version to render. Defaults to the active version.',
    }),
    ApiOkResponse({ type: ConnectorFieldsResponseApiDto, isArray: true }),
    ApiResponse({
      status: 404,
      description: 'Custom connector not found, or the version is missing or unpublished',
    })
  );
}
