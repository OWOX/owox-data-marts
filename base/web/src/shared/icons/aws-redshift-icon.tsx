interface AwsRedshiftIconProps {
  className?: string;
  size?: number;
}

export const AwsRedshiftIcon = ({ className, size = 24 }: AwsRedshiftIconProps) => {
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
      <path d='M2 8.48783L5.5122 7.02441V40.9756L2 39.5122V8.48783Z' fill='#205B98' />
      <path d='M5.51172 7.02441L12.2434 8.48783V39.5122L5.51172 40.9756V7.02441Z' fill='#5294CF' />
      <path d='M12.2441 3.5122L18 0V48L12.2441 44.4878V3.5122Z' fill='#205B98' />
      <path d='M18 0H30V48H18V0Z' fill='#2D72B8' />
      <path d='M35.3665 3.5122L30 0V48L35.3665 44.4878V3.5122Z' fill='#5294CF' />
      <path d='M45.6099 8.48783L42.0977 7.02441V40.9756L45.6099 39.5122V8.48783Z' fill='#5294CF' />
      <path d='M42.0969 7.02441L35.3652 8.48783V39.5122L42.0969 40.9756V7.02441Z' fill='#205B98' />
    </svg>
  );
};
