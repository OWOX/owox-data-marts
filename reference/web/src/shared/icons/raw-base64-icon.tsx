interface RawBase64IconProps {
  className?: string;
  size?: number;
  base64?: string | null;
}

export const RawBase64Icon = ({ className, size = 24, base64 }: RawBase64IconProps) => {
  return (
    <img
      src={base64 ?? undefined}
      alt='icon'
      className={className}
      style={{ width: size, height: size }}
    />
  );
};
