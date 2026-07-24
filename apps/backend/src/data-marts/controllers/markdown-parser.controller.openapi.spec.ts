import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import * as supertest from 'supertest';

jest.mock('../../common/markdown/markdown-parser.service', () => ({
  MarkdownParser: jest.fn(),
}));

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  Role: {
    viewer: jest.fn(),
  },
  Strategy: {
    INTROSPECT: 'introspect',
  },
}));

import { MarkdownParser } from '../../common/markdown/markdown-parser.service';
import { setupGlobalPipes } from '../../config/global-pipes.config';
import { MarkdownParserController } from './markdown-parser.controller';

describe('MarkdownParserController OpenAPI', () => {
  const markdownParser = {
    parseToHtml: jest.fn(),
  };
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarkdownParserController],
      providers: [{ provide: MarkdownParser, useValue: markdownParser }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    setupGlobalPipes(app);
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1.0').build()
    );
  });

  afterAll(async () => {
    await app.close();
  });

  function resolveRef(ref: string): Record<string, any> {
    const schemaName = ref.split('/').at(-1)!;
    return document.components?.schemas?.[schemaName] as Record<string, any>;
  }

  it('accepts a valid Markdown body through global validation', async () => {
    markdownParser.parseToHtml.mockResolvedValue('<h1>Revenue</h1>');

    await supertest
      .default(app.getHttpServer())
      .post('/api/markdown/parse-to-html')
      .send({ markdown: '# Revenue' })
      .expect(201)
      .expect('<h1>Revenue</h1>');

    expect(markdownParser.parseToHtml).toHaveBeenCalledWith('# Revenue');
  });

  it('documents the Markdown request and raw HTML response', () => {
    const operation = document.paths['/api/markdown/parse-to-html']?.post;

    expect(operation).toMatchObject({
      operationId: 'MarkdownParserController_parseToHtml',
      tags: ['Utils'],
    });
    expect(operation?.summary).toBe('Convert Markdown to application-rendered HTML');

    const requestBody = operation?.requestBody as Record<string, any>;
    const requestSchema = requestBody.content['application/json'].schema as Record<string, any>;
    expect(resolveRef(requestSchema.$ref)).toMatchObject({
      required: ['markdown'],
      properties: {
        markdown: { type: 'string' },
      },
    });

    expect(operation?.responses['201']).toMatchObject({
      description: 'Rendered HTML using the same Markdown pipeline as the OWOX Data Marts UI',
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
    });
  });
});
