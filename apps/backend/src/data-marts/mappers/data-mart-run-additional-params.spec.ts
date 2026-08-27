import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { HTTP_DATA_PARAMS_KEY } from '../services/http-data/http-data.constants';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { DataMartMapper } from './data-mart.mapper';

/**
 * An Excel run is written by recordHttpDataRun, so its params sit under `httpData` — but the
 * row is typed EXCEL. Gating the response on HTTP_DATA alone dropped the whole subtree, so run
 * history showed an Excel run with no configuration and no totals.
 */
describe('DataMartMapper run params, by run shape', () => {
  const mapper = new DataMartMapper(
    undefined as never,
    {
      mask: jest.fn(),
    } as never
  );

  function runOfType(type: DataMartRunType): DataMartRunDto {
    return {
      type,
      additionalParams: {
        [HTTP_DATA_PARAMS_KEY]: { rowCount: 42, totals: { revenue: 10 } },
      },
    } as unknown as DataMartRunDto;
  }

  it.each([DataMartRunType.HTTP_DATA, DataMartRunType.EXCEL])(
    'exposes the httpData subtree and lifts its totals for %s',
    async type => {
      const response = await mapper.toRunResponse(runOfType(type));

      expect(response.additionalParams).toEqual({ [HTTP_DATA_PARAMS_KEY]: { rowCount: 42 } });
      expect(response.totals).toEqual({ revenue: 10 });
    }
  );

  it('keeps a server-written report run masked', async () => {
    // Its params are internal run state; `totals` would be at the top level, not nested here.
    const response = await mapper.toRunResponse(runOfType(DataMartRunType.GOOGLE_SHEETS_EXPORT));

    expect(response.additionalParams).toBeNull();
    expect(response.totals).toBeNull();
  });
});
