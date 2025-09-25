import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface BaseCardComponentProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
}
