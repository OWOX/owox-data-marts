interface DataMartPlusIconProps {
  className?: string;
  size?: number;
}

export const DataMartPlusIcon = ({ className, size = 24 }: DataMartPlusIconProps) => {
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
      <path d='M16 16H22' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' />
      <path d='M19 13V19' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' />
      <path
        d='M21 9.99795V7.99795C20.9996 7.64722 20.9071 7.30276 20.7315 6.99911C20.556 6.69546 20.3037 6.44331 20 6.26795L13 2.26795C12.696 2.09241 12.3511 2 12 2C11.6489 2 11.304 2.09241 11 2.26795L4 6.26795C3.69626 6.44331 3.44398 6.69546 3.26846 6.99911C3.09294 7.30276 3.00036 7.64722 3 7.99795V15.9979C3.00036 16.3487 3.09294 16.6931 3.26846 16.9968C3.44398 17.3004 3.69626 17.5526 4 17.7279L11 21.7279C11.304 21.9035 11.6489 21.9959 12 21.9959C12.3511 21.9959 12.696 21.9035 13 21.7279L15 20.5879'
        stroke='currentColor'
        stroke-linecap='round'
        stroke-linejoin='round'
      />
      <path
        d='M3.28906 7L11.9991 12L20.7091 7'
        stroke='currentColor'
        stroke-linecap='round'
        stroke-linejoin='round'
      />
      <path d='M12 22V12' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' />
    </svg>
  );
};
