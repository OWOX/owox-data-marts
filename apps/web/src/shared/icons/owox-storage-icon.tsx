import logoSvg from '../../assets/logo.svg';

interface OwoxStorageIconProps {
  className?: string;
  size?: number;
}

/** The OWOX mark: OWOX hosts an OWOX Storage, so it is not shown as Google BigQuery. */
export const OwoxStorageIcon = ({ className, size = 24 }: OwoxStorageIconProps) => {
  return (
    <img
      src={logoSvg}
      alt=''
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
};
