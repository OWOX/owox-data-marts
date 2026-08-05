import { PLUGIN_COLLECTION_LIMITS } from '../constants/plugin-collection-limits';
import { PluginCollectionUsage } from '../entities/plugin-collection-usage.collection.entity';
import { PluginCollectionQuotaExceededError } from '../errors/plugin-collection.errors';
import { PluginCollectionQuotaService } from './plugin-collection-quota.service';

const usage = (
  level: PluginCollectionUsage['level'],
  totalBytes: number,
  documentCount = 0
): PluginCollectionUsage =>
  ({ level, totalBytes: String(totalBytes), documentCount }) as PluginCollectionUsage;

describe('PluginCollectionQuotaService', () => {
  const service = new PluginCollectionQuotaService();

  it('measures the serialized document in UTF-8 bytes', () => {
    expect(service.documentSize({ value: '😀' })).toBe(Buffer.byteLength('{"value":"😀"}', 'utf8'));
  });

  it('accepts exactly 1 MiB and rejects one byte more', () => {
    const envelopeBytes = Buffer.byteLength('{"value":""}', 'utf8');
    expect(
      service.documentSize({
        value: 'x'.repeat(PLUGIN_COLLECTION_LIMITS.maxDocumentBytes - envelopeBytes),
      })
    ).toBe(PLUGIN_COLLECTION_LIMITS.maxDocumentBytes);
    expect(() =>
      service.documentSize({
        value: 'x'.repeat(PLUGIN_COLLECTION_LIMITS.maxDocumentBytes - envelopeBytes + 1),
      })
    ).toThrow(PluginCollectionQuotaExceededError);
  });

  it.each([
    [
      'namespace documents',
      usage('namespace', 0, PLUGIN_COLLECTION_LIMITS.maxDocumentsPerNamespace),
      0,
      1,
    ],
    ['namespace bytes', usage('namespace', PLUGIN_COLLECTION_LIMITS.maxBytesPerNamespace), 1, 0],
    [
      'plugin/project bytes',
      usage('plugin-project', PLUGIN_COLLECTION_LIMITS.maxBytesPerPluginProject),
      1,
      0,
    ],
    ['project bytes', usage('project', PLUGIN_COLLECTION_LIMITS.maxBytesPerProject), 1, 0],
  ])('enforces %s', (_label, row, byteDelta, countDelta) => {
    expect(() => service.assertUsage([row], byteDelta, countDelta)).toThrow(
      PluginCollectionQuotaExceededError
    );
  });

  it('uses the update byte delta rather than charging the full replacement twice', () => {
    const row = usage('namespace', PLUGIN_COLLECTION_LIMITS.maxBytesPerNamespace - 10, 1);
    expect(() => service.assertUsage([row], 10, 0)).not.toThrow();
  });
});
