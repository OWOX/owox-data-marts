import type * as monaco from 'monaco-editor';

interface SlashCommand {
  label: string;
  insertText: string;
  documentation: string;
}

const allSlashCommands: SlashCommand[] = [
  {
    label: 'New prompt',
    insertText: '{{#prompt}}\n$0\n{{/prompt}}',
    documentation: 'Insert a {{#prompt}} template for generative queries',
  },
];

const registeredLanguagesByMonaco = new WeakMap<typeof monaco, Set<string>>();
const providerDisposableByKey = new WeakMap<typeof monaco, Map<string, monaco.IDisposable>>();

const COPY_TEMPLATE_COMMAND_ID = 'insight.copyTemplate';

let activeCopyTemplateHandler: (() => void) | null = null;

export function setActiveCopyTemplateHandler(handler: (() => void) | null) {
  activeCopyTemplateHandler = handler;
}

/**
 * Registers a completion item provider for slash commands in the Monaco editor.
 * This method enables auto-completion for commands starting with a forward slash (/)
 * within the specified language in the Monaco editor.
 *
 * @param {typeof import('monaco-editor')} monaco The Monaco editor module instance used to register the provider.
 * @param {string} languageId The language identifier for which the slash command provider will be registered.
 * @return {void} This method does not return a value.
 */
export function registerSlashCommandProvider(
  monaco: typeof import('monaco-editor'),
  languageId: string
): void {
  const registered = registeredLanguagesByMonaco.get(monaco) ?? new Set<string>();

  if (!registeredLanguagesByMonaco.has(monaco)) {
    registeredLanguagesByMonaco.set(monaco, registered);
  }

  if (registered.has(languageId)) return;

  monaco.editor.registerCommand(COPY_TEMPLATE_COMMAND_ID, () => {
    activeCopyTemplateHandler?.();
  });

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

      if (slashIndex !== -1) {
        const commandText = textUntilPosition.substring(slashIndex + 1);

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

        const suggestions: monaco.languages.CompletionItem[] = [];

        allSlashCommands.forEach((command, index) => {
          if (command.label.startsWith(commandText)) {
            suggestions.push({
              label: command.label,
              insertText: command.insertText,
              documentation: {
                value: command.documentation,
                isTrusted: true,
              },
              detail: command.documentation,
              kind: monaco.languages.CompletionItemKind.Field,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              additionalTextEdits: [removeSlashEdit],
              sortText: `${String(index)}_${command.label}`,
            });
          }
        });

        suggestions.push({
          label: 'Copy template…',
          kind: monaco.languages.CompletionItemKind.Reference,
          detail: 'Copy template from an existing Insight',
          insertText: '',
          range: range,
          additionalTextEdits: [removeSlashEdit],
          command: { id: COPY_TEMPLATE_COMMAND_ID, title: 'Copy template…' },
          sortText: '999_copy_template',
        });

        return { suggestions };
      }

      return { suggestions: [] };
    },
  });

  const map = providerDisposableByKey.get(monaco) ?? new Map<string, monaco.IDisposable>();

  if (!providerDisposableByKey.has(monaco)) {
    providerDisposableByKey.set(monaco, map);
  }

  map.set(languageId, disposable);

  registered.add(languageId);
}
