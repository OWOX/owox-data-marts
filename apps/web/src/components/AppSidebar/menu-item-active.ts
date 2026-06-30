export function isSameOrNestedPath(pathname: string, targetPath: string): boolean {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function getActiveMenuItemClassName(isActive: boolean): string {
  return isActive
    ? 'bg-sidebar-active text-sidebar-active-foreground font-medium shadow-sm hover:bg-transparent'
    : '';
}
