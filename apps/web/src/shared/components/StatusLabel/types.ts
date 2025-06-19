export enum StatusTypeEnum {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  NEUTRAL = 'neutral',
}

export type StatusVariant = 'solid' | 'subtle' | 'outline' | 'ghost';

export interface StatusLabelProps {
  /**
   * The type of status that determines the color scheme
   */
  type?: StatusTypeEnum;
  /**
   * The visual style variant of the status label
   */
  variant?: StatusVariant;
  /**
   * The text content to display
   */
  children: React.ReactNode;
  /**
   * Whether to show an icon
   */
  showIcon?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}
