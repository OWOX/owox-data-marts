import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/services/data-mart.service', () => ({
  dataMartService: { validateFormula: vi.fn() },
}));

import { dataMartService } from '../../../../shared/services/data-mart.service';
import type { ValidateFormulaResponseDto } from '../../../../shared/types/api';
import { DRAFT_FORMULA_MAX_LENGTH, MAX_DRAFT_CALCULATED_FIELDS } from './draft-calculated-fields';
import {
  FORMULA_DIAGNOSTICS_DEBOUNCE_MS,
  useFormulaDiagnostics,
  type UseFormulaDiagnosticsOptions,
} from './useFormulaDiagnostics';

const validateFormula = vi.mocked(dataMartService.validateFormula);

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing rejects a deferred without the test then driving the hook's own catch; an unhandled
  // rejection here would fail the suite for a reason that has nothing to do with the hook.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

const violation = (message: string) => ({ code: 'FORMULA_SYNTAX', field: 'ctr', message });

const verdict = (
  overrides: Partial<ValidateFormulaResponseDto> = {}
): ValidateFormulaResponseDto => ({ errors: [], warnings: [], ...overrides });

function options(
  overrides: Partial<UseFormulaDiagnosticsOptions> = {}
): UseFormulaDiagnosticsOptions {
  return {
    dataMartId: 'dm-1',
    name: 'ctr',
    type: 'FLOAT',
    formula: 'SUM({{ref field="clicks"}})',
    ...overrides,
  };
}

/** Lets both the timer and every microtask the fired request queues run inside one act(). */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function signalOf(call: number): AbortSignal {
  return validateFormula.mock.calls[call][2]?.signal as AbortSignal;
}

function apiFailure(statusCode: number, code?: string): unknown {
  return { isAxiosError: true, response: { status: statusCode, data: { statusCode, code } } };
}

/**
 * A request that behaves the way axios really does with a signal: it stays pending until the
 * caller aborts it, and then REJECTS. Every other mock in this suite ignores the signal, which is
 * exactly how a missing guard in the rejection path can stay invisible.
 */
function abortRejects(
  _dataMartId: string,
  _body: unknown,
  config?: { signal?: { addEventListener?: AbortSignal['addEventListener'] } }
): Promise<never> {
  const pending = deferred<never>();
  config?.signal?.addEventListener?.('abort', () => {
    pending.reject(new Error('canceled'));
  });
  return pending.promise;
}

/**
 * A fresh copy of the module, for the two cases that turn its SESSION-wide mute on. The mute is
 * module state by design (a session that may not ask must not start asking again when another
 * editor opens), so a test that sets it has to work on its own instance or it decides the outcome
 * of every test after it.
 */
async function loadInFreshSession() {
  vi.resetModules();
  const service = await import('../../../../shared/services/data-mart.service');
  const module = await import('./useFormulaDiagnostics');
  const validate = vi.mocked(service.dataMartService.validateFormula);
  validate.mockResolvedValue(verdict());
  return { useFormulaDiagnostics: module.useFormulaDiagnostics, validate };
}

