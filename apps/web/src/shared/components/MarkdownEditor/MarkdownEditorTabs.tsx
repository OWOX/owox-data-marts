import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';

export interface MarkdownEditorTabsProps {
  value: 'markdown' | 'preview';
  onChange: (v: 'markdown' | 'preview') => void;
}

export function MarkdownEditorTabs({ value, onChange }: MarkdownEditorTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={v => {
        onChange(v as 'markdown' | 'preview');
      }}
    >
      <TabsList>
        <TabsTrigger value='markdown'>Markdown</TabsTrigger>
        <TabsTrigger value='preview'>Preview</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
