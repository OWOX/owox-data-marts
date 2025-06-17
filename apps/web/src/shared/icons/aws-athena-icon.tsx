interface AwsAthenaIconProps {
  className?: string;
  size?: number;
}

export const AwsAthenaIcon = ({ className, size = 24 }: AwsAthenaIconProps) => {
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
      <path
        d='M24 46C36.1503 46 46 36.1503 46 24C46 11.8497 36.1503 2 24 2C11.8497 2 2 11.8497 2 24C2 36.1503 11.8497 46 24 46Z'
        fill='#FF9900'
      />
      <path
        d='M16.9283 17.9315V32.0659L24 36.1323L31.0717 32.0659V17.9315L24 13.8651L16.9283 17.9315Z'
        fill='#FFFFFF'
      />
      <path d='M24 18.7983L16.9283 14.732V26.8994L24 30.9658V18.7983Z' fill='#D86613' />
      <path d='M24 18.7983L31.0717 14.732V26.8994L24 30.9658V18.7983Z' fill='#FFFFFF' />
      <path
        d='M16.9283 26.8994L24 22.8331L31.0717 26.8994L24 30.9658L16.9283 26.8994Z'
        fill='#D86613'
      />
    </svg>
  );
};
