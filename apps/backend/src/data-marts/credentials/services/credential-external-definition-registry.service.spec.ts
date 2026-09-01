jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
jest.mock('../../../common/helpers/safe-url.helper', () => ({
  assertPublicHttpUrl: jest.fn((rawUrl: string) => Promise.resolve(new URL(rawUrl))),
}));

import { BadRequestException } from '@nestjs/common';
import type { CredentialDefinitionVersion } from '../entities/credential-definition-version.entity';
import type { CredentialExternalDefinition } from '../entities/credential-external-definition.entity';
import { CredentialExternalDefinitionRegistryService } from './credential-external-definition-registry.service';

function setup(databaseType: 'sqlite' | 'better-sqlite3' | 'mysql' = 'better-sqlite3') {
  const definitions: CredentialExternalDefinition[] = [];
  const versions: CredentialDefinitionVersion[] = [];
  const definitionRepository = {
    findOneBy: jest.fn(criteria =>
      Promise.resolve(
        definitions.find(row =>
          Object.entries(criteria).every(([key, value]) => row[key as keyof typeof row] === value)
        ) ?? null
      )
    ),
    create: jest.fn(value => value),
    save: jest.fn(value => {
      if (!value.id) value.id = `definition-${definitions.length + 1}`;
      const index = definitions.findIndex(row => row.id === value.id);
      if (index < 0) definitions.push(value);
      else definitions[index] = value;
      return Promise.resolve(value);
    }),
    createQueryBuilder: jest.fn(() => {
      let id: string | undefined;
      const builder = {
        where: jest.fn((_condition: string, parameters: { definitionId: string }) => {
          id = parameters.definitionId;
          return builder;
        }),
        setLock: jest.fn(() => builder),
        getOne: jest.fn(() => Promise.resolve(definitions.find(row => row.id === id) ?? null)),
      };
      return builder;
    }),
  };
  const versionRepository = {
    findOneBy: jest.fn(criteria =>
      Promise.resolve(
        versions.find(row =>
          Object.entries(criteria).every(([key, value]) => row[key as keyof typeof row] === value)
        ) ?? null
      )
    ),
    create: jest.fn(value => value),
    save: jest.fn(value => {
      if (!value.id) value.id = `version-${versions.length + 1}`;
      versions.push(value);
      return Promise.resolve(value);
    }),
  };
  return {
    service: new CredentialExternalDefinitionRegistryService(
      definitionRepository as never,
      versionRepository as never,
      { options: { type: databaseType } } as never
    ),
    definitions,
    versions,
    definitionRepository,
  };
}

const input = (semver: string, overrides: Record<string, unknown> = {}) => ({
  githubRepoId: '123',
  repoOwner: 'acme',
  repoName: 'credentials',
  semver,
  commitSha: semver.replaceAll('.', '').padEnd(40, 'a'),
  githubReleaseId: semver,
  tagName: `v${semver}`,
  contract: {
    id: 'acme',
    displayName: 'Acme',
    description: '',
    auth: {
      type: 'header' as const,
      label: 'API key',
      headerName: 'authorization',
      prefix: 'Bearer ',
    },
    origins: ['https://api.acme.example'],
  },
  ...overrides,
});

describe('CredentialExternalDefinitionRegistryService', () => {
  it('does not request an unsupported pessimistic lock from better-sqlite3', async () => {
    const state = setup('better-sqlite3');

    await state.service.register(input('1.0.0'));

    const builder = state.definitionRepository.createQueryBuilder.mock.results[0]?.value;
    expect(builder.setLock).not.toHaveBeenCalled();
  });

  it('keeps the write lock for a database driver that supports it', async () => {
    const state = setup('mysql');

    await state.service.register(input('1.0.0'));

    const builder = state.definitionRepository.createQueryBuilder.mock.results[0]?.value;
    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write');
  });

  it('keeps stable repository identity across rename and automatically advances within a line', async () => {
    const state = setup();
    const first = await state.service.register(input('1.0.0'));
    const second = await state.service.register(
      input('1.1.0', { repoOwner: 'new-owner', repoName: 'new-name' })
    );

    expect(second.definitionId).toBe(first.definitionId);
    expect(state.definitions).toHaveLength(1);
    expect(state.definitions[0]).toMatchObject({
      repoOwner: 'new-owner',
      repoName: 'new-name',
      currentCompatibilityLine: '1',
      nextSyncAt: expect.any(Date),
    });
  });

  it('accepts a breaking contract on a new line and rejects it inside the same line', async () => {
    const state = setup();
    await state.service.register(input('1.0.0'));
    await expect(
      state.service.register(
        input('2.0.0', {
          contract: { ...input('2.0.0').contract, origins: ['https://v2.acme.example'] },
        })
      )
    ).resolves.toMatchObject({ compatibilityLine: '2' });
    await expect(
      state.service.register(
        input('2.1.0', {
          contract: { ...input('2.1.0').contract, origins: ['https://other.acme.example'] },
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows compatible metadata and an added AI interface within a line', async () => {
    const state = setup();
    await state.service.register(input('1.0.0'));

    await expect(
      state.service.register(
        input('1.1.0', {
          contract: {
            ...input('1.1.0').contract,
            displayName: 'Renamed Acme',
            auth: {
              type: 'header',
              label: 'Token',
              headerName: 'authorization',
              prefix: 'Bearer ',
            },
            ai: {
              adapter: 'openai-compatible',
              baseUrl: 'https://api.acme.example/v1',
            },
          },
        })
      )
    ).resolves.toMatchObject({ compatibilityLine: '1' });
  });

  it.each([
    [
      'authentication header',
      {
        ...input('1.1.0').contract,
        auth: { type: 'header' as const, label: 'Token', headerName: 'x-api-key' },
      },
    ],
    [
      'authentication prefix',
      {
        ...input('1.1.0').contract,
        auth: {
          type: 'header' as const,
          label: 'Token',
          headerName: 'authorization',
          prefix: 'Token ',
        },
      },
    ],
    [
      'AI base URL',
      {
        ...input('1.1.0').contract,
        ai: {
          adapter: 'openai-compatible' as const,
          baseUrl: 'https://api.acme.example/v2',
        },
      },
    ],
  ])('requires a new compatibility line when changing the %s', async (_label, contract) => {
    const state = setup();
    await state.service.register(
      input('1.0.0', {
        contract:
          _label === 'AI base URL'
            ? {
                ...input('1.0.0').contract,
                ai: {
                  adapter: 'openai-compatible',
                  baseUrl: 'https://api.acme.example/v1',
                },
              }
            : input('1.0.0').contract,
      })
    );

    await expect(state.service.register(input('1.1.0', { contract }))).rejects.toThrow(
      'publish a new compatibility line'
    );
  });
});
