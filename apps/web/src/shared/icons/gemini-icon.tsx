import { useId } from 'react';

interface GeminiIconProps {
  className?: string;
  size?: number;
}

/** The Google Gemini spark; the gradient id is per instance, as the icon repeats in lists. */
export const GeminiIcon = ({ className, size = 24 }: GeminiIconProps) => {
  const gradientId = `${useId()}-gemini`;

  return (
    <svg
      viewBox='0 0 24 24'
      width={size}
      height={size}
      className={className}
      xmlns='http://www.w3.org/2000/svg'
      style={{ minWidth: size, minHeight: size }}
    >
      <defs>
        <linearGradient id={gradientId} x1='0%' x2='68.73%' y1='100%' y2='30.395%'>
          <stop offset='0%' stopColor='#1C7DFF' />
          <stop offset='52.021%' stopColor='#1C69FF' />
          <stop offset='100%' stopColor='#F0DCD6' />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d='M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81'
      />
    </svg>
  );
};
