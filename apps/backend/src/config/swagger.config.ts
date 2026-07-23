import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type {
  OperationObject,
  ParameterObject,
  ReferenceObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  OWOX_API_KEY_AUTH_EXTENSION,
  OWOX_API_KEY_ID_DESCRIPTION,
  OWOX_API_KEY_ID_HEADER,
  OWOX_AUTHORIZATION_DESCRIPTION,
  OWOX_AUTHORIZATION_HEADER,
  OWOX_AUTHORIZATION_SECURITY_SCHEME,
} from '../idp/openapi/authentication.openapi';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('OWOX Data Marts API')
    .setDescription('REST API used by frontend clients and service integrations.')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: OWOX_AUTHORIZATION_HEADER,
        description: OWOX_AUTHORIZATION_DESCRIPTION,
      },
      OWOX_AUTHORIZATION_SECURITY_SCHEME
    )
    .build();
}

export function setupSwagger(app: INestApplication, path: string): void {
  const document = createSwaggerDocument(app);
  SwaggerModule.setup(path, app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
    raw: ['json', 'yaml'],
    yamlDocumentUrl: 'openapi.yaml',
  });
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  for (const path of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = path[method];
      if (operation && usesOwoxAuthorization(operation)) {
        applyOwoxAuthenticationContract(operation);
      }
    }
  }

  return document;
}

function usesOwoxAuthorization(operation: OperationObject): boolean {
  return Boolean(
    operation.security?.some(requirement => OWOX_AUTHORIZATION_SECURITY_SCHEME in requirement)
  );
}

function applyOwoxAuthenticationContract(operation: OperationObject): void {
  const extensionOperation = operation as OperationObject & Record<string, unknown>;
  const rejectsApiKeyAuth = extensionOperation[OWOX_API_KEY_AUTH_EXTENSION] === false;
  const parameters = (operation.parameters ?? []).filter(
    parameter =>
      !isHeaderParameter(parameter, OWOX_AUTHORIZATION_HEADER) &&
      !isHeaderParameter(parameter, OWOX_API_KEY_ID_HEADER)
  );

  if (!rejectsApiKeyAuth) {
    parameters.push({
      name: OWOX_API_KEY_ID_HEADER,
      in: 'header',
      required: false,
      description: OWOX_API_KEY_ID_DESCRIPTION,
      schema: { type: 'string' },
    });
  }

  operation.parameters = parameters.length > 0 ? parameters : undefined;
  delete extensionOperation[OWOX_API_KEY_AUTH_EXTENSION];
}

function isHeaderParameter(
  parameter: ParameterObject | ReferenceObject,
  headerName: string
): parameter is ParameterObject {
  return (
    'in' in parameter &&
    parameter.in === 'header' &&
    parameter.name.toLowerCase() === headerName.toLowerCase()
  );
}
