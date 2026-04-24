import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetBlendableSchemaService } from './get-blendable-schema.service';
import { GetBlendableSchemaCommand } from '../dto/domain/get-blendable-schema.command';
import { EntityType, Action } from '../services/access-decision';

describe('GetBlendableSchemaService', () => {
  const blendableSchema = { fields: [] };

  const createService = (canAccess = true) => {
    const blendableSchemaService = {
      computeBlendableSchema: jest.fn().mockResolvedValue(blendableSchema),
    };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new GetBlendableSchemaService(
      blendableSchemaService as never,
      dataMartService as never,
      accessDecisionService as never
    );

    return { service, blendableSchemaService, dataMartService, accessDecisionService };
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns blendable schema when user has SEE access on DataMart', async () => {
    const { service, blendableSchemaService, accessDecisionService } = createService(true);

    const command = new GetBlendableSchemaCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    const result = await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-1',
      Action.SEE,
      'proj-1'
    );
    expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith('dm-1', 'proj-1');
    expect(result).toBe(blendableSchema);
  });

  it('throws ForbiddenException when user lacks SEE on DataMart', async () => {
    const { service } = createService(false);

    const command = new GetBlendableSchemaCommand('dm-1', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, blendableSchemaService, accessDecisionService, dataMartService } =
      createService(true);

    const command = new GetBlendableSchemaCommand('dm-1', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when data mart is not in the caller project', async () => {
    const { service, dataMartService, accessDecisionService, blendableSchemaService } =
      createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(
      new NotFoundException('DataMart not found')
    );

    const command = new GetBlendableSchemaCommand('dm-1', 'other-proj', 'user-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
  });

  it('does not compute blendable schema when access is denied', async () => {
    const { service, blendableSchemaService } = createService(false);

    const command = new GetBlendableSchemaCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
  });

  it('performs project-scope check before the access check', async () => {
    const { service, dataMartService, accessDecisionService } = createService(true);

    const command = new GetBlendableSchemaCommand('dm-1', 'proj-1', 'user-1', ['viewer']);

    await service.run(command);

    const lookupOrder = dataMartService.getByIdAndProjectId.mock.invocationCallOrder[0];
    const accessOrder = accessDecisionService.canAccess.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(accessOrder);
  });
});
