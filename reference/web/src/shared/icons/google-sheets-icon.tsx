interface GoogleSheetsIconProps {
  className?: string;
  size?: number;
}

export const GoogleSheetsIcon = ({ className, size = 24 }: GoogleSheetsIconProps) => {
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
        fillRule='evenodd'
        clipRule='evenodd'
        d='M28 0C19.7661 0 12 0 10 0C8.19719 0 6 2.18498 6 4V44C6 45.815 8.18947 47.9993 10 47.9993H38C39.8105 47.9993 42 45.815 42 44C42 44 42 25.6447 42 14L28 0Z'
        fill='#00A65F'
      />
      <path fillRule='evenodd' clipRule='evenodd' d='M28 14H42V24L28 14Z' fill='#007944' />
      <path fillRule='evenodd' clipRule='evenodd' d='M28 0V13.9683L42 14L28 0Z' fill='#64C3A7' />
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M12 42L12.0563 22H36V42H12ZM34 24H14V40H34V24Z'
        fill='white'
      />
      <path fillRule='evenodd' clipRule='evenodd' d='M20 22H22V42H20V22Z' fill='white' />
      <path fillRule='evenodd' clipRule='evenodd' d='M36 28V30H12V28H36Z' fill='white' />
      <path fillRule='evenodd' clipRule='evenodd' d='M36 34V36H12V34H36Z' fill='white' />
    </svg>
  );
};
