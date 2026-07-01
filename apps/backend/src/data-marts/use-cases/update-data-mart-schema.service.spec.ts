import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateDataMartSchemaService } from './update-data-mart-schema.service';

describe('UpdateDataMartSchemaService', () => {
  it('schedules data mart schema search invalidation after saving the parsed schema', async () => {
    const parsedSchema = { type: 'bigquery-data-mart-schema', fields: [] };
    const dataMart = {
      id: 'target-1',
      projectId: 'project-1',
      storage: { type: DataStorageType.GOOGLE_BIGQUERY },
      schema: null,
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const schemaParserFacade = {
      validateAndParse: jest.fn().mockResolvedValue(parsedSchema),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'target-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const searchIndexInvalidation = {
      scheduleDataMartSchemaChanged: jest.fn().mockResolvedValue(undefined),
    };

    const service = new UpdateDataMartSchemaService(
      dataMartService as never,
      schemaParserFacade as never,
      mapper as never,
      accessDecisionService as never,
      searchIndexInvalidation as never
    );

    await service.run(
      new UpdateDataMartSchemaCommand('target-1', 'project-1', parsedSchema as never)
    );

    expect(dataMart.schema).toBe(parsedSchema);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).toHaveBeenCalledWith(
      'target-1',
      'project-1'
    );
  });
});
