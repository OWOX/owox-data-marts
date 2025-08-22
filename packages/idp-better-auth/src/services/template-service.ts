import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export class TemplateService {
  private static getTemplatePath(templateName: string): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));

    const distPath = join(currentDir, '..', 'templates', templateName);
    if (existsSync(distPath)) {
      return distPath;
    }

    const srcPath = join(currentDir, '..', '..', 'src', 'templates', templateName);
    return srcPath;
  }

  public static loadTemplate(templateName: string): string {
    const templatePath = this.getTemplatePath(templateName);
    return readFileSync(templatePath, 'utf-8');
  }

  public static renderSignIn(): string {
    return this.loadTemplate('sign-in.html');
  }

  public static renderPasswordSetup(): string {
    return this.loadTemplate('password-setup.html');
  }

  public static renderPasswordSuccess(): string {
    return this.loadTemplate('password-success.html');
  }

  public static renderAdminDashboard(
    users: Array<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      createdAt: string;
      updatedAt: string | null;
    }>
  ): string {
    const template = this.loadTemplate('admin-dashboard.html');

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.length; // For now, all users are considered active
    const adminUsers = users.filter(u => u.role === 'admin').length;

    // Generate user rows
    const userRows = users
      .map(user => {
        const roleColors = {
          admin: 'red',
          editor: 'blue',
          viewer: 'gray',
        };
        const roleColor = roleColors[user.role as keyof typeof roleColors] || 'gray';

        const formattedCreatedAt = this.formatDate(user.createdAt);
        const formattedUpdatedAt = user.updatedAt ? this.formatDate(user.updatedAt) : 'Never';

        return `
        <tr class="table-row">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <div class="flex-shrink-0 h-10 w-10">
                <div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <svg class="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                </div>
              </div>
              <div class="ml-4">
                <div class="text-sm font-medium text-gray-900">${user.name || 'No name'}</div>
                <div class="text-sm text-gray-500">${user.email}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${roleColor}-100 text-${roleColor}-800">
              ${user.role}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formattedCreatedAt}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formattedUpdatedAt}</td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <a href="/auth/user/${user.id}" class="text-blue-600 hover:text-blue-900">View</a>
          </td>
        </tr>
      `;
      })
      .join('');

    return template
      .replace('{{TOTAL_USERS}}', totalUsers.toString())
      .replace('{{ACTIVE_USERS}}', activeUsers.toString())
      .replace('{{ADMIN_USERS}}', adminUsers.toString())
      .replace('{{USERS_ROWS}}', userRows);
  }

  public static renderUserDetails(
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      createdAt: string;
      updatedAt: string | null;
      organizationId: string | null;
    },
    currentUserRole?: string | null
  ): string {
    const template = this.loadTemplate('admin-user-details.html');

    const roleColors = {
      admin: 'red',
      editor: 'blue',
      viewer: 'gray',
    };
    const roleColor = roleColors[user.role as keyof typeof roleColors] || 'gray';

    // Show delete button only if current user is admin
    const showDeleteButton = currentUserRole === 'admin';
    const deleteButtonHtml = showDeleteButton ? '' : 'style="display: none;"';

    return template
      .replace(/{{USER_ID}}/g, user.id)
      .replace(/{{USER_NAME}}/g, user.name || 'No name set')
      .replace(/{{USER_EMAIL}}/g, user.email)
      .replace(/{{USER_ROLE}}/g, user.role)
      .replace(/{{ROLE_COLOR}}/g, roleColor)
      .replace('{{ORGANIZATION_ID}}', user.organizationId || 'Default Organization')
      .replace('{{CREATED_AT}}', this.formatDate(user.createdAt))
      .replace('{{UPDATED_AT}}', user.updatedAt ? this.formatDate(user.updatedAt) : 'Never')
      .replace('{{DELETE_BUTTON_STYLE}}', deleteButtonHtml);
  }

  public static renderAddUser(): string {
    return this.loadTemplate('admin-add-user.html');
  }

  private static formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  }
}
