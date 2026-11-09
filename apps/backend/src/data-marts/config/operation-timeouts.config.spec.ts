import {
  Controller,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
  Put,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import * as supertest from 'supertest';

// Each timeout middleware writes its limit, so the last one that runs on a route sets the header.
jest.mock('../../common/middleware/operation-timeout.middleware', () => ({
  createOperationTimeoutMiddleware:
    (timeoutMs: number) => (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('x-operation-timeout-ms', String(timeoutMs));
      next();
    },
}));

import { configureOperationTimeouts } from './operation-timeouts.config';

@Controller()
class StubController {
  @Post('plugins/runtime/credentials/:handle/ai/:operation')
  ai(): string {
    return 'ok';
  }

  @Post('plugins/runtime/credentials/:handle/fetch')
  fetch(): string {
    return 'ok';
  }

  @Put('data-marts/:id/schema')
  schema(): string {
    return 'ok';
  }
}

@Module({ controllers: [StubController] })
class StubModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    configureOperationTimeouts(consumer);
  }
}

describe('configureOperationTimeouts', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [StubModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['generate', 'embed', 'stream'])(
    'gives a plugin AI %s call 180 seconds',
    async operation => {
      await supertest
        .default(app.getHttpServer())
        .post(`/api/plugins/runtime/credentials/handle-1/ai/${operation}`)
        .expect('x-operation-timeout-ms', '180000');
    }
  );

  it('keeps 30 seconds for a plugin credential fetch', async () => {
    await supertest
      .default(app.getHttpServer())
      .post('/api/plugins/runtime/credentials/handle-1/fetch')
      .expect('x-operation-timeout-ms', '30000');
  });

  it('keeps 180 seconds for the schema save', async () => {
    await supertest
      .default(app.getHttpServer())
      .put('/api/data-marts/data-mart-1/schema')
      .expect('x-operation-timeout-ms', '180000');
  });
});
