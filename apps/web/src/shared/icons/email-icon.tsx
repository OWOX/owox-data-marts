interface EmailIconProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  strokeColor?: string;
}

export const EmailIcon = ({
  className,
  size = 24,
  strokeWidth = 2,
  strokeColor = '#1E88E5',
}: EmailIconProps) => {
  return (
    <svg
      role='img'
      viewBox='0 0 24 24'
      width={size}
      height={size}
      className={className}
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      stroke={strokeColor}
      stroke-width={strokeWidth}
      stroke-linecap='round'
      stroke-linejoin='round'
    >
      <path d='m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' />
      <rect x='2' y='4' width='20' height='16' rx='2' />
    </svg>
  );
};
