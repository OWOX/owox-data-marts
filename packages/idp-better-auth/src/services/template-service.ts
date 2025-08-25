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

  private static getOwoxTailwindConfig(): string {
    return `
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            // OWOX Design System Colors
            background: "oklch(1 0 0)",
            foreground: "oklch(0.3346 0.0123 279.25)",
            card: "oklch(1 0 0)",
            'card-foreground': "oklch(0.3346 0.0123 279.25)",
            primary: {
              DEFAULT: "oklch(0.6179 0.2295 250.87)",
              hover: "oklch(0.54 0.23 250.87)",
              foreground: "oklch(0.985 0 0)",
            },
            secondary: {
              DEFAULT: "oklch(0.97 0 0)",
              foreground: "oklch(0.205 0 0)",
            },
            muted: {
              DEFAULT: "oklch(0.97 0 0)",
              foreground: "oklch(0.5148 0.0128 274.72)",
            },
            accent: {
              DEFAULT: "oklch(0.97 0 0)",
              foreground: "oklch(0.205 0 0)",
            },
            destructive: {
              DEFAULT: "oklch(0.577 0.245 27.325)",
              foreground: "oklch(0.985 0 0)",
            },
            border: "oklch(0.922 0 0)",
            input: "oklch(0.922 0 0)",
            ring: "oklch(0.708 0 0)",
            success: {
              DEFAULT: "oklch(0.647 0.165 142.495)",
              foreground: "oklch(0.985 0 0)",
            },
            'brand-blue': {
              50: "oklch(0.985 0.03 250.87)",
              100: "oklch(0.955 0.05 250.87)",
              200: "oklch(0.9 0.08 250.87)",
              300: "oklch(0.8 0.14 250.87)",
              400: "oklch(0.7 0.19 250.87)",
              500: "oklch(0.6179 0.2295 250.87)",
              600: "oklch(0.54 0.23 250.87)",
              700: "oklch(0.44 0.2 250.87)",
              800: "oklch(0.36 0.17 250.87)",
              900: "oklch(0.28 0.14 250.87)",
            },
          },
        },
      },
    }`;
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
    }>,
    currentUserEmail: string
  ): string {
    const template = this.loadTemplate('admin-dashboard.html');

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.length; // For now, all users are considered active
    const adminUsers = users.filter(u => u.role === 'admin').length;

    // Generate user rows
    const userRows = users
      .map(user => {
        const getRoleBadgeClasses = (role: string) => {
          switch (role) {
            case 'admin':
              return 'bg-primary text-primary-foreground';
            case 'editor':
              return 'bg-success text-success-foreground';
            case 'viewer':
              return 'bg-muted text-muted-foreground';
            default:
              return 'bg-muted text-muted-foreground';
          }
        };
        const roleBadgeClasses = getRoleBadgeClasses(user.role);

        const formattedCreatedAt = this.formatDate(user.createdAt);
        const formattedUpdatedAt = user.updatedAt ? this.formatDate(user.updatedAt) : 'Never';

        return `
        <tr class="table-row">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              <div class="flex-shrink-0 h-10 w-10">
                <div class="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <svg class="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                </div>
              </div>
              <div class="ml-4">
                <div class="text-sm font-medium text-foreground">${user.name || 'No name'}</div>
                <div class="text-sm text-muted-foreground">${user.email}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeClasses}">
              ${user.role}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">${formattedCreatedAt}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">${formattedUpdatedAt}</td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <a href="/auth/user/${user.id}" class="text-primary hover:text-primary/80 font-medium transition-colors">View</a>
          </td>
        </tr>
      `;
      })
      .join('');

    return template
      .replace('{{TOTAL_USERS}}', totalUsers.toString())
      .replace('{{ACTIVE_USERS}}', activeUsers.toString())
      .replace('{{ADMIN_USERS}}', adminUsers.toString())
      .replace('{{USERS_ROWS}}', userRows)
      .replace('{{CURRENT_USER_EMAIL}}', currentUserEmail);
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

    const getRoleBadgeClasses = (role: string) => {
      switch (role) {
        case 'admin':
          return 'bg-primary text-primary-foreground';
        case 'editor':
          return 'bg-success text-success-foreground';
        case 'viewer':
          return 'bg-muted text-muted-foreground';
        default:
          return 'bg-muted text-muted-foreground';
      }
    };
    const roleBadgeClasses = getRoleBadgeClasses(user.role);

    // Show delete button only if current user is admin
    const showDeleteButton = currentUserRole === 'admin';
    const deleteButtonHtml = showDeleteButton ? '' : 'style="display: none;"';

    return template
      .replace(/{{USER_ID}}/g, user.id)
      .replace(/{{USER_NAME}}/g, user.name || 'No name set')
      .replace(/{{USER_EMAIL}}/g, user.email)
      .replace(/{{USER_ROLE}}/g, user.role)
      .replace(/{{ROLE_BADGE_CLASSES}}/g, roleBadgeClasses)
      .replace('{{ORGANIZATION_ID}}', user.organizationId || 'Default Organization')
      .replace('{{CREATED_AT}}', this.formatDate(user.createdAt))
      .replace('{{UPDATED_AT}}', user.updatedAt ? this.formatDate(user.updatedAt) : 'Never')
      .replace('{{DELETE_BUTTON_STYLE}}', deleteButtonHtml);
  }

  public static renderAddUser(allowedRoles: string[] = ['admin', 'editor', 'viewer']): string {
    const template = this.loadTemplate('admin-add-user.html');

    // Generate role options based on allowed roles
    const roleOptions = allowedRoles
      .map(
        role => `<option value="${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</option>`
      )
      .join('');

    return template.replace('{{ROLE_OPTIONS}}', roleOptions);
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
