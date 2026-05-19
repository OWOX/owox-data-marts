import { Button } from '../../../../shared/components/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { SmilePlus } from 'lucide-react';
import { useState } from 'react';

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Status',
    emojis: ['🥇', '🥈', '🥉', '⭐', '🏆', '✅', '❌', '⚠️', '🔥', '💎', '🎯', '🚀'],
  },
  {
    label: 'Category',
    emojis: ['📊', '📈', '📉', '💰', '🛒', '👥', '🌍', '📦', '🔧', '📱', '🖥️', '🔍'],
  },
  {
    label: 'Priority',
    emojis: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '💜', '💚', '💙'],
  },
];

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPickerButton({ onSelect }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant='ghost'
              className='size-7 p-0'
              aria-label='Add emoji to title'
              onMouseDown={e => {
                e.preventDefault();
              }}
            >
              <SmilePlus className='h-4 w-4 opacity-60' />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side='bottom'>Add emoji to title</TooltipContent>
      </Tooltip>
      <PopoverContent
        className='w-auto p-2'
        side='bottom'
        align='start'
        onOpenAutoFocus={e => {
          e.preventDefault();
        }}
      >
        <div className='flex flex-col gap-2'>
          {EMOJI_GROUPS.map(group => (
            <div key={group.label}>
              <p className='text-muted-foreground mb-1 px-1 text-[10px] font-medium uppercase'>
                {group.label}
              </p>
              <div className='grid grid-cols-6 gap-0.5'>
                {group.emojis.map(emoji => (
                  <button
                    key={emoji}
                    type='button'
                    className='hover:bg-accent rounded p-1 text-lg leading-none transition-colors'
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
