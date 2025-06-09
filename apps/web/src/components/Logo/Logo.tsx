import React from 'react';
import logoSvg from '../../assets/logo.svg';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ width = 45, height = 36, className = '' }) => {
  return <img src={logoSvg} alt='OWOX Logo' width={width} height={height} className={className} />;
};

export default Logo;
