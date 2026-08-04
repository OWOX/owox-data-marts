import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportFileName, downloadBlob } from './download';
import { slugify } from './slug';

describe('slugify', () => {
  it('slugifies titles and falls back when nothing survives', () => {
    expect(slugify('BigQuery (Common)', 'model')).toBe('bigquery-common');
    expect(slugify('***', 'model')).toBe('model');
  });
});

describe('buildExportFileName', () => {
  it('combines the storage slug with the current date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T12:00:00Z'));
    expect(buildExportFileName('BigQuery (Common)')).toBe('bigquery-common-2026-08-04');
    expect(buildExportFileName(undefined)).toBe('data-marts-model-2026-08-04');
    vi.useRealTimers();
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads through a temporary object URL and revokes it', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => void 0);

    downloadBlob(new Blob(['content']), 'model.json');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
