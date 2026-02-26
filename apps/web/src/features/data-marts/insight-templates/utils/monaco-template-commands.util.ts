import type * as monaco from 'monaco-editor';

interface SlashCommand {
  label: string;
  insertText: string;
  documentation: string;
}

const slashCommands: SlashCommand[] = [
  {
    label: 'Table',
    insertText: '{{table source="main"}}',
    documentation: 'Insert a table tag with source binding',
  },
  {
    label: 'Single Value (Path)',
    insertText: '{{value source="${1:main}" path=".${2:column_name}[${3:1}]"}}',
    documentation: 'Insert a value tag using path syntax',
  },
  {
    label: 'Single Value (Column/Row)',
    insertText: '{{value source="${1:main}" column="${2:1}" row="${3:1}"}}',
    documentation: 'Insert a value tag using column/row syntax',
  },
];

const registeredLanguagesByMonaco = new WeakMap<typeof monaco, Set<string>>();
const providerDisposableByKey = new WeakMap<typeof monaco, Map<string, monaco.IDisposable>>();

export function registerTemplateSlashCommandProvider(
  monaco: typeof import('monaco-editor'),
  languageId: string
): void {
  const registered = registeredLanguagesByMonaco.get(monaco) ?? new Set<string>();

  if (!registeredLanguagesByMonaco.has(monaco)) {
    registeredLanguagesByMonaco.set(monaco, registered);
  }

  if (registered.has(languageId)) return;

  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['/'],

    provideCompletionItems: (model, position) => {
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
          kind: monaco.languages.CompletionItemKind.Field,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          additionalTextEdits: [removeSlashEdit],
          sortText: `${String(index)}_${command.label}`,
        }));

      return { suggestions };
    },
  });

  const map = providerDisposableByKey.get(monaco) ?? new Map<string, monaco.IDisposable>();
  if (!providerDisposableByKey.has(monaco)) {
    providerDisposableByKey.set(monaco, map);
  }

  map.set(languageId, disposable);
  registered.add(languageId);
}
