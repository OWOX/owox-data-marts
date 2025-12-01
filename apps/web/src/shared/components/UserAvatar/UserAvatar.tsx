import { UserAvatarSize } from './UserAvatar.types.ts';

export function UserAvatar({
  avatar,
  initials,
  displayName,
  size = UserAvatarSize.NORMAL,
}: {
  avatar?: string | null;
  initials: string;
  displayName: string;
  size?: UserAvatarSize;
}) {
  let wrapperSizeClass, imageSizeClass, initialsSizeClass;

  switch (size) {
    case UserAvatarSize.SMALL:
      wrapperSizeClass = 'w-6 h-6';
      imageSizeClass = 'w-5 h-5';
      initialsSizeClass = 'text-[10px]';
      break;
    case UserAvatarSize.LARGE:
      wrapperSizeClass = 'w-16 h-16';
      imageSizeClass = 'w-15 h-15';
      initialsSizeClass = 'text-2xl';
      break;
    default:
      wrapperSizeClass = 'size-8';
      imageSizeClass = 'size-full';
      initialsSizeClass = 'text-sm';
  }

  return (
    <div
      className={`${wrapperSizeClass} flex aspect-square items-center justify-center rounded-full border bg-white dark:bg-white/10`}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={displayName}
          className={`${imageSizeClass} rounded-full object-cover`}
        />
      ) : (
        <span className={`${initialsSizeClass} text-muted-foreground font-medium`}>{initials}</span>
      )}
    </div>
  );
}
