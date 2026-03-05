import type * as monaco from 'monaco-editor';
import type { InsightTemplateSourceEntity } from '../model';

interface SlashCommand {
  label: string;
  insertText: string;
  documentation: string;
}

const getBaseSlashCommands = (sources: InsightTemplateSourceEntity[]): SlashCommand[] => {
  const commands: SlashCommand[] = [];

  if (sources.length > 0) {
    sources.forEach(source => {
      commands.push({
        label: `Table (${source.key})`,
        insertText: `{{table source="${source.key}"}}`,
        documentation: `Insert a table tag for data artifact "${source.key}"`,
      });
    });
  } else {
    commands.push({
      label: 'Table',
      insertText: '{{table}}',
      documentation: 'Insert a table tag with source binding',
    });
  }

  commands.push(
    {
      label: 'Table with limit',
      insertText: '{{table source="${1:main}" limit="${2:100}"}}',
      documentation: 'Insert table tag with explicit row limit',
    },
    {
      label: 'Value (Path)',
      insertText: '{{value source="${1:main}" path=".${2:column_name}[${3:1}]"}}',
      documentation: 'Insert a value tag using path syntax',
    },
    {
      label: 'Value (Column/Row)',
      insertText: '{{value source="${1:main}" column="${2:1}" row="${3:1}"}}',
      documentation: 'Insert a value tag using column/row syntax',
    }
  );

  return commands;
};

const providerDisposableByKey = new WeakMap<typeof monaco, Map<string, monaco.IDisposable[]>>();

export function registerTemplateSlashCommandProvider(
  monacoInstance: typeof import('monaco-editor'),
  languageId: string,
  getSources: () => InsightTemplateSourceEntity[]
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

  const slashProvider = monacoInstance.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['/'],

    provideCompletionItems: (model, position) => {
      const slashCommands = getBaseSlashCommands(getSources());

      const line = position.lineNumber;
      const column = position.column;
      const textUntilPosition = model.getValueInRange({
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: column,
      });

      const slashIndex = textUntilPosition.lastIndexOf('/');
      if (slashIndex === -1) return { suggestions: [] };

      const commandText = textUntilPosition.substring(slashIndex + 1).toLowerCase();

      const range = {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: slashIndex + 2,
        endColumn: column,
      };

      const removeSlashEdit = {
        range: {
          startLineNumber: line,
          endLineNumber: line,
          startColumn: slashIndex + 1,
          endColumn: slashIndex + 2,
        },
        text: '',
      };

      const suggestions = slashCommands
        .filter(command => command.label.toLowerCase().startsWith(commandText))
        .map((command, index) => ({
          label: command.label,
          insertText: command.insertText,
          documentation: {
            value: command.documentation,
            isTrusted: true,
          },
          detail: command.documentation,
          kind: monacoInstance.languages.CompletionItemKind.Field,
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          additionalTextEdits: [removeSlashEdit],
          sortText: `${String(index).padStart(4, '0')}_${command.label}`,
        }));

      return { suggestions };
    },
  });

  const sourceAttributeProvider = monacoInstance.languages.registerCompletionItemProvider(
    languageId,
    {
      triggerCharacters: [
        '"',
        ' ',
        '=',
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789',
      ],
      provideCompletionItems: (model, position) => {
        // Read sources at call-time so we always have the latest data artifacts
        const sources = getSources();

        const line = position.lineNumber;
        const column = position.column;
        const textUntilPosition = model.getValueInRange({
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: column,
        });

        // Check if we are inside {{table ...}} or {{value ...}}
        const lastOpenTag = textUntilPosition.lastIndexOf('{{');
        const lastCloseTag = textUntilPosition.lastIndexOf('}}');

        if (lastOpenTag === -1 || lastOpenTag < lastCloseTag) {
          return { suggestions: [] };
        }

        const tagContent = textUntilPosition.substring(lastOpenTag + 2);
        const tagNameMatch = /^(\w+)/.exec(tagContent);
        if (!tagNameMatch || (tagNameMatch[1] !== 'table' && tagNameMatch[1] !== 'value')) {
          return { suggestions: [] };
        }

        // Case 1: cursor is right after the opening quote — source="|  or  source="partial|
        const sourceAttrMatch = /(?:\s|^)source\s*=\s*"([^"]*)$/i.exec(tagContent);
        if (!sourceAttrMatch) {
          // Case 2: cursor is inside a complete source="value" attribute
          const fullLine = model.getLineContent(line);
          const sourceAttrFullMatch = /(?:\s|^)source\s*=\s*"([^"]*)"/gi;
          let match;
          while ((match = sourceAttrFullMatch.exec(fullLine)) !== null) {
            const quotePos = match.index + match[0].indexOf('"');
            const start = quotePos + 1;
            const end = start + match[1].length;
            // column is 1-based; convert to 0-based for comparison
            if (column - 1 >= start && column - 1 <= end) {
              const range = {
                startLineNumber: line,
                endLineNumber: line,
                startColumn: start + 1,
                endColumn: end + 1,
              };
              return {
                suggestions: sources
                  .map((source, index) => ({
                    label: source.key,
                    insertText: source.key,
                    detail: source.title,
                    kind: monacoInstance.languages.CompletionItemKind.Value,
                    range,
                    sortText: `000_${String(index).padStart(4, '0')}_${source.key}`,
                  }))
                  .concat([
                    {
                      label: 'main',
                      insertText: 'main',
                      detail: 'Current Data Mart output',
                      kind: monacoInstance.languages.CompletionItemKind.Value,
                      range,
                      sortText: 'zzz_main',
                    },
                  ]),
                isIncomplete: false,
              };
            }
          }

          return { suggestions: [] };
        }

        const quoteIndex = textUntilPosition.lastIndexOf('"');

        const range = {
          startLineNumber: line,
          endLineNumber: line,
          startColumn: quoteIndex + 2,
          endColumn: column,
        };

        const suggestions = sources.map((source, index) => ({
          label: source.key,
          insertText: source.key,
          detail: source.title,
          kind: monacoInstance.languages.CompletionItemKind.Value,
          range,
          sortText: `000_${String(index).padStart(4, '0')}_${source.key}`,
        }));

        suggestions.push({
          label: 'main',
          insertText: 'main',
          detail: 'Current Data Mart output',
          kind: monacoInstance.languages.CompletionItemKind.Value,
          range,
          sortText: 'zzz_main',
        });

        return {
          suggestions,
          isIncomplete: false,
        };
      },
    }
  );

  const disposables = [slashProvider, sourceAttributeProvider];
  map.set(languageId, disposables);

  return () => {
    disposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
    map.delete(languageId);
  };
}
