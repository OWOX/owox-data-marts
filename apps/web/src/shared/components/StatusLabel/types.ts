export type StatusType = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export type StatusVariant = 'solid' | 'subtle' | 'outline' | 'ghost';

export interface StatusLabelProps {
  /**
   * The type of status that determines the color scheme
   */
  type?: StatusType;
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
