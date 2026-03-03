import { useState, useCallback, useEffect } from 'react';
import { Button } from '@owox/ui/components/button';
import { ChevronRight, PackageSearch } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import type { CredentialIdentity } from '../../types/credential-identity';
import {
  getIdentityDisplayString,
  getAuthTypeLabel,
} from '../../utils/credential-identity-utils';
import type { CopyCredentialsItem } from './types';

interface CopyCredentialsButtonProps {
  entityLabel: string;
  currentEntityId?: string;
  fetchItems: () => Promise<CopyCredentialsItem[]>;
  onSelect: (
    sourceId: string,
    title: string,
    identity: CredentialIdentity | null
  ) => void;
}

export function CopyCredentialsButton({
  entityLabel,
  currentEntityId,
  fetchItems,
  onSelect,
}: CopyCredentialsButtonProps) {
  const [hasAvailableItems, setHasAvailableItems] = useState<boolean | null>(null);
  const [items, setItems] = useState<CopyCredentialsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkAvailability = async () => {
      try {
        const response = await fetchItems();
        const filtered = response.filter(item => item.id !== currentEntityId);
        if (!cancelled) {
          setItems(filtered);
          setHasAvailableItems(filtered.length > 0);
        }
      } catch {
        if (!cancelled) {
          setHasAvailableItems(false);
        }
      }
    };
    void checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [fetchItems, currentEntityId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchItems()
      .then(response => {
        if (!cancelled) {
          const filtered = response.filter(item => item.id !== currentEntityId);
          setItems(filtered);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchItems, currentEntityId]);

  const handleSelect = useCallback(
    (item: CopyCredentialsItem) => {
      onSelect(item.id, item.title, item.identity);
      setOpen(false);
    },
    [onSelect]
  );

  if (hasAvailableItems !== true) {
    return null;
  }

  return (
    <TooltipProvider>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type='button' variant='ghost' size='sm' className='cursor-pointer'>
            <span className='text-muted-foreground/75 text-xs font-semibold tracking-wide uppercase'>
              Copy from&hellip;
            </span>
            <ChevronRight
              className={cn(
                'text-foreground/75 h-3.5 w-3.5 transition-transform duration-200',
                open && 'rotate-90'
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='bottom' align='end' className='w-72'>
          {loading ? (
            <DropdownMenuItem disabled>Loading&hellip;</DropdownMenuItem>
          ) : items.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-2 p-4 text-center'>
              <div className='bg-muted/70 rounded-full p-3'>
                <PackageSearch className='text-muted-foreground h-6 w-6' strokeWidth={1.5} />
              </div>
              <span className='text-foreground text-sm font-medium'>
                No matching {entityLabel}s
              </span>
              <span className='text-muted-foreground text-sm'>
                No other {entityLabel}s of this type exist in the project.
              </span>
            </div>
          ) : (
            <div className='flex flex-col gap-2'>
              <div className='text-muted-foreground border-b p-2 text-sm'>
                Select a {entityLabel} to copy its credentials.
              </div>
              <div>
                {items.map(item => (
                  <Tooltip key={item.id} delayDuration={300}>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        onSelect={() => {
                          handleSelect(item);
                        }}
                      >
                        <span className='flex flex-col'>
                          <span>{item.title}</span>
                          {getAuthTypeLabel(item.identity) && (
                            <span className='text-muted-foreground text-xs'>
                              {getAuthTypeLabel(item.identity)}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side='right' className='max-w-sm'>
                      {getIdentityDisplayString(item.identity)}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
