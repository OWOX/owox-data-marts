import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
  Role: { viewer: jest.fn() },
  Strategy: { PARSE: 'parse' },
}));

import { CreatePluginScheduleService } from '../use-cases/create-plugin-schedule.service';
import { DeletePluginScheduleService } from '../use-cases/delete-plugin-schedule.service';
import { GetPluginScheduleService } from '../use-cases/get-plugin-schedule.service';
import { ListPluginSchedulesService } from '../use-cases/list-plugin-schedules.service';
import { PausePluginScheduleService } from '../use-cases/pause-plugin-schedule.service';
import { ResumePluginScheduleService } from '../use-cases/resume-plugin-schedule.service';
import { UpdatePluginScheduleService } from '../use-cases/update-plugin-schedule.service';
import { PluginScheduleRuntimeController } from './plugin-schedule-runtime.controller';

const SCHEDULES = '/api/plugins/runtime/schedules';
const ONE = `${SCHEDULES}/{id}`;

describe('PluginScheduleRuntimeController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PluginScheduleRuntimeController],
      providers: [
        CreatePluginScheduleService,
        ListPluginSchedulesService,
        GetPluginScheduleService,
        UpdatePluginScheduleService,
        PausePluginScheduleService,
        ResumePluginScheduleService,
        DeletePluginScheduleService,
      ].map(provide => ({ provide, useValue: {} })),
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1.0').build()
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents the create and update bodies, read raw by the routes', () => {
    const body = (name: string) => ({
      required: true,
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
    });

    expect(document.paths[SCHEDULES]?.post?.requestBody).toEqual(
      body('CreatePluginScheduleApiDto')
    );
    expect(document.paths[ONE]?.patch?.requestBody).toEqual(body('UpdatePluginScheduleApiDto'));
    const update = document.components?.schemas?.UpdatePluginScheduleApiDto as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(update.properties)).not.toContain('enabled');
  });

  it('answers 201 on create, 200 on pause and resume, and 204 on delete', () => {
    expect(document.paths[SCHEDULES]?.post?.responses).toHaveProperty('201');
    expect(document.paths[`${ONE}/pause`]?.post?.responses).toHaveProperty('200');
    expect(document.paths[`${ONE}/resume`]?.post?.responses).toHaveProperty('200');
    expect(document.paths[ONE]?.delete?.responses).toHaveProperty('204');
  });

  it('documents parameters on the plugin response', () => {
    expect(document.components?.schemas?.PluginScheduleApiDto).toMatchObject({
      properties: { parameters: expect.any(Object), lastRun: expect.any(Object) },
    });
  });
});