describe('useFormulaDiagnostics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    validateFormula.mockReset();
    validateFormula.mockResolvedValue(verdict());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks nothing until the analyst has stopped typing for the debounce interval', async () => {
    renderHook(props => useFormulaDiagnostics(props), { initialProps: options() });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS - 1);
    expect(validateFormula).not.toHaveBeenCalled();

    await advance(1);
    expect(validateFormula).toHaveBeenCalledTimes(1);
  });

  it('asks once for a burst of keystrokes, about the last one', async () => {
    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'S' }),
    });

    for (const formula of ['SU', 'SUM', 'SUM(']) {
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS - 50);
      rerender(options({ formula }));
    }
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    expect(validateFormula).toHaveBeenCalledTimes(1);
    expect(validateFormula).toHaveBeenCalledWith(
      'dm-1',
      { name: 'ctr', type: 'FLOAT', formula: 'SUM(' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  /**
   * The schema editor defers its save, so the check has to be told what the editor is holding or
   * it resolves a sibling reference against the schema on disk and calls it missing — in the one
   * flow this feature exists for.
   */
  describe('the draft the editor is holding', () => {
    const drafted = [{ name: 'revenue', type: 'FLOAT', formula: 'SUM({{ref field="amount"}})' }];

    it('sends it with the formula', async () => {
      renderHook(props => useFormulaDiagnostics(props), {
        initialProps: options({ calculatedFields: drafted }),
      });

      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

      expect(validateFormula).toHaveBeenCalledWith(
        'dm-1',
        {
          name: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}})',
          calculatedFields: drafted,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    // An empty list is what a caller with no draft to report has (a read-only table, a component
    // outside the provider). Sent as `[]` it would read as "this Data Mart has no formulas at all"
    // — which is exactly the false-missing answer this parameter exists to remove.
    it('sends no key at all rather than an empty list', async () => {
      renderHook(props => useFormulaDiagnostics(props), {
        initialProps: options({ calculatedFields: [] }),
      });

      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

      expect(validateFormula).toHaveBeenCalledWith(
        'dm-1',
        { name: 'ctr', type: 'FLOAT', formula: 'SUM({{ref field="clicks"}})' },
        expect.anything()
      );
    });

    /**
     * A draft past the endpoint's count cannot be sent whole, and what is dropped does not merely
     * go unresolved: the probe REPLACES the persisted formulas, so a dropped sibling vanishes from
     * the check even when it is saved on disk, and the answer is the same sentence a deleted field
     * gets. The formula being checked is the one that must resolve, so it decides what survives.
     */
    it('keeps what the formula being checked reads when the draft is too big to send', async () => {
      const many = Array.from({ length: MAX_DRAFT_CALCULATED_FIELDS + 3 }, (_, i) => ({
        name: `m${String(i)}`,
        type: 'FLOAT',
        formula: 'SUM(1)',
      }));
      const needed = { name: 'revenue', type: 'FLOAT', formula: 'SUM(1)' };

      renderHook(props => useFormulaDiagnostics(props), {
        initialProps: options({
          formula: '{{ref field="revenue"}} / 2',
          calculatedFields: [...many, needed],
        }),
      });
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

      const sent = validateFormula.mock.calls[0][1].calculatedFields ?? [];
      expect(sent).toHaveLength(MAX_DRAFT_CALCULATED_FIELDS);
      expect(sent[0]).toEqual(needed);
    });

    /**
     * The probe is judged WHOLE, so every kept formula that reads a dropped one adds its own
     * "Saving will fail on <field>" line — dozens of accusations about rows the analyst never
     * touched, all of them fabricated by the cut. That bucket's correctness depends on the probe
     * being the whole schema, so when it is not, it is withheld rather than shown.
     */
    it('withholds the other-field bucket when the draft had to be cut', async () => {
      validateFormula.mockResolvedValue(
        verdict({
          errors: [violation('this one is about the formula on screen')],
          otherFieldErrors: [violation('saving will fail on some other row')],
        })
      );
      const many = Array.from({ length: MAX_DRAFT_CALCULATED_FIELDS + 1 }, (_, i) => ({
        name: `m${String(i)}`,
        type: 'FLOAT',
        formula: 'SUM(1)',
      }));

      const { result } = renderHook(props => useFormulaDiagnostics(props), {
        initialProps: options({ calculatedFields: many }),
      });
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.otherFieldErrors).toEqual([]);
    });

    // The list is an ARRAY prop: in the effect's dependencies it would be a fresh identity on every
    // render of the schema page, i.e. a request per render behind a debounce meant to coalesce a
    // burst of typing into one.
    it('does not ask again for a re-render that only rebuilt the list', async () => {
      const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
        initialProps: options({ calculatedFields: [...drafted] }),
      });
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      expect(validateFormula).toHaveBeenCalledTimes(1);

      rerender(options({ calculatedFields: [...drafted] }));
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

      expect(validateFormula).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The endpoint refuses a formula past its length bound, and a refusal is invisible here: three
   * consecutive 4xx answers stop the check for the session and the panel stays empty, which reads
   * as "your formula is clean". A formula this long cannot be saved either (the schema's own zod
   * bound is the same number), so there is something true to say instead of asking.
   */
  it('says a formula past the length bound is too long instead of asking about it', async () => {
    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'x'.repeat(DRAFT_FORMULA_MAX_LENGTH + 1) }),
    });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    expect(validateFormula).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([
      expect.objectContaining({ field: 'ctr', message: expect.stringContaining('too long') }),
    ]);
    expect(result.current.isChecking).toBe(false);
  });

  it('asks as usual about a formula of exactly the maximum length', async () => {
    renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'x'.repeat(DRAFT_FORMULA_MAX_LENGTH) }),
    });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    expect(validateFormula).toHaveBeenCalledTimes(1);
  });

  it('ignores a superseded response that lands after a newer one', async () => {
    const first = deferred<ValidateFormulaResponseDto>();
    const second = deferred<ValidateFormulaResponseDto>();
    validateFormula.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(clicks' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    expect(validateFormula).toHaveBeenCalledTimes(1);

    rerender(options({ formula: 'SUM(clicks)' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    expect(validateFormula).toHaveBeenCalledTimes(2);

    // The newer answer lands first: the formula on screen is fine.
    await act(async () => {
      second.resolve(verdict());
      await Promise.resolve();
    });
    expect(result.current.errors).toEqual([]);

    // The older one — about a formula that no longer exists — lands afterwards.
    await act(async () => {
      first.resolve(verdict({ errors: [violation('`SUM` has an opening parenthesis')] }));
      await Promise.resolve();
    });

    expect(result.current.errors).toEqual([]);
    expect(result.current.isChecking).toBe(false);
  });

  it('aborts the in-flight request when the formula changes again', async () => {
    validateFormula.mockReturnValue(deferred<ValidateFormulaResponseDto>().promise);
    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(clicks' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    expect(signalOf(0).aborted).toBe(false);

    rerender(options({ formula: 'SUM(clicks)' }));

    expect(signalOf(0).aborted).toBe(true);
  });

  it('shows nothing when the request fails, rather than a problem the analyst does not have', async () => {
    validateFormula.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(result.current.errors).toEqual([]);
    expect(result.current.warnings).toEqual([]);
    expect(result.current.isChecking).toBe(false);
  });

  it('drops the previous verdict when a later check fails', async () => {
    validateFormula.mockResolvedValueOnce(verdict({ errors: [violation('`clicks` is gone')] }));

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM({{ref field="clicks"}})' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.errors).toHaveLength(1);

    validateFormula.mockRejectedValueOnce(new Error('Network Error'));
    rerender(options({ formula: 'SUM({{ref field="clicks"}}) + 1' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(result.current.errors).toEqual([]);
  });

  it('reports what the backend found, errors and warnings apart', async () => {
    validateFormula.mockResolvedValue(
      verdict({
        errors: [violation('`clicks` no longer exists in the Data Mart')],
        warnings: [violation('This formula divides without guarding against a zero')],
      })
    );

    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.warnings[0].message).toMatch(/divides without guarding/);
  });

  it('keeps the last verdict on screen while the next check is in flight', async () => {
    validateFormula.mockResolvedValueOnce(verdict({ errors: [violation('`clicks` is gone')] }));
    const pending = deferred<ValidateFormulaResponseDto>();
    validateFormula.mockReturnValueOnce(pending.promise);

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM({{ref field="clicks"}})' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    rerender(options({ formula: 'SUM({{ref field="clicks"}}) + 1' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    // Blanking the panel on every keystroke would make it flicker through a whole edit; the
    // verdict stays until a newer one replaces it, with isChecking saying it is being replaced.
    expect(result.current.errors).toHaveLength(1);
    expect(result.current.isChecking).toBe(true);
  });

  it('has no verdict left once the formula is emptied', async () => {
    validateFormula.mockResolvedValue(verdict({ errors: [violation('`clicks` is gone')] }));

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.errors).toHaveLength(1);

    rerender(options({ formula: '   ' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    expect(result.current.errors).toEqual([]);
    expect(validateFormula).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['disabled', options({ enabled: false })],
    ['no Data Mart', options({ dataMartId: '' })],
    ['an unnamed field', options({ name: '' })],
    ['no type', options({ type: '' })],
    ['a blank formula', options({ formula: '' })],
  ])('asks nothing with %s', async (_case, props) => {
    renderHook(p => useFormulaDiagnostics(p), { initialProps: props });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS * 5);

    expect(validateFormula).not.toHaveBeenCalled();
  });

  // The rejection of an ABORTED predecessor lands in the same catch as a real failure. Without the
  // superseded guard there it blanks the panel on every keystroke — and every other mock in this
  // suite ignores the signal, so nothing else here would notice.
  it('is untouched by the rejection of the request it just aborted', async () => {
    validateFormula.mockResolvedValueOnce(verdict({ errors: [violation('`clicks` is gone')] }));

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM({{ref field="clicks"}})' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.errors).toHaveLength(1);

    validateFormula.mockImplementation(abortRejects);
    rerender(options({ formula: 'SUM({{ref field="clicks"}}) +' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    // This edit aborts the request above, which then rejects, exactly as axios does.
    rerender(options({ formula: 'SUM({{ref field="clicks"}}) + 1' }));
    await settle();

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.isChecking).toBe(true);
  });

  it('calls its verdict stale as soon as the formula moves on, and fresh again when the next lands', async () => {
    validateFormula.mockResolvedValue(verdict({ errors: [violation('`clicks` is gone')] }));

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM({{ref field="clicks"}})' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.isStale).toBe(false);

    rerender(options({ formula: 'SUM({{ref field="clicks"}}) + 1' }));
    expect(result.current.isStale).toBe(true);

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.isStale).toBe(false);
  });

  it('has nothing stale when it has no verdict at all', async () => {
    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });

    expect(result.current.isStale).toBe(false);

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(result.current.isStale).toBe(false);
  });

  it('stops asking after three straight refusals of the request itself', async () => {
    validateFormula.mockRejectedValue(apiFailure(400));

    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(' }),
    });
    for (let edit = 0; edit < 6; edit++) {
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      await settle();
      rerender(options({ formula: `SUM(${String(edit)}` }));
    }

    expect(validateFormula).toHaveBeenCalledTimes(3);
  });

  it('keeps asking through failures that are not the request’s fault', async () => {
    validateFormula.mockRejectedValue(apiFailure(500));

    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(' }),
    });
    for (let edit = 0; edit < 5; edit++) {
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      await settle();
      rerender(options({ formula: `SUM(${String(edit)}` }));
    }

    expect(validateFormula).toHaveBeenCalledTimes(5);
  });

  it('counts only CONSECUTIVE refusals — one good answer clears the tally', async () => {
    validateFormula.mockRejectedValueOnce(apiFailure(400));
    validateFormula.mockRejectedValueOnce(apiFailure(400));
    validateFormula.mockResolvedValueOnce(verdict());
    validateFormula.mockRejectedValueOnce(apiFailure(400));
    validateFormula.mockRejectedValueOnce(apiFailure(400));

    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(' }),
    });
    for (let edit = 0; edit < 5; edit++) {
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      await settle();
      rerender(options({ formula: `SUM(${String(edit)}` }));
    }

    expect(validateFormula).toHaveBeenCalledTimes(5);
  });

  it('reports what this edit would break in another metric, apart from its own problems', async () => {
    validateFormula.mockResolvedValue(
      verdict({
        otherFieldErrors: [
          { code: 'FORMULA_CALCULATED_REFERENCE', field: 'roas', message: '`impressions` is ...' },
        ],
      })
    );

    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(result.current.otherFieldErrors[0].field).toBe('roas');
    expect(result.current.errors).toEqual([]);
  });

  it('treats the bucket the endpoint does not send yet as nothing to say', async () => {
    validateFormula.mockResolvedValue({ errors: [], warnings: [] });

    const { result } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(result.current.otherFieldErrors).toEqual([]);
  });

  it('stops asking for the rest of the session once a view-only session is refused', async () => {
    const { useFormulaDiagnostics: hook, validate } = await loadInFreshSession();
    validate.mockRejectedValue(apiFailure(403, 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE'));

    const { result, rerender } = renderHook(props => hook(props), { initialProps: options() });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    expect(validate).toHaveBeenCalledTimes(1);

    // Every keystroke afterwards would be a request that can only ever be refused again.
    for (const formula of ['SUM(a', 'SUM(a)', 'SUM(a) + 1']) {
      rerender(options({ formula }));
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      await settle();
    }

    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.errors).toEqual([]);
    expect(result.current.isChecking).toBe(false);
  });

  it('keeps checking after an ordinary failure — only a view-only refusal is permanent', async () => {
    const { useFormulaDiagnostics: hook, validate } = await loadInFreshSession();
    validate.mockRejectedValue(apiFailure(500));

    const { rerender } = renderHook(props => hook(props), { initialProps: options() });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    rerender(options({ formula: 'SUM({{ref field="clicks"}}) + 1' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('asks nothing when the editor closes before the debounce elapses', async () => {
    const { unmount } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS - 50);
    unmount();
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    expect(validateFormula).not.toHaveBeenCalled();
  });

  it('aborts an in-flight check when the editor closes', async () => {
    validateFormula.mockReturnValue(deferred<ValidateFormulaResponseDto>().promise);
    const { unmount } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options(),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);

    unmount();

    expect(signalOf(0).aborted).toBe(true);
  });
  // Giving up asking is a FACT ABOUT THE CHECK, and an empty panel is byte-identical to a clean
  // verdict — the reading the too-long arm already refuses to allow. A warning, not an error:
  // nothing is known to be wrong with the formula, only that nobody looked at it.
  it('says it has given up asking instead of leaving the panel empty', async () => {
    validateFormula.mockRejectedValue(apiFailure(400));

    const { result, rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'SUM(' }),
    });
    for (let edit = 0; edit < 5; edit++) {
      await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
      await settle();
      rerender(options({ formula: `SUM(${String(edit)}` }));
    }
    await settle();

    expect(validateFormula).toHaveBeenCalledTimes(3);
    expect(result.current.warnings.map(w => w.code)).toEqual(['FORMULA_LIVE_CHECK_UNAVAILABLE']);
    expect(result.current.errors).toEqual([]);
    expect(result.current.isChecking).toBe(false);
  });

  it('says the same when the session itself is refused', async () => {
    const { useFormulaDiagnostics: hook, validate } = await loadInFreshSession();
    validate.mockRejectedValue(apiFailure(403, 'ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE'));

    const { result, rerender } = renderHook(props => hook(props), { initialProps: options() });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    rerender(options({ formula: 'SUM(a)' }));
    await settle();

    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.current.warnings.map(w => w.code)).toEqual(['FORMULA_LIVE_CHECK_UNAVAILABLE']);
    expect(result.current.errors).toEqual([]);
  });

  // The catch records a refusal even when its request was superseded, on the stated grounds that
  // what it learned is about the session rather than about that formula. The success path has to
  // answer symmetrically, or refusals interleaved with answers accumulate to the limit and silence
  // the editor for the popover's life.
  it('clears the tally on an answer that arrives after its request was superseded', async () => {
    const late = deferred<ValidateFormulaResponseDto>();
    validateFormula.mockRejectedValueOnce(apiFailure(400));
    validateFormula.mockRejectedValueOnce(apiFailure(400));
    validateFormula.mockReturnValueOnce(late.promise);
    validateFormula.mockRejectedValue(apiFailure(400));

    const { rerender } = renderHook(props => useFormulaDiagnostics(props), {
      initialProps: options({ formula: 'a' }),
    });
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    rerender(options({ formula: 'ab' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    // The third request goes out and the analyst types again before it answers.
    rerender(options({ formula: 'abc' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    rerender(options({ formula: 'abcd' }));
    await act(async () => {
      late.resolve(verdict());
      await Promise.resolve();
    });

    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();
    rerender(options({ formula: 'abcde' }));
    await advance(FORMULA_DIAGNOSTICS_DEBOUNCE_MS);
    await settle();

    // Five: two refusals, the superseded answer that cleared them, and two more requests after it.
    expect(validateFormula).toHaveBeenCalledTimes(5);
  });
});
