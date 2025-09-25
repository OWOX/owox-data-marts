import logoSvg from '../../assets/logo.svg';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export const Logo = ({ width = 45, height = 36, className = '' }: LogoProps) => {
  return <img src={logoSvg} alt='OWOX Logo' width={width} height={height} className={className} />;
};
