import { measureExecutionTime, toMeasuredExecutionBaseResult } from './measure-execution-time';

describe('measureExecutionTime', () => {
  it('returns callable result and full timing metadata', async () => {
    const times = [100, 145];
    const onMeasured = jest.fn();
    const measured = await measureExecutionTime(async () => 42, {
      onMeasured,
      now: () => times.shift()!,
    });

    expect(measured.status).toBe('ok');
    expect(measured.start).toBe(100);
    expect(measured.end).toBe(145);
    expect(measured.executionTimeMs).toBe(45);
    expect(measured.result).toBe(42);
    expect(toMeasuredExecutionBaseResult(measured)).toEqual({
      status: 'ok',
      start: 100,
      end: 145,
      executionTimeMs: 45,
    });
    expect(onMeasured).toHaveBeenCalledWith(measured);
  });

  it('rethrows callable error and reports failed timing metadata', async () => {
    const times = [10, 40];
    const onMeasured = jest.fn();

    await expect(
      measureExecutionTime(
        async () => {
          throw new Error('boom');
        },
        { onMeasured, now: () => times.shift()! }
      )
    ).rejects.toThrow('boom');

    expect(onMeasured).toHaveBeenCalledWith({
      status: 'failed',
      start: 10,
      end: 40,
      executionTimeMs: 30,
    });

    const failedMeasured = onMeasured.mock.calls[0][0];
    expect(toMeasuredExecutionBaseResult(failedMeasured)).toEqual({
      status: 'failed',
      start: 10,
      end: 40,
      executionTimeMs: 30,
    });
  });
});
