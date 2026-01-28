import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

  public static renderSignUp(): string {
    return this.loadTemplate('sign-up.html');
  }

  public static renderCheckEmail(email: string): string {
    const template = this.loadTemplate('check-email.html');
    return template.replace('{{EMAIL}}', email);
  }

  public static renderPasswordSetup(): string {
    return this.loadTemplate('password-setup.html');
  }

  public static renderPasswordSuccess(): string {
    return this.loadTemplate('password-success.html');
  }

  public static renderMagicLinkConfirm(verifyUrl: string): string {
    const template = this.loadTemplate('magic-link-confirm.html');
    return template.replace('{{VERIFY_URL}}', verifyUrl);
  }
}
