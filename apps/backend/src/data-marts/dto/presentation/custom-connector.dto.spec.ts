import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCustomConnectorRequestApiDto,
  SaveDraftRequestApiDto,
  TestConnectorRequestApiDto,
} from './custom-connector.dto';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(TestConnectorRequestApiDto, payload);
  const errors = await validate(dto);
  return { dto, errors };
}

const basePayload = {
  manifest: { name: 'Acme' },
  node: 'items',
  configuration: {},
};

describe('TestConnectorRequestApiDto', () => {
  it('accepts a valid maxRows/maxPages combination', async () => {
    const { errors } = await validateDto({ ...basePayload, maxRows: 100, maxPages: 10 });

    expect(errors).toHaveLength(0);
  });

  it('accepts omitted maxRows/maxPages (both optional)', async () => {
    const { errors } = await validateDto({ ...basePayload });

    expect(errors).toHaveLength(0);
  });

  it.each([-1, 0, 999999])('rejects maxRows=%d', async maxRows => {
    const { errors } = await validateDto({ ...basePayload, maxRows });

    expect(errors.map(error => error.property)).toContain('maxRows');
  });

  it.each([-1, 0, 9999])('rejects maxPages=%d', async maxPages => {
    const { errors } = await validateDto({ ...basePayload, maxPages });

    expect(errors.map(error => error.property)).toContain('maxPages');
  });

  it('accepts the maxRows/maxPages boundary values', async () => {
    const { errors } = await validateDto({ ...basePayload, maxRows: 1000, maxPages: 50 });

    expect(errors).toHaveLength(0);
  });
});

/**
 * Ceilings mirrored from custom-connector.dto.ts. Deliberately re-stated rather than imported:
 * these numbers are a reasoned trade-off against a kernel limit, not an incidental detail, so the
 * assertions have to fail when someone moves them. Importing the constants would make every
 * boundary case below follow the change instead of catching it.
 */
const MAX_MANIFEST_SIZE_BYTES = 120 * 1024;
/** MySQL VARCHAR default length, in characters -- what `name`, `title` and `docUrl` land in. */
const MAX_VARCHAR_LENGTH = 255;
/** MySQL TEXT capacity, in bytes -- what `description` and `logo` land in. */
const MAX_TEXT_COLUMN_BYTES = 65535;

/**
 * Builds a manifest whose `JSON.stringify` byte length is exactly `bytes` -- the same measurement
 * MaxJsonSize makes. `JSON.stringify({ pad: 'x'.repeat(n) })` is `{"pad":"<n x's>"}`: 10 bytes of
 * envelope plus the padding.
 */
function manifestOfSize(bytes: number): Record<string, unknown> {
  return { pad: 'x'.repeat(bytes - 10) };
}

const manifestDtos: {
  label: string;
  cls: ClassConstructor<object>;
  withManifest: (manifest: Record<string, unknown>) => Record<string, unknown>;
}[] = [
  {
    label: 'CreateCustomConnectorRequestApiDto',
    cls: CreateCustomConnectorRequestApiDto,
    withManifest: manifest => ({ name: 'MyCustomApi', title: 'My Custom API', manifest }),
  },
  {
    label: 'SaveDraftRequestApiDto',
    cls: SaveDraftRequestApiDto,
    withManifest: manifest => ({ manifest }),
  },
  {
    label: 'TestConnectorRequestApiDto',
    cls: TestConnectorRequestApiDto,
    withManifest: manifest => ({ manifest, node: 'items', configuration: {} }),
  },
];

/**
 * A stored manifest is handed to the connector child through the OW_MANIFEST environment variable,
 * and Linux refuses a single env string past MAX_ARG_STRLEN (131072 bytes) with an opaque
 * `spawn E2BIG`. By then the connector is published and bound to a Data Mart, so the ceiling has to
 * bite here, at authoring time, where the error still tells the author something they can act on.
 *
 * All three request shapes carry a manifest and they are three separate classes, so a decorator
 * added to one is easy to miss on the others -- each is exercised on its own.
 */
describe('manifest size ceiling', () => {
  it('pads to exactly the byte length MaxJsonSize measures', () => {
    // Guards the helper itself: every boundary case below only means something while this holds.
    for (const size of [
      MAX_MANIFEST_SIZE_BYTES - 1,
      MAX_MANIFEST_SIZE_BYTES,
      MAX_MANIFEST_SIZE_BYTES + 1,
    ]) {
      expect(Buffer.byteLength(JSON.stringify(manifestOfSize(size)), 'utf8')).toBe(size);
    }
  });

  describe.each(manifestDtos)('$label', ({ cls, withManifest }) => {
    it('rejects a manifest one byte over the ceiling', async () => {
      const dto = plainToInstance(cls, withManifest(manifestOfSize(MAX_MANIFEST_SIZE_BYTES + 1)));

      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'manifest',
            constraints: expect.objectContaining({ maxJsonSize: expect.any(String) }),
          }),
        ])
      );
    });

    it.each([MAX_MANIFEST_SIZE_BYTES - 1, MAX_MANIFEST_SIZE_BYTES])(
      'accepts a manifest of exactly %d bytes',
      async size => {
        const dto = plainToInstance(cls, withManifest(manifestOfSize(size)));

        await expect(validate(dto)).resolves.toEqual([]);
      }
    );
  });
});

/**
 * The test request carries a second payload that reaches the same spawn: `configuration` becomes
 * OW_CONFIG, a sibling environment string subject to the same MAX_ARG_STRLEN. Bounding only the
 * manifest leaves the identical E2BIG one field to the right.
 */
