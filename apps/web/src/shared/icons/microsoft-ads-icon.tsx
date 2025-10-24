interface MicrosoftAdsIconProps {
  className?: string;
  size?: number;
}

export const MicrosoftAdsIcon = ({ className, size = 24 }: MicrosoftAdsIconProps) => {
  return (
    <svg
      role='img'
      viewBox='0 0 24 24'
      width={size}
      height={size}
      className={className}
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
    >
      <path d='M2 2H11.5V11.5H2V2Z' fill='#F25022' />
      <path d='M12.5 2H22V11.5H12.5V2Z' fill='#7FBA00' />
      <path d='M2 12.5H11.5V22H2V12.5Z' fill='#00A4EF' />
      <path d='M12.5 12.5H22V22H12.5V12.5Z' fill='#FFB900' />
    </svg>
  );
};
