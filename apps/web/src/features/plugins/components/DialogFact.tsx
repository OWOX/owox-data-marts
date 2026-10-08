import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * One thing a member must know before confirming a plugin action: an icon, then a plain
 * sentence. Shared by the install and uninstall confirmations so the two read as one product,
 * which is why the icon's size and its silence for screen readers live here, not at each call.
 */
export function DialogFact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className='text-muted-foreground flex items-start gap-2'>
      <Icon className='mt-0.5 size-4 shrink-0' aria-hidden />
      <p className='min-w-0'>{children}</p>
    </div>
  );
}