describe('test configuration size ceiling', () => {
  const withConfiguration = (configuration: Record<string, unknown>) => ({
    manifest: { name: 'Acme' },
    node: 'items',
    configuration,
  });

  it('rejects a configuration one byte over the ceiling', async () => {
    const dto = plainToInstance(
      TestConnectorRequestApiDto,
      withConfiguration(manifestOfSize(MAX_MANIFEST_SIZE_BYTES + 1))
    );

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'configuration',
          constraints: expect.objectContaining({ maxJsonSize: expect.any(String) }),
        }),
      ])
    );
  });

  it('accepts a configuration of exactly the ceiling', async () => {
    const dto = plainToInstance(
      TestConnectorRequestApiDto,
      withConfiguration(manifestOfSize(MAX_MANIFEST_SIZE_BYTES))
    );

    await expect(validate(dto)).resolves.toEqual([]);
  });
});

/**
 * The logo is bounded on its own terms rather than the manifest's. It never reaches the child
 * process -- ConnectorExecutorService.stripManifestForRunner drops it before the spawn, and the
 * stored column is never folded back into a resolved manifest -- so MAX_ARG_STRLEN does not apply
 * to it. What does apply is the column it lands in and the list endpoint, which returns the logo
 * inline for every definition in the project, so an unbounded one is amplified across the whole
 * list instead of costing only its own record.
 */
describe('CreateCustomConnectorRequestApiDto logo ceiling', () => {
  const withLogo = (logo: string) => ({
    name: 'MyCustomApi',
    title: 'My Custom API',
    manifest: { name: 'Acme' },
    logo,
  });

  it('rejects a logo one byte over the ceiling', async () => {
    const dto = plainToInstance(
      CreateCustomConnectorRequestApiDto,
      withLogo('x'.repeat(MAX_TEXT_COLUMN_BYTES + 1))
    );

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'logo' })])
    );
  });

  it.each([MAX_TEXT_COLUMN_BYTES - 1, MAX_TEXT_COLUMN_BYTES])(
    'accepts a logo of exactly %d bytes',
    async size => {
      const dto = plainToInstance(CreateCustomConnectorRequestApiDto, withLogo('x'.repeat(size)));

      await expect(validate(dto)).resolves.toEqual([]);
    }
  );

  /**
   * The ceiling is the capacity of a MySQL TEXT column, which is 65535 BYTES however many
   * characters that is. A character count would accept a value up to three times too long,
   * and MySQL answers that with ER_DATA_TOO_LONG in strict mode or a silent truncation
   * otherwise -- a corrupt base64 image nobody is told about. SQLite ignores declared column
   * lengths entirely, so nothing local would have caught it.
   */
  it('counts the logo in bytes, not characters', async () => {
    // 30000 '€' is 90000 bytes: over the ceiling in bytes, well under it in characters.
    const multiByte = '€'.repeat(30000);
    expect(multiByte.length).toBeLessThan(MAX_TEXT_COLUMN_BYTES);
    expect(Buffer.byteLength(multiByte, 'utf8')).toBeGreaterThan(MAX_TEXT_COLUMN_BYTES);

    const dto = plainToInstance(CreateCustomConnectorRequestApiDto, withLogo(multiByte));

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'logo' })])
    );
  });

  it('leaves an omitted logo alone', async () => {
    const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
      name: 'MyCustomApi',
      title: 'My Custom API',
      manifest: { name: 'Acme' },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});

/**
 * Every one of these lands in a column the migration declares, and the deployment target is
 * MySQL: `name`, `title` and `docUrl` are `varchar` (TypeORM's default length, 255) and
 * `description` is `text` (65535 bytes). Unbounded, an over-long value is ER_DATA_TOO_LONG --
 * a 500 -- in strict mode, or a silent truncation otherwise: a clipped title nobody notices.
 *
 * None of it shows up locally, because DbType is `sqlite | mysql` and SQLite ignores declared
 * column lengths altogether, so the whole suite stays green on a value MySQL would refuse.
 *
 * The unit follows the column: MySQL counts VARCHAR(N) in CHARACTERS but caps TEXT in BYTES.
 */
describe('CreateCustomConnectorRequestApiDto field ceilings', () => {
  const valid = { name: 'MyCustomApi', title: 'My Custom API', manifest: { name: 'Acme' } };

  describe.each([
    { field: 'name', filler: 'a' },
    { field: 'title', filler: 'x' },
    { field: 'docUrl', filler: 'u' },
  ])('$field, a varchar column', ({ field, filler }) => {
    it(`rejects a ${field} one character over the varchar length`, async () => {
      const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
        ...valid,
        [field]: filler.repeat(MAX_VARCHAR_LENGTH + 1),
      });

      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ property: field })])
      );
    });

    it(`accepts a ${field} of exactly the varchar length`, async () => {
      const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
        ...valid,
        [field]: filler.repeat(MAX_VARCHAR_LENGTH),
      });

      await expect(validate(dto)).resolves.toEqual([]);
    });
  });

  it('rejects a description one byte over the text column capacity', async () => {
    const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
      ...valid,
      description: 'd'.repeat(MAX_TEXT_COLUMN_BYTES + 1),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'description' })])
    );
  });

  it('counts the description in bytes, not characters', async () => {
    const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
      ...valid,
      description: '€'.repeat(30000),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'description' })])
    );
  });

  it('accepts a description of exactly the text column capacity', async () => {
    const dto = plainToInstance(CreateCustomConnectorRequestApiDto, {
      ...valid,
      description: 'd'.repeat(MAX_TEXT_COLUMN_BYTES),
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
