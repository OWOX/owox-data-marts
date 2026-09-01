import { validate } from 'class-validator';
import { InstallPluginApiDto } from './plugin-installation-api.dto';

describe('InstallPluginApiDto', () => {
  it('accepts string Credential ids and explicit optional skips', async () => {
    const dto = Object.assign(new InstallPluginApiDto(), {
      expectedVersionId: null,
      credentialSelections: {
        github: '4ce611b1-d178-49f1-a677-1d1156c5acbf',
        openai: null,
      },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each([[['not', 'a', 'string']], [42], [{ id: 'nested' }]])(
    'rejects a non-string Credential selection value',
    async invalidValue => {
      const dto = Object.assign(new InstallPluginApiDto(), {
        expectedVersionId: null,
        credentialSelections: { github: invalidValue },
      });

      expect(await validate(dto)).not.toEqual([]);
    }
  );
});
