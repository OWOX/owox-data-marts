import { processBatches } from './batch-processor';

describe('processBatches', () => {
  it('should process empty array', async () => {
    const processor = jest.fn().mockResolvedValue('result');

    const results = await processBatches([], processor);

    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('should process all items when count is less than batch size', async () => {
    const items = [1, 2, 3];
    const processor = jest.fn().mockImplementation(async (item: number) => item * 2);

    const results = await processBatches(items, processor, 10);

    expect(results).toEqual([2, 4, 6]);
    expect(processor).toHaveBeenCalledTimes(3);
  });

  it('should handle the last incomplete batch', async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = jest.fn().mockResolvedValue('done');

    const results = await processBatches(items, processor, 3);

    // First batch: 3 items, second batch: 2 items
    expect(results).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(processor).toHaveBeenCalledTimes(5);
  });

  it('should preserve order of results', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const processor = jest.fn().mockImplementation(async (item: string) => item.toUpperCase());

    const results = await processBatches(items, processor, 2);

    expect(results).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should propagate processor errors', async () => {
    const items = [1, 2, 3];
    const processor = jest.fn().mockImplementation(async (item: number) => {
      if (item === 2) throw new Error('Processing failed');
      return item;
    });

    await expect(processBatches(items, processor, 3)).rejects.toThrow('Processing failed');
  });
});
