import { Editor, type OnMount } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  height?: number | string;
  theme?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  className?: string;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  height = 240,
  theme = 'light',
  options,
  className,
  placeholder = 'Start writing your message…',
}: MarkdownEditorProps) {
  const handleMount: OnMount = editor => {
    if (onBlur) editor.onDidBlurEditorText(onBlur);
  };

  return (
    <Editor
      language='markdown'
      height={height}
      value={value}
      onChange={val => {
        onChange(val ?? '');
      }}
      onMount={handleMount}
      theme={theme}
      options={{
        wordWrap: 'on',
        minimap: { enabled: false },
        lineNumbers: 'off',
        folding: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        placeholder,
        ...options,
      }}
      className={className}
    />
  );
}
