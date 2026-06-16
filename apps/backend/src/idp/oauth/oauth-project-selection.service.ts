import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  IdpProvider,
  McpOAuthProjectMemberContext,
  OAuthAuthorizationRequest,
  ProjectMember,
  Projects,
  Role,
} from '@owox/idp-protocol';
import type { AuthorizationContext } from '../types';

const PROJECT_ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];
const PROJECT_ROLE_LABELS: Record<Role, string> = {
  admin: 'Project Admin',
  editor: 'Technical User',
  viewer: 'Business User',
};

interface RenderSelectionPageInput {
  authorizationRequest: OAuthAuthorizationRequest;
  projects: Projects;
  currentProjectId: string;
}

@Injectable()
export class OAuthProjectSelectionService {
  async loadProjects(provider: IdpProvider, accessToken: string): Promise<Projects> {
    const token = accessToken.trim();
    return provider.getProjects(/^Bearer\s+/i.test(token) ? token : `Bearer ${token}`);
  }

  async resolveSelectedProjectMember(
    provider: IdpProvider,
    context: AuthorizationContext,
    projects: Projects,
    selectedProjectId: string
  ): Promise<McpOAuthProjectMemberContext> {
    const project = projects.find(candidate => candidate.id === selectedProjectId);
    if (!project) {
      throw new BadRequestException('selected project is not available for user');
    }
    if (!this.isSelectableProject(project)) {
      throw new BadRequestException('selected project is not available for user');
    }

    if (project.id === context.projectId && context.roles && context.roles.length > 0) {
      return this.toProjectMemberContext(context, context.roles);
    }

    if (project.roles && project.roles.length > 0) {
      return this.toProjectMemberContext({ ...context, projectId: project.id }, project.roles);
    }

    const members = await provider.getProjectMembers(project.id, { forceFresh: true });
    const member = members.find(candidate => candidate.userId === context.userId);
    if (!member || !this.isActiveMember(member)) {
      throw new UnauthorizedException('User must be an active project member');
    }

    const role = this.toProjectRole(member.projectRole);
    if (!role) {
      throw new UnauthorizedException('User must have a supported project role');
    }

    return {
      userId: context.userId,
      projectId: project.id,
      roles: [role],
      email: member.email || context.email,
      fullName: member.fullName || context.fullName,
      avatar: member.avatar || context.avatar,
    };
  }

