import type { ReactNode } from 'react';

/**
 * One thing a member must know before confirming a plugin action: an icon, then a plain
 * sentence. Shared by the install and uninstall confirmations so the two read as one product.
 */
export function DialogFact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className='text-muted-foreground flex items-start gap-2'>
      <span className='mt-0.5'>{icon}</span>
      <p className='min-w-0'>{children}</p>
    </div>
  );
}
