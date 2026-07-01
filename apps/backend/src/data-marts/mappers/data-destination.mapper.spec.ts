import { BadRequestException } from '@nestjs/common';
import { DataDestinationMapper } from './data-destination.mapper';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

/**
 * `normalizeDestinationConfig` is exercised through the public `toCreateCommand`.
 * It only reads the DTO (no injected services are used on this path), so the
 * mapper can be constructed with stub dependencies.
 */
describe('DataDestinationMapper - destination config normalization', () => {
  const mapper = new DataDestinationMapper(null as never, null as never, null as never);
  const context = { projectId: 'proj-1', userId: 'user-1', roles: [] } as never;
  const dtoWithConfig = (config: unknown) =>
    ({ title: 'Dest', type: DataDestinationType.GOOGLE_SHEETS, config }) as never;

  it('derives folderId from a valid Drive folder URL', () => {
    const command = mapper.toCreateCommand(
      context,
      dtoWithConfig({ folderUrl: 'https://drive.google.com/drive/folders/ABC123' })
    );

    expect(command.config).toEqual({
      folderUrl: 'https://drive.google.com/drive/folders/ABC123',
      folderId: 'ABC123',
    });
  });

  it('rejects a non-empty folder URL that yields no folder id', () => {
    expect(() =>
      mapper.toCreateCommand(context, dtoWithConfig({ folderUrl: 'not a folder ###' }))
    ).toThrow(BadRequestException);
  });

  it('returns nulls when the folder URL is cleared', () => {
    const command = mapper.toCreateCommand(context, dtoWithConfig({ folderUrl: '' }));

    expect(command.config).toEqual({ folderUrl: null, folderId: null });
  });

  it('leaves config untouched (undefined) when none is sent', () => {
    const command = mapper.toCreateCommand(context, dtoWithConfig(undefined));

    expect(command.config).toBeUndefined();
  });
});