  renderSelectionPage(input: RenderSelectionPageInput): string {
    const hiddenFields = this.renderHiddenFields(input.authorizationRequest);
    const projects = this.filterSelectableProjects(input.projects);
    const rows = projects.map((project, index) =>
      this.renderProjectRow(project, input.currentProjectId, index)
    );
    const projectCount = projects.length;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Select project</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --background: oklch(1 0 0);
        --foreground: oklch(0.3346 0.0123 279.25);
        --primary: oklch(0.6179 0.2295 250.87);
        --primary-hover: oklch(0.54 0.23 250.87);
        --primary-foreground: oklch(0.985 0 0);
        --muted-foreground: oklch(0.5148 0.0128 274.72);
        --border: oklch(0.922 0 0);
        --table-head-bg: oklch(0.98 0 0);
        --table-hover-bg: oklch(0.97 0 0);
        color: var(--foreground);
        background: var(--background);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }
      .dialog {
        width: min(760px, 100%);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--background);
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.10);
      }
      .header {
        padding: 24px 28px 18px;
        border-bottom: 1px solid var(--border);
      }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 28px;
        font-weight: 650;
        letter-spacing: 0;
      }
      .content { padding: 18px 28px 24px; }
      .toolbar {
        display: flex;
        align-items: center;
        margin-bottom: 14px;
      }
      .search {
        position: relative;
        width: min(340px, 100%);
      }
      .search svg {
        position: absolute;
        left: 13px;
        top: 50%;
        width: 18px;
        height: 18px;
        transform: translateY(-50%);
        color: var(--muted-foreground);
        pointer-events: none;
      }
      .search input {
        width: 100%;
        height: 42px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--background);
        color: var(--foreground);
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
        font: inherit;
        font-size: 15px;
        outline: none;
        padding: 0 14px 0 42px;
      }
      .search input::placeholder { color: var(--muted-foreground); }
      .search input:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 18%, transparent);
      }
      .table-wrap {
        max-height: 280px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 8px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 15px;
        line-height: 22px;
      }
      thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--table-head-bg);
        color: var(--foreground);
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        text-transform: none;
      }
      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
      }
      tbody tr:last-child td { border-bottom: 0; }
      tbody tr[data-project-row] { cursor: pointer; }
      tbody tr[data-project-row]:hover { background: var(--table-hover-bg); }
      tbody td { padding: 0; }
      .cell-label {
        display: block;
        min-height: 46px;
        padding: 12px 14px;
        cursor: pointer;
      }
      .radio-cell { width: 48px; text-align: center; }
      .radio-cell .cell-label {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      input[type="radio"] { width: 16px; height: 16px; accent-color: var(--primary); }
      .project-title { font-weight: 600; color: var(--foreground); }
      .project-id { margin-top: 2px; color: var(--muted-foreground); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--border);
        padding: 2px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--foreground);
        background: var(--table-head-bg);
      }
      .badge.active { border-color: #bbf7d0; color: #15803d; background: #f0fdf4; }
      .badge.blocked { border-color: #fecaca; color: #b91c1c; background: #fef2f2; }
      .roles, .created { color: var(--muted-foreground); white-space: nowrap; }
      .empty-row[hidden] { display: none; }
      .empty-row td {
        padding: 18px 14px;
        color: var(--muted-foreground);
        text-align: center;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 18px;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 96px;
        height: 38px;
        border: 1px solid var(--primary);
        border-radius: 6px;
        background: var(--primary);
        color: var(--primary-foreground);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 150ms ease, border-color 150ms ease, opacity 150ms ease;
      }
      button:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
      button:disabled { cursor: wait; opacity: 0.75; }
      .spinner {
        display: none;
        width: 16px;
        height: 16px;
        border: 2px solid color-mix(in oklch, var(--primary-foreground) 35%, transparent);
        border-top-color: var(--primary-foreground);
        border-radius: 999px;
        animation: spin 700ms linear infinite;
      }
      form.is-submitting .spinner { display: inline-block; }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @media (max-width: 640px) {
        .dialog { width: 100%; }
        .header, .content { padding-left: 18px; padding-right: 18px; }
        th:nth-child(4), td:nth-child(4) { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="dialog" aria-labelledby="select-project-title">
      <div class="header">
        <h1 id="select-project-title">Select project (${projectCount})</h1>
      </div>
      <div class="content">
        <form method="get" action="/oauth/authorize">
          ${hiddenFields}
          <div class="toolbar">
            <label class="search" for="project-search">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
                <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
              </svg>
              <input id="project-search" type="search" placeholder="Search" autocomplete="off">
            </label>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="radio-cell"></th>
                  <th>Project</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                ${rows.join('\n')}
                <tr class="empty-row" hidden>
                  <td colspan="5">No projects found</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="actions">
            <button type="submit">
              <span class="button-label">Next</span>
              <span class="spinner" aria-hidden="true"></span>
            </button>
          </div>
        </form>
      </div>
    </main>
    <script>
      (() => {
        const form = document.querySelector('form');
        const submitButton = form?.querySelector('button[type="submit"]');
        const searchInput = document.getElementById('project-search');
        const projectRows = Array.from(document.querySelectorAll('[data-project-row]'));
        const emptyRow = document.querySelector('.empty-row');
        if (!form || !submitButton) return;

        searchInput?.addEventListener('input', () => {
          const query = searchInput.value.trim().toLowerCase();
          let visibleCount = 0;

          projectRows.forEach(row => {
            const searchableText = row.dataset.search ?? '';
            const visible = searchableText.includes(query);
            row.hidden = !visible;
            if (visible) visibleCount += 1;
          });

          if (emptyRow) {
            emptyRow.hidden = visibleCount > 0;
          }
        });

        form.addEventListener('submit', event => {
          if (form.dataset.submitting === 'true') {
            event.preventDefault();
            return;
          }

          form.dataset.submitting = 'true';
          form.classList.add('is-submitting');
          form.setAttribute('aria-busy', 'true');
          submitButton.disabled = true;
        });
      })();
    </script>
  </body>
</html>`;
  }

  private toProjectMemberContext(
    context: AuthorizationContext,
    roles: Role[]
  ): McpOAuthProjectMemberContext {
    return {
      userId: context.userId,
      projectId: context.projectId,
      roles,
      email: context.email,
      fullName: context.fullName,
      avatar: context.avatar,
    };
  }

  private isActiveMember(member: ProjectMember): boolean {
    return member.userStatus === 'active' && member.isOutbound !== true;
  }

  filterSelectableProjects(projects: Projects): Projects {
    return projects.filter(project => this.isSelectableProject(project));
  }

  private isSelectableProject(project: Projects[number]): boolean {
    return project.status !== 'removed';
  }

  private toProjectRole(role: string): Role | null {
    return PROJECT_ROLES.includes(role as Role) ? (role as Role) : null;
  }

  private renderHiddenFields(request: OAuthAuthorizationRequest): string {
    const fields: Record<string, string> = {
      response_type: 'code',
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      resource: request.resource,
      scope: request.scopes.join(' '),
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: request.codeChallengeMethod,
    };

    return Object.entries(fields)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${this.escapeAttribute(name)}" value="${this.escapeAttribute(value)}">`
      )
      .join('\n');
  }

  private renderProjectRow(
    project: Projects[number],
    currentProjectId: string,
    index: number
  ): string {
    const checked = project.id === currentProjectId ? ' checked' : '';
    const status = project.status ?? 'unknown';
    const inputId = `project-radio-${index}`;
    const searchText = [
      project.title,
      project.id,
      this.formatRoles(project.roles),
      this.formatStatus(status),
      this.formatDate(project.createdAt),
    ]
      .join(' ')
      .toLowerCase();
    return `<tr data-project-row data-search="${this.escapeAttribute(searchText)}">
      <td class="radio-cell"><label class="cell-label" for="${this.escapeAttribute(inputId)}"><input id="${this.escapeAttribute(inputId)}" type="radio" name="selected_project_id" value="${this.escapeAttribute(project.id)}"${checked} required aria-label="Select ${this.escapeAttribute(project.title)}"></label></td>
      <td>
        <label class="cell-label" for="${this.escapeAttribute(inputId)}">
          <div class="project-title">${this.escapeHtml(project.title)}</div>
          <div class="project-id">${this.escapeHtml(project.id)}</div>
        </label>
      </td>
      <td class="roles"><label class="cell-label" for="${this.escapeAttribute(inputId)}">${this.escapeHtml(this.formatRoles(project.roles))}</label></td>
      <td><label class="cell-label" for="${this.escapeAttribute(inputId)}"><span class="badge ${this.escapeAttribute(status)}">${this.escapeHtml(this.formatStatus(status))}</span></label></td>
      <td class="created"><label class="cell-label" for="${this.escapeAttribute(inputId)}">${this.escapeHtml(this.formatDate(project.createdAt))}</label></td>
    </tr>`;
  }

  private formatRoles(roles: Role[] | undefined): string {
    if (!roles || roles.length === 0) {
      return '-';
    }
    return roles.map(role => PROJECT_ROLE_LABELS[role]).join(', ');
  }

  private formatStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private formatDate(value: string | undefined): string {
    if (!value) {
      return '-';
    }

    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }
}
