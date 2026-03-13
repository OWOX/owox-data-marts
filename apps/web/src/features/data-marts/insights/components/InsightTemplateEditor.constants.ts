import type * as monacoEditor from 'monaco-editor';
import type { LucideIcon } from 'lucide-react';
import { Bold, Code2, Italic, Link, List, ListOrdered, ListTodo, Quote, Table } from 'lucide-react';

export interface MarkdownAction {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface EditorContext {
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  monaco: typeof monacoEditor;
  model: monacoEditor.editor.ITextModel;
  selection: monacoEditor.Selection;
  selectedText: string;
  hasSelection: boolean;
  start: monacoEditor.Position;
  end: monacoEditor.Position;
}

export const HEADING_LEVELS = [1, 2, 3, 4] as const;

export const MARKDOWN_ACTIONS: MarkdownAction[] = [
  {
    id: 'bold',
    label: 'Bold',
    icon: Bold,
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: Italic,
  },
  {
    id: 'link',
    label: 'Link',
    icon: Link,
  },
  {
    id: 'list',
    label: 'Bullet list',
    icon: List,
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    icon: ListOrdered,
  },
  {
    id: 'task-list',
    label: 'Task list',
    icon: ListTodo,
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: Quote,
  },
  {
    id: 'code-block',
    label: 'Code block',
    icon: Code2,
  },
  {
    id: 'table',
    label: 'Table',
    icon: Table,
  },
];
