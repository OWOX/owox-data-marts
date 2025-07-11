interface DatabricksIconProps {
  className?: string;
  size?: number;
}

export const DatabricksIcon = ({ className, size = 24 }: DatabricksIconProps) => {
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
        d='M45.8905 35.0619V26.9571L45.0149 26.4095L24 37.9095L4.0796 26.9571V22.2476L24 33.0905L46 21.1524V13.1571L45.1244 12.6095L24 24.219L4.84577 13.7048L24 3.19048L39.4328 11.6238L40.6368 10.9667V10.0905L24 1L2 12.9381V14.1429L24 26.1905L43.9204 15.2381V20.0571L24 31.0095L2.87562 19.4L2 19.9476V28.0524L24 39.9905L43.9204 29.1476V33.8571L24 44.8095L2.87562 33.3095L2 33.8571V35.0619L24 47L45.8905 35.0619Z'
        fill='#FF3621'
      />
    </svg>
  );
};
