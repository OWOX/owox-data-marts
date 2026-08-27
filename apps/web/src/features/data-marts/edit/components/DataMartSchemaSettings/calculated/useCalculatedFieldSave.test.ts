import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DataMartSchema } from '../../../../shared/types/data-mart-schema.types';
import { useCalculatedFieldSave, type CalculatedFieldSaveOutcome } from './useCalculatedFieldSave';

vi.mock('../../../../../../shared/utils', () => ({
  showApiErrorToast: vi.fn(),
}));

import { showApiErrorToast } from '../../../../../../shared/utils';

const mockedShowApiErrorToast = vi.mocked(showApiErrorToast);

/** Builds an axios-like rejection carrying the given response body, matching what
 * `extractApiError` (and the real apiClient) hand a caller. `statusCode` is injected into the
 * body itself (not just `response.status`) because that's what `extractApiError` actually reads
 * — mirroring the real backend, whose exception filter always writes `statusCode` into the JSON
 * body alongside the HTTP status. */
function apiError(status: number, data: Record<string, unknown> = {}) {
  return { response: { status, data: { statusCode: status, ...data } } };
}

const schema: DataMartSchema = { type: 'bigquery-data-mart-schema', fields: [] };

type Mutation = (schema: DataMartSchema) => Promise<CalculatedFieldSaveOutcome | undefined>;

/** A rejection carrying real per-field formula violations — what actually populates
 * `errorsByField`. */
function formulaViolationError() {
  return apiError(400, {
    errorDetails: {
      errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
    },
  });
}

