import ejs from 'ejs';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Loads and renders EJS templates for auth pages with layout composition.
 */
export class TemplateService {
  private static getTemplatePath(templateName: string): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));

    const distPath = join(currentDir, '..', 'resources', 'templates', templateName);
    if (existsSync(distPath)) {
      return distPath;
    }

    const srcPath = join(currentDir, '..', '..', 'src', 'resources', 'templates', templateName);
    return srcPath;
  }

  private static loadTemplate(templateName: string): string {
    const templatePath = this.getTemplatePath(templateName);
    return readFileSync(templatePath, 'utf-8');
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

  public static renderSignIn(): string {
    return this.renderWithLayout('pages/sign-in.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Sign In - OWOX Data Marts',
      heading: 'Sign in to OWOX using your Google account',
    });
  }

  public static renderSignUp(): string {
    return this.renderWithLayout('pages/sign-up.ejs', 'layouts/auth.ejs', {
      pageTitle: 'Sign Up - OWOX Data Marts',
      heading: 'Sign up to OWOX using your Google account',
    });
  }
}

