jest.mock('../../idp', () => {
  const noopDecorator = () => () => undefined;
  const rejectApiKeyAuth = jest.requireActual('../../idp/decorators/reject-api-key-auth.decorator');

  return {
    Auth: noopDecorator,
    AuthContext: noopDecorator,
    ...rejectApiKeyAuth,
  };
});

jest.mock(
  '@owox/connectors',
  () => ({
    AvailableConnectors: {},
    Connectors: {},
    Core: {},
  }),
  { virtual: true }
);

jest.mock(
  '@owox/internal-helpers',
  () => ({
    BaseEvent: class {
      toJSON() {
        return {};
      }
    },
  }),
  { virtual: true }
);

jest.mock('@owox/idp-protocol', () => ({}), { virtual: true });

jest.mock('../use-cases/connector/available-connector.service', () => ({}));
jest.mock('../use-cases/connector/specification-connector.service', () => ({}));
jest.mock('../use-cases/connector/fields-connector.service', () => ({}));
jest.mock('../mappers/connector.mapper', () => ({}));
jest.mock('../services/connector/connector-oauth.service', () => ({}));
jest.mock('../use-cases/create-data-destination.service', () => ({}));
jest.mock('../use-cases/update-data-destination.service', () => ({}));
jest.mock('../use-cases/get-data-destination.service', () => ({}));
jest.mock('../use-cases/list-data-destinations.service', () => ({}));
jest.mock('../use-cases/list-data-destinations-by-type.service', () => ({}));
jest.mock('../use-cases/delete-data-destination.service', () => ({}));
jest.mock('../use-cases/get-data-destination-impact.service', () => ({}));
jest.mock('../use-cases/rotate-secret-key.service', () => ({}));
jest.mock('../mappers/data-destination.mapper', () => ({}));
jest.mock('../services/google-oauth/google-oauth-flow.service', () => ({}));
jest.mock('../use-cases/google-oauth/get-destination-oauth-status.service', () => ({}));
jest.mock('../use-cases/google-oauth/get-destination-oauth-credential-status.service', () => ({}));
jest.mock('../use-cases/google-oauth/generate-destination-oauth-url.service', () => ({}));
jest.mock('../use-cases/google-oauth/revoke-destination-oauth.service', () => ({}));
jest.mock('../use-cases/google-oauth/exchange-oauth-code.service', () => ({}));
jest.mock('../use-cases/update-availability.service', () => ({}));
jest.mock('../services/access-decision', () => ({
  Action: {},
  EntityType: {},
}));
jest.mock('../use-cases/google-sheets/create-google-sheet-document.service', () => ({}));
jest.mock('../use-cases/create-data-storage.service', () => ({}));
jest.mock('../use-cases/delete-data-storage.service', () => ({}));
jest.mock('../use-cases/get-data-storage.service', () => ({}));
jest.mock('../use-cases/list-data-storages.service', () => ({}));
jest.mock('../use-cases/update-data-storage.service', () => ({}));
jest.mock('../use-cases/validate-data-storage-access.service', () => ({}));
jest.mock('../use-cases/google-oauth/get-storage-oauth-status.service', () => ({}));
jest.mock('../use-cases/google-oauth/generate-storage-oauth-url.service', () => ({}));
jest.mock('../use-cases/google-oauth/revoke-storage-oauth.service', () => ({}));
jest.mock('../use-cases/list-data-storages-by-type.service', () => ({}));
jest.mock('../use-cases/list-storage-resources.service', () => ({}));
jest.mock('../mappers/data-storage.mapper', () => ({}));

import { RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REJECT_API_KEY_AUTH_METADATA } from '../../idp/decorators/reject-api-key-auth.decorator';
import { ConnectorController } from './connector.controller';
import { DataDestinationController } from './data-destination.controller';
import { DataStorageController } from './data-storage.controller';

type ControllerWithHandler = Type;

