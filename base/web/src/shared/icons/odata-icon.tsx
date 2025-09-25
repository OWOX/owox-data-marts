interface ODataIconProps {
  className?: string;
  size?: number;
}

export const ODataIcon = ({ className, size = 24 }: ODataIconProps) => {
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
        d='M6.10815 8C6.10815 6.89543 7.00358 6 8.10815 6H40.1082C41.2127 6 42.1082 6.89543 42.1082 8V40C42.1082 41.1046 41.2127 42 40.1082 42H8.10816C7.00359 42 6.10815 41.1046 6.10815 40V8Z'
        fill='#FF9800'
      />
      <path d='M11 11H23V14H11V11Z' fill='white' />
      <path d='M11 16H23V19H11V16Z' fill='white' />
      <path d='M11 21H23V24H11V21Z' fill='white' />
      <path d='M11 26H23V29H11V26Z' fill='white' />
      <path d='M25 11H37V14H25V11Z' fill='white' />
      <path d='M25 16H37V19H25V16Z' fill='white' />
      <path d='M25 21H37V24H25V21Z' fill='white' />
      <path d='M25 26H37V29H25V26Z' fill='white' />
      <path d='M25 31H37V34H25V31Z' fill='white' />
      <path
        d='M13 35C13 32.7909 14.7909 31 17 31C19.2091 31 21 32.7909 21 35C21 37.2091 19.2091 39 17 39C14.7909 39 13 37.2091 13 35Z'
        fill='white'
      />
    </svg>
  );
};
