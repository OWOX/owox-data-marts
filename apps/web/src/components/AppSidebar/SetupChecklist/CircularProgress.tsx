interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function CircularProgress({
  percentage,
  size = 20,
  strokeWidth = 2.5,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      className={className}
      aria-hidden='true'
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill='none'
        stroke='currentColor'
        strokeWidth={strokeWidth}
        className='text-sidebar-foreground/20'
      />
      {/* Progress */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill='none'
        stroke='currentColor'
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap='round'
        transform={`rotate(-90 ${String(center)} ${String(center)})`}
        className='text-primary transition-all duration-300'
      />
    </svg>
  );
}
