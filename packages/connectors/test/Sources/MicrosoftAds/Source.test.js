import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUtilsPath = path.join(__dirname, '../../../src/Core/Utils/FileUtils.js');
const coreSourcePath = path.join(__dirname, '../../../src/Core/AbstractSource.js');
const helperPath = path.join(__dirname, '../../../src/Sources/MicrosoftAds/Helper.js');
const sourcePath = path.join(__dirname, '../../../src/Sources/MicrosoftAds/Source.js');

// GAS-style files: `var X = ...` lands on globalThis, but Helper.js uses a top-level
// `const`, which only enters the global lexical scope — read it back with a vm eval.
loadGasClass(fileUtilsPath);
loadGasClass(coreSourcePath);
loadGasClass(helperPath);
loadGasClass(sourcePath);
const MicrosoftAdsHelper = vm.runInThisContext('MicrosoftAdsHelper');
const proto = globalThis.MicrosoftAdsSource.prototype;

const CSV_FIXTURE = [
  'Type,Id,Parent Id,Keyword',
  'Format Version,,,6.0',
  'Keyword,101,201,"running shoes"',
  'Keyword,102,201,"say ""hi"" now"',
  '',
  'Keyword,103,202,plain term',
].join('\n');

describe('processCsvTextInChunks', () => {
  const collectChunks = async (csvText, chunkSize) => {
    const chunks = [];
    await MicrosoftAdsHelper.processCsvTextInChunks(
      csvText,
      async chunk => {
        chunks.push(chunk);
      },
      chunkSize
    );
    return chunks;
  };

  it('produces the same records as the legacy csvRowsToObjects pipeline', async () => {
    const legacy = MicrosoftAdsHelper.csvRowsToObjects(globalThis.FileUtils.parseCsv(CSV_FIXTURE));
    const chunks = await collectChunks(CSV_FIXTURE, 2000);

    expect(chunks.flat()).toEqual(legacy);
    expect(chunks.flat()).toEqual([
      { Type: 'Keyword', Id: '101', ParentId: '201', Keyword: 'running shoes' },
      { Type: 'Keyword', Id: '102', ParentId: '201', Keyword: 'say "hi" now' },
      { Type: 'Keyword', Id: '103', ParentId: '202', Keyword: 'plain term' },
    ]);
  });

  it('flushes full chunks as they fill and a final partial chunk', async () => {
    const header = 'Id,Keyword';
    const rows = Array.from({ length: 5 }, (_, i) => `${i},term${i}`);
    const chunks = await collectChunks([header, ...rows].join('\n'), 2);

    expect(chunks.map(c => c.length)).toEqual([2, 2, 1]);
    expect(chunks.flat().map(r => r.Id)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('handles an empty file (header only) without invoking the callback', async () => {
    const chunks = await collectChunks('Id,Keyword\n', 2000);
    expect(chunks).toEqual([]);
  });
});

describe('_fetchEntityByCampaigns streaming', () => {
  const makeFakeSource = downloadEntityBatch => {
    const logs = [];
    return {
      logs,
      config: { logMessage: message => logs.push(message) },
      _downloadEntityBatch: downloadEntityBatch,
    };
  };

  it('streams chunks straight to onBatchReady and logs the accumulated count', async () => {
    const campaignIds = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fake = makeFakeSource(async ({ campaignBatch, onRecordsChunk }) => {
      // Two chunks per batch, one record per campaign in each
      await onRecordsChunk(campaignBatch.map(id => ({ Id: `${id}-a` })));
      await onRecordsChunk(campaignBatch.map(id => ({ Id: `${id}-b` })));
      return [];
    });

    const received = [];
    await proto._fetchEntityByCampaigns.call(fake, {
      accountId: '1',
      entityType: 'Keywords',
      campaignIds,
      onBatchReady: async records => received.push(...records),
    });

    // batchSize = min(50, floor(20/10)) = 2 -> 10 batches x 2 campaigns x 2 chunks
    expect(received).toHaveLength(40);
    expect(fake.logs).toContain('Fetched 4 keywords from current batch');
  });

  it('halves the batch size and refetches each campaign exactly once on the 100MB limit', async () => {
    const campaignIds = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fetchCounts = new Map();
    let threw = false;
    const fake = makeFakeSource(async ({ campaignBatch, onRecordsChunk }) => {
      if (campaignBatch.length > 1 && !threw) {
        threw = true;
        throw new Error('Download exceeds 100MB limit');
      }
      campaignBatch.forEach(id => fetchCounts.set(id, (fetchCounts.get(id) ?? 0) + 1));
      await onRecordsChunk(campaignBatch.map(id => ({ Id: id })));
      return [];
    });

    const received = [];
    await proto._fetchEntityByCampaigns.call(fake, {
      accountId: '1',
      entityType: 'Keywords',
      campaignIds,
      onBatchReady: async records => received.push(...records),
    });

    // The retried range must not be fetched again by the outer loop
    expect(received).toHaveLength(20);
    campaignIds.forEach(id => expect(fetchCounts.get(id)).toBe(1));
    expect(fake.logs.some(m => m.includes('retrying with smaller batch size: 1'))).toBe(true);
  });

  it('does not halve the batch when a storage error mentions 100MB', async () => {
    const campaignIds = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const fake = makeFakeSource(async ({ campaignBatch, onRecordsChunk }) => {
      await onRecordsChunk(campaignBatch.map(id => ({ Id: id })));
      return [];
    });

    await expect(
      proto._fetchEntityByCampaigns.call(fake, {
        accountId: '1',
        entityType: 'Keywords',
        campaignIds,
        onBatchReady: async () => {
          throw new Error('BigQuery: request payload exceeds 100MB');
        },
      })
    ).rejects.toThrow('Failed to fetch Keywords: BigQuery: request payload exceeds 100MB');
    expect(fake.logs.some(m => m.includes('retrying with smaller batch size'))).toBe(false);
  });
});

describe('_downloadEntity streaming', () => {
  it('streams records per zip file with per-file headers and returns []', async () => {
    const submitUrl = 'https://bulk.test/submit';
    const fileUrl = 'https://bulk.test/result.zip';
    const originalHttpUtils = globalThis.HttpUtils;
    const originalUnzip = globalThis.FileUtils.unzip;
    globalThis.HttpUtils = {
      fetch: async url => {
        if (url === submitUrl) {
          return { getContentText: async () => JSON.stringify({ DownloadRequestId: 'r1' }) };
        }
        if (url.includes('BulkDownloadStatus')) {
          return {
            getContentText: async () =>
              JSON.stringify({ RequestStatus: 'Completed', ResultFileUrl: fileUrl }),
          };
        }
        return { getBlob: async () => 'zip-bytes' };
      },
    };
    globalThis.FileUtils.unzip = () => [
      { getDataAsString: () => 'Id,Name\n1,a\n2,b' },
      { getDataAsString: () => 'Code,Label\n9,x' },
    ];

    try {
      const chunks = [];
      const result = await proto._downloadEntity.call(
        {},
        {
          submitUrl,
          submitOpts: {},
          onRecordsChunk: async chunk => chunks.push(chunk),
        }
      );

      expect(result).toEqual([]);
      // Each zip entry gets its own header — the legacy array pipeline reused the
      // first file's header and emitted later header rows as junk records
      expect(chunks.flat()).toEqual([
        { Id: '1', Name: 'a' },
        { Id: '2', Name: 'b' },
        { Code: '9', Label: 'x' },
      ]);
    } finally {
      globalThis.HttpUtils = originalHttpUtils;
      globalThis.FileUtils.unzip = originalUnzip;
    }
  });
});
