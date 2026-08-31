import type * as monaco from 'monaco-editor';
import type { ResolvedReference } from './formula-authoring';
import { toLineColumn } from './formula-violation-ranges';

const providerDisposableByKey = new WeakMap<typeof monaco, Map<string, monaco.IDisposable[]>>();

/**
 * Markdown is the only shape Monaco's hover takes, and a Data Mart's display name is free-form user
 * text: a title holding `_` or `*` would otherwise render half in italics.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#|~]/g, '\\$&');
}

/**
 * The hover behind a chip: which Data Mart a joined reference reads from
 * (`formula-reference-source.ts`).
 *
 * Registered per LANGUAGE, exactly like `registerFormulaCompletionProvider`, and guarded the same
 * way against a second registration on the same `monaco` — but with one guard that provider does
 * not need: the Data Mart's SQL definition editor also mounts as `sql` and can be on this page, and
 * `references` are offsets into THIS editor's text. Applied to another model they would describe
 * whatever characters happen to sit at those offsets, so a model that is not this editor's is
 * answered with nothing at all.
 */
export function registerFormulaHoverProvider(
  monacoInstance: typeof monaco,
  languageId: string,
  getModel: () => monaco.editor.ITextModel | null,
  getReferences: () => readonly ResolvedReference[],
  describe: (ref: ResolvedReference) => string | undefined
): () => void {
  const map =
    providerDisposableByKey.get(monacoInstance) ?? new Map<string, monaco.IDisposable[]>();
  if (!providerDisposableByKey.has(monacoInstance)) {
    providerDisposableByKey.set(monacoInstance, map);
  }

  const previousDisposables = map.get(languageId);
  if (previousDisposables) {
    previousDisposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
  }

  const provider = monacoInstance.languages.registerHoverProvider(languageId, {
    provideHover: (model, position) => {
      if (model !== getModel()) return null;
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      // The same guard the decorations apply before drawing a chip: `references` is the parent's
      // belief about the text, and while the analyst types the two are a render apart. A span that
      // no longer spells its reference describes characters that are no longer it.
      const reference = getReferences().find(
        ref =>
          offset >= ref.start && offset < ref.end && text.slice(ref.start, ref.end) === ref.text
      );
      if (!reference) return null;
      const description = describe(reference);
      if (!description) return null;

      const start = toLineColumn(text, reference.start);
      const end = toLineColumn(text, reference.end);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        contents: [{ value: escapeMarkdown(description) }],
      };
    },
  });

  const disposables = [provider];
  map.set(languageId, disposables);

  return () => {
    disposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
    // Only while the entry is still THIS registration's — same reason as in
    // `registerFormulaCompletionProvider`: a second editor overwrote it when it mounted.
    if (map.get(languageId) === disposables) map.delete(languageId);
  };
}