describe('useCalculatedFieldSave', () => {
  let mutation: Mock<Mutation>;

  beforeEach(() => {
    mutation = vi.fn<Mutation>();
    mockedShowApiErrorToast.mockClear();
  });

  it('maps every error onto its field, not just the first', async () => {
    mutation.mockRejectedValue(
      apiError(400, {
        message: 'Calculated field validation failed',
        errorDetails: {
          errors: [
            {
              code: 'FORMULA_LEVEL_MIXING',
              field: 'ctr',
              message: '`cost` is a row-level column.',
            },
            {
              code: 'FORMULA_UNKNOWN_REFERENCE',
              field: 'roas',
              message: '`spnd` no longer exists.',
            },
          ],
        },
      })
    );
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });

    expect(Object.keys(result.current.errorsByField)).toEqual(['ctr', 'roas']);
    expect(result.current.errorsByField.ctr).toEqual(['`cost` is a row-level column.']);
    expect(result.current.errorsByField.roas).toEqual(['`spnd` no longer exists.']);
    expect(mockedShowApiErrorToast).not.toHaveBeenCalled();
  });

  it('shows every violation for a field that has two, not just one', async () => {
    mutation.mockRejectedValue(
      apiError(400, {
        errorDetails: {
          errors: [
            { code: 'FORMULA_UNBALANCED_PARENTHESIS', field: 'ctr', message: 'Unclosed `SUM(`.' },
            { code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard the denominator.' },
          ],
        },
      })
    );
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });

    expect(result.current.errorsByField.ctr).toEqual([
      'Unclosed `SUM(`.',
      'Guard the denominator.',
    ]);
  });

  it('surfaces warnings on a SUCCESSFUL save', async () => {
    mutation.mockResolvedValue({
      warnings: [
        {
          code: 'FORMULA_UNGUARDED_DIVISION',
          field: 'ctr',
          message: 'This formula divides without…',
        },
      ],
    });
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema);
    });

    expect(result.current.warningsByField.ctr).toHaveLength(1);
    expect(result.current.errorsByField).toEqual({});
  });

  it('surfaces both warning codes at once when a save produces them together', async () => {
    mutation.mockResolvedValue({
      warnings: [
        { code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard the denominator.' },
        {
          code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED',
          field: 'roas',
          message: 'Saved without checking `roas` against the warehouse.',
        },
      ],
    });
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema);
    });

    expect(result.current.warningsByField).toEqual({
      ctr: ['Guard the denominator.'],
      roas: ['Saved without checking `roas` against the warehouse.'],
    });
  });

  it('clears stale warnings on a successful save that returns none', async () => {
    mutation.mockResolvedValueOnce({
      warnings: [{ code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard it.' }],
    });
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema);
    });
    expect(result.current.warningsByField).not.toEqual({});

    mutation.mockResolvedValueOnce({ warnings: [] });
    await act(async () => {
      await result.current.save(schema);
    });

    expect(result.current.warningsByField).toEqual({});
  });

  it('clears stale errors once a fixed formula saves successfully', async () => {
    mutation.mockRejectedValueOnce(
      apiError(400, {
        errorDetails: {
          errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'ctr', message: 'Row-level column.' }],
        },
      })
    );
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });
    expect(result.current.errorsByField).not.toEqual({});

    mutation.mockResolvedValueOnce({ warnings: [] });
    await act(async () => {
      await result.current.save(schema);
    });

    expect(result.current.errorsByField).toEqual({});
  });

  // A rejected save never persisted, so whatever warnings described the LAST successful save no
  // longer describe what's on screen — deleting the clear from the catch branch (as opposed to
  // the success branch, already covered above) must also be caught.
  it('clears stale warnings once a later save is rejected', async () => {
    mutation.mockResolvedValueOnce({
      warnings: [{ code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard it.' }],
    });
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema);
    });
    expect(result.current.warningsByField).not.toEqual({});

    mutation.mockRejectedValueOnce(
      apiError(400, {
        errorDetails: {
          errors: [{ code: 'FORMULA_LEVEL_MIXING', field: 'roas', message: 'Row-level column.' }],
        },
      })
    );
    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });

    expect(result.current.warningsByField).toEqual({});
  });

  it('shows a violation for a field the current schema no longer has, rather than dropping it', async () => {
    // The response can race an edit: the field named in the violation may already be gone from
    // what's on screen. This hook never checks that — it groups whatever field name the backend
    // sent, so the violation still surfaces instead of vanishing silently.
    mutation.mockRejectedValue(
      apiError(400, {
        errorDetails: {
          errors: [
            { code: 'FORMULA_UNKNOWN_REFERENCE', field: 'renamed_or_removed', message: 'Stale.' },
          ],
        },
      })
    );
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });

    expect(result.current.errorsByField).toEqual({ renamed_or_removed: ['Stale.'] });
  });

  it('does not crash when errorDetails.errors is not an array', async () => {
    // Untrusted runtime data: a malformed body must not throw from inside the catch block — that
    // would replace the original rejection and skip the fallback toast entirely.
    //
    // The fixture is a NON-ITERABLE object, not a string: a string IS iterable, so `for…of` over
    // it walks characters, each `violation.field` is undefined, and every one is skipped — which
    // means deleting the `Array.isArray` guard changed nothing and this test passed either way.
    const malformed = apiError(400, {
      errorDetails: { errors: { code: 'FORMULA_LEVEL_MIXING', field: 'ctr' } as unknown },
    });
    mutation.mockRejectedValue(malformed);
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    // The ORIGINAL rejection reaches the caller — not a TypeError thrown from inside the catch.
    await expect(result.current.save(schema)).rejects.toBe(malformed);

    expect(result.current.errorsByField).toEqual({});
    expect(mockedShowApiErrorToast).toHaveBeenCalledTimes(1);
  });

  // Each of the three "unrelated failure" cases below primes a real per-field error FIRST, so the
  // `toEqual({})` afterwards proves the catch branch CLEARED it. Starting from a fresh renderHook
  // asserted the hook's initial state instead — deleting `setErrorsByField(EMPTY)` left a stale
  // red banner sitting beside the unrelated-failure toast and no test noticed.
  async function primeStaleFieldErrors(
    result: { current: { save: (s: DataMartSchema) => Promise<void> } },
    mutationMock: Mock<Mutation>
  ) {
    mutationMock.mockRejectedValueOnce(formulaViolationError());
    await act(async () => {
      await result.current.save(schema).catch(() => undefined);
    });
  }

  it('clears stale field errors when errorDetails.errors is not an array', async () => {
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));
    await primeStaleFieldErrors(result, mutation);
    expect(result.current.errorsByField).not.toEqual({});

    mutation.mockRejectedValueOnce(
      apiError(400, {
        errorDetails: { errors: { code: 'FORMULA_LEVEL_MIXING', field: 'ctr' } as unknown },
      })
    );
    await act(async () => {
      await expect(result.current.save(schema)).rejects.toBeTruthy();
    });

    expect(result.current.errorsByField).toEqual({});
  });

  it('falls back to the app error toast for a 400 with no errors key at all, clearing stale errors', async () => {
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));
    await primeStaleFieldErrors(result, mutation);
    expect(result.current.errorsByField).not.toEqual({});

    const unrelated = apiError(400, { message: 'Something unrelated went wrong' });
    mutation.mockRejectedValueOnce(unrelated);
    await act(async () => {
      await expect(result.current.save(schema)).rejects.toBeTruthy();
    });

    expect(result.current.errorsByField).toEqual({});
    expect(mockedShowApiErrorToast).toHaveBeenCalledWith(unrelated);
  });

  it('does not crash on a rejection with no response body at all, and clears stale errors', async () => {
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));
    await primeStaleFieldErrors(result, mutation);
    expect(result.current.errorsByField).not.toEqual({});

    mutation.mockRejectedValueOnce(new Error('network blip'));
    await act(async () => {
      await expect(result.current.save(schema)).rejects.toBeTruthy();
    });

    expect(result.current.errorsByField).toEqual({});
    expect(mockedShowApiErrorToast).toHaveBeenCalledTimes(1);
  });

  // The interceptor apiClient.ts would normally show for these statuses is suppressed on this
  // call (skipErrorToast) — this hook must reproduce it itself, wording included, since it's the
  // only thing left rendering anything for a failure that isn't a calculated-field violation.
  describe('mirrors the suppressed interceptor toast for non-400 failures', () => {
    it('shows the view-only-mode message, persistently, for that 403 code', async () => {
      mutation.mockRejectedValue(apiError(403, { code: 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE' }));
      const { result } = renderHook(() => useCalculatedFieldSave(mutation));

      await expect(result.current.save(schema)).rejects.toBeTruthy();

      expect(mockedShowApiErrorToast).toHaveBeenCalledWith(
        expect.anything(),
        'This action is not available in view-only mode',
        { persistent: true }
      );
    });

    it('shows the generic forbidden message, persistently, for any other 403', async () => {
      mutation.mockRejectedValue(apiError(403, {}));
      const { result } = renderHook(() => useCalculatedFieldSave(mutation));

      await expect(result.current.save(schema)).rejects.toBeTruthy();

      expect(mockedShowApiErrorToast).toHaveBeenCalledWith(
        expect.anything(),
        'Access forbidden - insufficient permissions',
        { persistent: true }
      );
    });

    it('shows "Resource not found" for a 404', async () => {
      mutation.mockRejectedValue(apiError(404, {}));
      const { result } = renderHook(() => useCalculatedFieldSave(mutation));

      await expect(result.current.save(schema)).rejects.toBeTruthy();

      expect(mockedShowApiErrorToast).toHaveBeenCalledWith(expect.anything(), 'Resource not found');
    });

    it('includes the request id for a 5xx that carries one, keyed by status', async () => {
      mutation.mockRejectedValue(apiError(500, { requestId: 'req-123' }));
      const { result } = renderHook(() => useCalculatedFieldSave(mutation));

      await expect(result.current.save(schema)).rejects.toBeTruthy();

      expect(mockedShowApiErrorToast).toHaveBeenCalledWith(
        undefined,
        'Something went wrong on our side. Request id: req-123',
        { id: 'server-error:500' }
      );
    });

    it('falls back to the generic 5xx message when there is no request id', async () => {
      mutation.mockRejectedValue(apiError(503, {}));
      const { result } = renderHook(() => useCalculatedFieldSave(mutation));

      await expect(result.current.save(schema)).rejects.toBeTruthy();

      expect(mockedShowApiErrorToast).toHaveBeenCalledWith(
        undefined,
        'Something went wrong on our side. Please try again',
        { id: 'server-error:503' }
      );
    });
  });

  it('reset clears both maps', async () => {
    mutation.mockResolvedValue({
      warnings: [{ code: 'FORMULA_UNGUARDED_DIVISION', field: 'ctr', message: 'Guard it.' }],
    });
    const { result } = renderHook(() => useCalculatedFieldSave(mutation));

    await act(async () => {
      await result.current.save(schema);
    });
    expect(result.current.warningsByField).not.toEqual({});

    act(() => {
      result.current.reset();
    });

    expect(result.current.warningsByField).toEqual({});
    expect(result.current.errorsByField).toEqual({});
  });
});
