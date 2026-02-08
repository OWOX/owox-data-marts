import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Loads and renders static HTML templates for auth pages.
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

  public static loadTemplate(templateName: string): string {
    const templatePath = this.getTemplatePath(templateName);
    return readFileSync(templatePath, 'utf-8');
  }

  public static renderSignIn(): string {
    return this.loadTemplate('sign-in.html');
  }

  public static renderSignUp(): string {
    return this.loadTemplate('sign-up.html');
  }
}