const SWAGGER_OPERATION_METADATA = 'swagger/apiOperation';

const oauthFlowOnlyRoutes: Array<{
  controller: ControllerWithHandler;
  handlerName: string;
  endpoint: string;
}> = [
  {
    controller: ConnectorController,
    handlerName: 'getConnectorOAuthSettings',
    endpoint: 'GET /api/connectors/{connectorName}/oauth/settings',
  },
  {
    controller: ConnectorController,
    handlerName: 'handleOAuthCallback',
    endpoint: 'POST /api/connectors/{connectorName}/oauth/exchange',
  },
  {
    controller: ConnectorController,
    handlerName: 'getConnectorOAuthStatus',
    endpoint: 'GET /api/connectors/{connectorName}/oauth/status/{credentialId}',
  },
  {
    controller: DataDestinationController,
    handlerName: 'createConnectGoogleSheets',
    endpoint: 'POST /api/data-destinations/connect/google-sheets',
  },
  {
    controller: DataDestinationController,
    handlerName: 'getOAuthSettings',
    endpoint: 'GET /api/data-destinations/oauth/settings',
  },
  {
    controller: DataDestinationController,
    handlerName: 'getOAuthCredentialStatus',
    endpoint: 'GET /api/data-destinations/oauth/credential-status/{credentialId}',
  },
  {
    controller: DataDestinationController,
    handlerName: 'generateOAuthAuthorizationUrlStandalone',
    endpoint: 'POST /api/data-destinations/oauth/authorize',
  },
  {
    controller: DataDestinationController,
    handlerName: 'exchangeOAuthCode',
    endpoint: 'POST /api/data-destinations/oauth/exchange',
  },
  {
    controller: DataDestinationController,
    handlerName: 'generateOAuthAuthorizationUrl',
    endpoint: 'POST /api/data-destinations/{id}/oauth/authorize',
  },
  {
    controller: DataDestinationController,
    handlerName: 'getOAuthStatus',
    endpoint: 'GET /api/data-destinations/{id}/oauth/status',
  },
  {
    controller: DataDestinationController,
    handlerName: 'revokeOAuth',
    endpoint: 'DELETE /api/data-destinations/{id}/oauth',
  },
  {
    controller: DataStorageController,
    handlerName: 'getOAuthSettings',
    endpoint: 'GET /api/data-storages/oauth/settings',
  },
  {
    controller: DataStorageController,
    handlerName: 'exchangeOAuthCode',
    endpoint: 'POST /api/data-storages/oauth/exchange',
  },
  {
    controller: DataStorageController,
    handlerName: 'generateOAuthAuthorizationUrl',
    endpoint: 'POST /api/data-storages/{id}/oauth/authorize',
  },
  {
    controller: DataStorageController,
    handlerName: 'getOAuthStatus',
    endpoint: 'GET /api/data-storages/{id}/oauth/status',
  },
  {
    controller: DataStorageController,
    handlerName: 'revokeOAuth',
    endpoint: 'DELETE /api/data-storages/{id}/oauth',
  },
];

describe('OAuth-flow-only controller routes', () => {
  it.each(oauthFlowOnlyRoutes)(
    'marks $endpoint as unavailable to API-key-derived authentication',
    ({ controller, handlerName, endpoint }) => {
      const handler = (
        controller.prototype as unknown as Record<string, (...args: never[]) => unknown>
      )[handlerName];
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
      const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string;
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      const route = `/api/${controllerPath}/${handlerPath}`.replace(/:([^/]+)/g, '{$1}');
      const swaggerOperation = Reflect.getMetadata(SWAGGER_OPERATION_METADATA, handler) as
        | { summary?: string }
        | undefined;

      expect(`${RequestMethod[requestMethod]} ${route}`).toBe(endpoint);
      expect(swaggerOperation?.summary).toEqual(expect.any(String));
      expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, handler)).toBe(true);
    }
  );
});
