import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';

export interface MarkdownEditorTabsProps {
  value: 'markdown' | 'preview';
  onChange: (v: 'markdown' | 'preview') => void;
  className?: string;
}

export function MarkdownEditorTabs({ value, onChange, className }: MarkdownEditorTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={v => {
        onChange(v as 'markdown' | 'preview');
      }}
    >
      <TabsList className={className ?? 'h-7'}>
        <TabsTrigger value='markdown'>Markdown</TabsTrigger>
        <TabsTrigger value='preview'>Preview</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
