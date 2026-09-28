import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDataMartIconService } from './update-data-mart-icon.service';
import { UpdateDataMartIconCommand } from '../dto/domain/update-data-mart-icon.command';
import { UpdateDataMartIconApiDto } from '../dto/presentation/update-data-mart-icon-api.dto';
import { CreateDataMartRequestApiDto } from '../dto/presentation/create-data-mart-request-api.dto';
import { DataMartIcon } from '../enums/data-mart-icon.enum';

describe('UpdateDataMartIconService', () => {
  const createService = (canEdit = true) => {
    const dataMart: { id: string; icon?: DataMartIcon | null } = { id: 'dm-1', icon: null };
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const mapper = { toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }) };
    const accessDecisionService = { canAccess: jest.fn().mockResolvedValue(canEdit) };

    const service = new UpdateDataMartIconService(
      dataMartService as never,
      mapper as never,
      accessDecisionService as never
    );

    return { service, dataMart, dataMartService };
  };

  it('saves the picked icon', async () => {
    const { service, dataMartService } = createService();

    await service.run(
      new UpdateDataMartIconCommand('dm-1', 'proj-1', DataMartIcon.PURCHASES, 'user-1', ['editor'])
    );

    expect(dataMartService.save).toHaveBeenCalledWith(
      expect.objectContaining({ icon: DataMartIcon.PURCHASES })
    );
  });

  it('resets the icon to the default with null', async () => {
    const { service, dataMart, dataMartService } = createService();
    dataMart.icon = DataMartIcon.SESSIONS;

    await service.run(new UpdateDataMartIconCommand('dm-1', 'proj-1', null, 'user-1', ['editor']));

    expect(dataMartService.save).toHaveBeenCalledWith(expect.objectContaining({ icon: null }));
  });

  it('rejects a user who cannot edit the Data Mart', async () => {
    const { service, dataMartService } = createService(false);

    await expect(
      service.run(
        new UpdateDataMartIconCommand('dm-1', 'proj-1', DataMartIcon.ORDERS, 'user-1', ['viewer'])
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataMartService.save).not.toHaveBeenCalled();
  });
});

describe('Data Mart icon request validation', () => {
  it.each([
    ['a known key', { icon: 'purchases' }],
    ['null', { icon: null }],
  ])('accepts %s on update', async (_label, body) => {
    const errors = await validate(plainToInstance(UpdateDataMartIconApiDto, body));
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['an unknown key', { icon: 'rocket' }],
    ['a body without icon', {}],
  ])('rejects %s on update', async (_label, body) => {
    const errors = await validate(plainToInstance(UpdateDataMartIconApiDto, body));
    expect(errors.map(e => e.property)).toEqual(['icon']);
  });

  it('accepts create without an icon and rejects an unknown one', async () => {
    const base = { title: 'Orders', storageId: 'st-1' };
    expect(await validate(plainToInstance(CreateDataMartRequestApiDto, base))).toHaveLength(0);
    const errors = await validate(
      plainToInstance(CreateDataMartRequestApiDto, { ...base, icon: 'rocket' })
    );
    expect(errors.map(e => e.property)).toEqual(['icon']);
  });
});
