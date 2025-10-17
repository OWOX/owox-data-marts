interface XAdsIconProps {
  className?: string;
  size?: number;
}

export const XAdsIcon = ({ className, size = 24 }: XAdsIconProps) => {
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
      <path
        d='M0 4C0 1.79086 1.79086 0 4 0H20C22.2091 0 24 1.79086 24 4V20C24 22.2091 22.2091 24 20 24H4C1.79086 24 0 22.2091 0 20V4Z'
        fill='black'
      />
      <path
        d='M16.6445 4.83984H19.098L13.7119 10.7813L20 18.8398H15.066L11.1999 13.9401L6.77328 18.8398H4.31983L10.0257 12.4857L4 4.83984H9.06085L12.554 9.31329L16.6445 4.83984ZM15.7859 17.4411H17.1465L8.34639 6.18293H6.88494L15.7859 17.4411Z'
        fill='white'
      />
    </svg>
  );
};
