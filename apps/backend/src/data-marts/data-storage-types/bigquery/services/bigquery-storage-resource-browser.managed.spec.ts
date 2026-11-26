import { BigQueryStorageResourceBrowser } from './bigquery-storage-resource-browser.service';
import type { DataStorage } from '../../../entities/data-storage.entity';

const mockDatasets = jest.fn();
const mockGetTables = jest.fn();
const mockDataset = jest.fn();
const mockGetMetadata = jest.fn();
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn().mockImplementation(() => ({
    projectId: 'proj-abc',
    getDatasets: mockDatasets,
    dataset: mockDataset,
  })),
}));

describe('BigQueryStorageResourceBrowser (managed)', () => {
  const storage = { config: { projectId: 'proj-abc', location: 'US' } } as unknown as DataStorage;
  const browser = new BigQueryStorageResourceBrowser({
    resolve: () =>
      Promise.resolve({
        type: 'bigquery_managed',
        authClient: {},
        datasetId: 'owox_abc',
        internalDatasetId: 'owox_abc_internal',
      }),
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatasets.mockResolvedValue([
      [
        { id: 'owox_abc', metadata: { location: 'US' } },
        { id: 'owox_abc_internal', metadata: { location: 'US' } },
      ],
    ]);
    mockGetTables.mockResolvedValue([[{ id: 't', metadata: { type: 'TABLE' } }]]);
    mockGetMetadata.mockResolvedValue([{ location: 'US' }]);
    mockDataset.mockReturnValue({ getTables: mockGetTables, getMetadata: mockGetMetadata });
  });

  it('lists only the storage project as the namespace, named OWOX Storage', async () => {
    expect(await browser.listNamespaces(storage)).toEqual([
      { id: 'proj-abc', displayName: 'OWOX Storage' },
    ]);
  });

  it('lists only the customer dataset of a managed storage', async () => {
    const leaves = await browser.listLeafResources(storage, 'proj-abc');

    expect(mockDataset.mock.calls).toEqual(
      mockDataset.mock.calls.map(() => ['owox_abc', { projectId: 'proj-abc' }])
    );
    expect(JSON.stringify(leaves)).not.toContain('internal');
  });

  // The datasets project holds the datasets of every OWOX Storage.
  it('reads the dataset of the storage, not the dataset list of the project', async () => {
    const leaves = await browser.listLeafResources(storage, 'proj-abc');

    expect(mockDatasets).not.toHaveBeenCalled();
    expect(leaves).toEqual([expect.objectContaining({ location: 'US' })]);
  });
});
