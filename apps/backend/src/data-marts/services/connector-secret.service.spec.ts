import type { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { SpecificationConnectorService } from '../use-cases/connector/specification-connector.service';
import { ConnectorSecretService, SECRET_MASK } from './connector-secret.service';

describe('ConnectorSecretMaskingService', () => {
  const createService = (secretFields: string[]) => {
    const specService = {
      run: jest
        .fn()
        .mockResolvedValue(secretFields.map(name => ({ name, attributes: ['SECRET'] }))),
    } as unknown as SpecificationConnectorService;

    const service = new ConnectorSecretService(specService);
    return { service, specService };
  };

  const makeDefinition = (configItems: Array<Record<string, unknown>>): ConnectorDefinition => {
    return {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: configItems,
          node: 'ad-account-user',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    } as unknown as ConnectorDefinition;
  };

  describe('mask', () => {
    it('masks secret fields using SECRET_MASK', async () => {
      const { service } = createService(['AccessToken']);
      const def = makeDefinition([
        { _id: 'a', AccessToken: 'token-a', AccoundIDs: '33' },
        { _id: 'b', AccessToken: 'token-b', AccoundIDs: '22' },
      ]);

      const masked = await service.mask(def);
      expect(masked).toBeDefined();
      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[1].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0].AccoundIDs).toBe('33');
      expect(cfg[1].AccoundIDs).toBe('22');
    });

    it('returns original definition if no secret fields in spec', async () => {
      const { service } = createService([]);
      const def = makeDefinition([{ _id: 'a', AccoundIDs: '33' }]);
      const masked = await service.mask(def);
      expect(masked).toBe(def);
    });
  });

  describe('mergeDefinitionSecrets', () => {
    it('keeps previous secret when incoming has SECRET_MASK', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([
        { _id: 'a', AccessToken: 'prev-a', AccoundIDs: '33' },
        { _id: 'b', AccessToken: 'prev-b', AccoundIDs: '22' },
      ]);
      const incoming = makeDefinition([
        { _id: 'a', AccessToken: SECRET_MASK, AccoundIDs: '33' },
        { _id: 'b', AccessToken: SECRET_MASK, AccoundIDs: '22' },
      ]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[1].AccessToken).toBe('prev-b');
    });

    it('keeps previous secret when incoming omits secret field (omit-key)', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a', AccoundIDs: '33' }]);
      const incoming = makeDefinition([{ _id: 'a', AccoundIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[0].AccoundIDs).toBe('33');
    });

    it('updates secret when incoming provides new string', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ _id: 'a', AccessToken: 'new-a' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('new-a');
    });

    it('does not merge when _id is missing (new item) and assigns an _id', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ AccoundIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(typeof cfg[0]._id).toBe('string');
      expect((cfg[0]._id as string).length).toBeGreaterThan(0);
      expect(cfg[0].AccoundIDs).toBe('33');
    });

    it('keeps current when previous item with same _id not found', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'x', AccessToken: 'prev-x' }]);
      const incoming = makeDefinition([{ _id: 'y', AccessToken: SECRET_MASK }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0]._id).toBe('y');
    });
  });
});
