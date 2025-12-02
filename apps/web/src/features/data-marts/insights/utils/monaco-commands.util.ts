import type * as monaco from 'monaco-editor';

interface SlashCommand {
  label: string;
  insertText: string;
  documentation: string;
}

const allSlashCommands: SlashCommand[] = [
  {
    label: 'prompt',
    insertText: '{{#prompt}}\n$0\n{{/prompt}}',
    documentation: 'Insert a {{#prompt}} template for generative queries',
  },
];

// To avoid duplicate providers when the editor mounts multiple times, keep track of
// which languages already have a registered provider in this module scope.
const registeredLanguages = new Set<string>();

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
) {
  // Prevent duplicate registration for the same language
  if (registeredLanguages.has(languageId)) return;

  monaco.languages.registerCompletionItemProvider(languageId, {
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

        const suggestions: monaco.languages.CompletionItem[] = [];

        allSlashCommands.forEach(command => {
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
              additionalTextEdits: [
                {
                  range: {
                    startLineNumber: line,
                    endLineNumber: line,
                    startColumn: slashIndex + 1,
                    endColumn: slashIndex + 2,
                  },
                  text: '',
                },
              ],
            });
          }
        });

        return { suggestions };
      }

      return { suggestions: [] };
    },
  });

  registeredLanguages.add(languageId);
}
