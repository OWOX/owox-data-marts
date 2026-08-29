import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Download, FileImage, FileJson, FileText, Image as ImageIcon } from 'lucide-react';

export type DataMartCanvasExportFormat = 'svg' | 'png' | 'json' | 'okf';

const EXPORT_ITEMS: { format: DataMartCanvasExportFormat; label: string; icon: typeof Download }[] =
  [
    { format: 'svg', label: 'SVG image', icon: ImageIcon },
    { format: 'png', label: 'PNG image', icon: FileImage },
    { format: 'json', label: 'JSON file', icon: FileJson },
    { format: 'okf', label: 'OKF Markdown files', icon: FileText },
  ];

interface ModelCanvasExportMenuProps {
  onExport: (format: DataMartCanvasExportFormat) => void;
}

/** Canvas "Download..." menu, rendered next to the Actions button in the toolbar. */
export function ModelCanvasExportMenu({ onExport }: ModelCanvasExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' data-testid='export-canvas' title='Download as...'>
          <Download className='size-4' aria-hidden='true' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {EXPORT_ITEMS.map(item => (
          <DropdownMenuItem
            key={item.format}
            data-testid={`export-canvas-${item.format}`}
            onSelect={() => {
              onExport(item.format);
            }}
          >
            <item.icon aria-hidden='true' />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
