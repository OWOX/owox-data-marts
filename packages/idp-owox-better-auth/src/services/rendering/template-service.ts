import ejs from 'ejs';
import { readFileSync } from 'fs';
import { resolveResourcePath } from '../../utils/template-paths.js';

/**
 * Loads and renders EJS templates for auth pages with layout composition.
 */
export class TemplateService {
  private static readonly templateCache = new Map<string, string>();

  private static getTemplatePath(templateName: string): string {
    return resolveResourcePath(`templates/${templateName}`);
  }

  private static loadTemplate(templateName: string): string {
    const cached = this.templateCache.get(templateName);
    if (cached) {
      return cached;
    }
    const templatePath = this.getTemplatePath(templateName);
    const content = readFileSync(templatePath, 'utf-8');
    this.templateCache.set(templateName, content);
    return content;
  }

  /**
   * Renders an EJS template with layout composition.
   * @param pagePath - Path to page template (e.g., 'pages/sign-in.ejs')
   * @param layoutPath - Path to layout template (e.g., 'layouts/auth.ejs')
   * @param data - Data to pass to templates
   */
  private static renderWithLayout(
    pagePath: string,
    layoutPath: string,
    data: Record<string, unknown>
  ): string {
    // 1. Load and render page content
    const pageTemplate = this.loadTemplate(pagePath);
    const pageContent = ejs.render(pageTemplate, data, {
      filename: this.getTemplatePath(pagePath),
    });

    // 2. Load and render layout with page content injected
    const layoutTemplate = this.loadTemplate(layoutPath);
    return ejs.render(
      layoutTemplate,
      { ...data, body: pageContent },
      {
        filename: this.getTemplatePath(layoutPath),
      }
    );
  }

  public static renderSignIn(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/sign-in.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Sign In - OWOX Data Marts',
      heading: 'Sign in to OWOX',
      ...data,
    });
  }

  public static renderSignUp(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/sign-up.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Sign Up - OWOX Data Marts',
      heading: 'Create your OWOX account',
      ...data,
    });
  }

  public static renderMagicLinkConfirm(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/magic-link-confirm.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Confirm your email',
      heading: 'Confirm your email',
      ...data,
    });
  }

  public static renderPasswordSetup(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/password-setup.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Set password',
      heading: 'Set your password',
      intent: 'signup',
      resetToken: '',
      errorMessage: '',
      infoMessage: '',
      ...data,
    });
  }

  public static renderPasswordSuccess(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/password-success.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Password updated',
      heading: 'Password updated',
      ...data,
    });
  }

  public static renderForgotPassword(data: Record<string, unknown> = {}): string {
    return this.renderWithLayout('pages/forgot-password.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Forgot password',
      heading: 'Reset your password',
      ...data,
    });
  }
}
