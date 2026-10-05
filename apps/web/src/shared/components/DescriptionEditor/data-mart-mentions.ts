import type * as Monaco from 'monaco-editor';

export interface DataMartReference {
  id: string;
  title: string;
}

function isMarkdownText(prefix: string): boolean {
  let fence: { character: string; length: number } | null = null;
  let codeDelimiter = 0;
  let brackets = 0;
  let destination = 0;
  for (const line of prefix.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker?.[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      continue;
    }
    if (marker && !codeDelimiter) {
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '`') {
        const start = index;
        while (line[index + 1] === '`') index++;
        const length = index - start + 1;
        if (!codeDelimiter) codeDelimiter = length;
        else if (codeDelimiter === length) codeDelimiter = 0;
      } else if (!codeDelimiter) {
        if (character === '\\') index++;
        else if (destination) {
          if (character === '(') destination++;
          else if (character === ')') destination--;
        } else if (character === '[') brackets++;
        else if (character === ']') {
          brackets = Math.max(0, brackets - 1);
          if (line[index + 1] === '(') {
            destination = 1;
            index++;
          }
        }
      }
    }
  }
  return !fence && !codeDelimiter && !brackets && !destination;
}

export function mentionAtCursor(text: string): { query: string; start: number } | null {
  // The prefix includes previous lines so fenced code and multiline links are excluded.
  const line = text.slice(text.lastIndexOf('\n') + 1);
  const match = /(?:^|\s)@([^@[\]()\n]*)$/.exec(line);
  if (!match) return null;
  const start = text.lastIndexOf('@');
  if (!isMarkdownText(text.slice(0, start))) return null;
  return { query: match[1].trim(), start };
}

export function dataMartMarkdownLink(
  reference: DataMartReference,
  projectId: string,
  origin: string
): string {
  const title = reference.title.replace(/([\\`*_[\]<>])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  const url = new URL(
    `/ui/${encodeURIComponent(projectId)}/data-marts/${encodeURIComponent(reference.id)}/data-setup`,
    origin
  ).href;
  return `[${title}](${url})`;
}

export function registerDataMartMentions(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  projectId: string,
  load: () => Promise<DataMartReference[]>,
  onError: (message: string | null) => void
): Monaco.IDisposable {
  const model = editor.getModel();
  const lifetime = new AbortController();
  const isDisposed = () => lifetime.signal.aborted;
  const provider = monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['@'],
    async provideCompletionItems(requestModel, position, _context, token) {
      if (isDisposed() || requestModel !== model) return { suggestions: [] };
      const text = requestModel.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const mention = mentionAtCursor(text);
      if (!mention) return { suggestions: [] };
      onError(null);
      try {
        const references = await load();
        if (isDisposed() || token.isCancellationRequested || requestModel !== editor.getModel())
          return { suggestions: [] };
        const query = mention.query.toLocaleLowerCase();
        return {
          isIncomplete: true,
          suggestions: references
            .filter(reference => reference.title.toLocaleLowerCase().includes(query))
            .map(reference => ({
              label: reference.title,
              detail: 'Data Mart',
              kind: monaco.languages.CompletionItemKind.Reference,
              filterText: `@${reference.title}`,
              insertText: dataMartMarkdownLink(reference, projectId, window.location.origin),
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - (text.length - mention.start),
                endColumn: position.column,
              },
            })),
        };
      } catch {
        if (!isDisposed() && !token.isCancellationRequested)
          onError('Could not load Data Marts. Type @ to try again.');
        return { suggestions: [] };
      }
    },
  });
  return {
    dispose() {
      lifetime.abort();
      provider.dispose();
    },
  };
}
