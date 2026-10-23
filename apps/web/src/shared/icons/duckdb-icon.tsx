interface DuckDBIconProps {
  className?: string;
  size?: number;
}

export const DuckDBIcon = ({ className, size = 24 }: DuckDBIconProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 48 48'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      style={{ minWidth: size, minHeight: size }}
    >
      {/* Body */}
      <ellipse cx='21' cy='30' rx='16' ry='12' fill='#FFF000' />
      {/* Head */}
      <circle cx='30' cy='16' r='10' fill='#FFF000' />
      {/* Beak */}
      <path d='M38 14 L47 16.5 L38 20 Z' fill='#F4A81D' />
      {/* Eye */}
      <circle cx='33' cy='13' r='2' fill='#0F172A' />
    </svg>
  );
};
