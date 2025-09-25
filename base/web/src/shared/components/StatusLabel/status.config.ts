import { StatusTypeEnum, type StatusVariant } from './types.ts';
import type { AppIcon } from '../../icons';
import { OctagonX, CircleCheck, Info, TriangleAlert } from 'lucide-react';

const variantClassesConfig: Record<StatusVariant, string> = {
  solid: 'px-2.5 py-0.5 rounded-full',
  subtle: 'px-2.5 py-0.5 rounded-full',
  outline: 'px-2.5 py-0.5 rounded-full border',
  ghost: '',
} as const;

export const getStatusVariantClasses = (variant: StatusVariant): string => {
  return variantClassesConfig[variant];
};

export const statusConfig: Record<
  StatusTypeEnum,
  { icon: AppIcon; colors: Record<StatusVariant, string> }
> = {
  [StatusTypeEnum.SUCCESS]: {
    icon: CircleCheck,
    colors: {
      solid: 'bg-green-500 text-white',
      subtle: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
      outline: 'border-green-500 text-green-700 dark:text-green-400',
      ghost: 'text-green-500 dark:text-green-400',
    },
  },
  [StatusTypeEnum.ERROR]: {
    icon: OctagonX,
    colors: {
      solid: 'bg-red-500 text-white',
      subtle: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
      outline: 'border-red-500 text-red-700 dark:text-red-400',
      ghost: 'text-red-500 dark:text-red-400',
    },
  },
  [StatusTypeEnum.WARNING]: {
    icon: TriangleAlert,
    colors: {
      solid: 'bg-yellow-500 text-white',
      subtle: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
      outline: 'border-yellow-500 text-yellow-700 dark:text-yellow-400',
      ghost: 'text-yellow-500 dark:text-yellow-400',
    },
  },
  [StatusTypeEnum.INFO]: {
    icon: Info,
    colors: {
      solid: 'bg-blue-500 text-white',
      subtle: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
      outline: 'border-blue-500 text-blue-700 dark:text-blue-400',
      ghost: 'text-blue-500 dark:text-blue-400',
    },
  },
  [StatusTypeEnum.NEUTRAL]: {
    icon: Info,
    colors: {
      solid: 'bg-gray-500 text-white',
      subtle: 'bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-400',
      outline: 'border-gray-500 text-gray-700 dark:text-gray-400',
      ghost: 'text-muted-foreground',
    },
  },
};
