import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { createSwaggerDocument } from './swagger.config';

class RequestBodyDto {
  @ApiProperty()
  value: string;
}

@Controller('transport-contract')
class TransportContractController {
  @Post()
  @ApiBody({ type: RequestBodyDto })
  create(@Body() body: RequestBodyDto): RequestBodyDto {
    return body;
  }

  @Get()
  list(): string[] {
    return [];
  }
}

describe('Swagger transport contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TransportContractController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the shared parser ceiling response for request-body operations only', () => {
    const document = createSwaggerDocument(app);

    expect(document.paths['/transport-contract']?.post?.responses['413']).toEqual({
      description: 'Request body too large',
    });
    expect(document.paths['/transport-contract']?.get?.responses['413']).toBeUndefined();
  });
});
