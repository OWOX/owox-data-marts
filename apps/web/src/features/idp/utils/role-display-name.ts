const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Project Admin',
  editor: 'Technical User',
  viewer: 'Business User',
};

export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}
