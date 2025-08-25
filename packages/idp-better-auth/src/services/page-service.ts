import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { AuthenticationService } from './authentication-service.js';
import { TemplateService } from './template-service.js';
import { UserManagementService } from './user-management-service.js';
import { CryptoService } from './crypto-service.js';
import { Role } from '../types/index.js';

export class PageService {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly userManagementService: UserManagementService,
    private readonly cryptoService: CryptoService
  ) {}

  async signInPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const session = await this.authenticationService.getSession(req);
      if (session) {
        res.redirect('/');
        return;
      }
    } catch (error) {
      console.error('Error checking authentication for sign-in page:', error);
      res.send(TemplateService.renderSignIn());
      return;
    }
    res.send(TemplateService.renderSignIn());
  }

  async setupPasswordPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const session = await this.authenticationService.getSession(req);

      if (!session || !session.user) {
        res.redirect('/auth/sign-in?error=Invalid or expired magic link');
        return;
      }

      res.send(TemplateService.renderPasswordSetup());
    } catch (error) {
      console.error('Error loading password setup page:', error);
      res.redirect('/auth/sign-in');
    }
  }

  async setPassword(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const { password, confirmPassword } = req.body;

    if (!password || password !== confirmPassword) {
      res.status(400).send('Passwords do not match');
      return;
    }

    try {
      const session = await this.authenticationService.getSession(req);

      if (!session || !session.user) {
        res.redirect('/auth/sign-in');
        return;
      }

      try {
        await this.authenticationService.setPassword(password, req);

        //TODO: this is not working
        res.setHeader(
          'Set-Cookie',
          `refreshToken=${session.session.token}; Path=/; HttpOnly; SameSite=Strict`
        );
        res.send(TemplateService.renderPasswordSuccess());
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'User already has a password') {
          res.status(400).send('User already has a password');
        } else {
          console.error('Failed to set password:', error);
          res.status(500).send('Failed to set password. Please try again.');
        }
      }
    } catch (error) {
      console.error('Password update failed:', error);
      res.status(500).send('Failed to set password');
    }
  }

  async magicLinkSuccess(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (req.query.error) {
        res.redirect(`/auth/sign-in?error=Magic link verification failed: ${req.query.error}`);
        return;
      }

      const session = await this.authenticationService.getSession(req);

      if (!session || !session.user || !req.query.role) {
        res.redirect('/auth/sign-in?error=Invalid magic link');
        return;
      }

      let role: string;
      try {
        role = await this.cryptoService.decrypt(req.query.role as string);
      } catch (error) {
        console.error('Failed to decrypt role:', error);
        res.redirect('/auth/sign-in?error=Invalid magic link');
        return;
      }

      if (this.userManagementService) {
        try {
          if (session?.user?.id) {
            if (!session.user.name && session.user.email) {
              const generatedName = this.generateNameFromEmail(session.user.email);
              await this.userManagementService.updateUserName(session.user.id, generatedName);
            }

            await this.userManagementService.addMemberToOrganization(req, role as Role);
          }
        } catch (error) {
          console.error('Failed to ensure user in organization after magic link success:', error);
          throw new Error(
            `Failed to ensure user in organization after magic link success: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      res.redirect('/auth/setup-password');
    } catch (error) {
      console.error('Magic link success handler failed:', error);
      res.redirect('/auth/sign-in?error=Something went wrong');
    }
  }

  registerRoutes(express: Express): void {
    try {
      express.get('/auth/setup-password', this.setupPasswordPage.bind(this));
      express.post('/auth/set-password', this.setPassword.bind(this));
      express.get('/auth/magic-link-success', this.magicLinkSuccess.bind(this));

      express.get('/auth', (req, res) => {
        res.redirect('/auth/dashboard');
      });
      express.get(
        '/auth/dashboard',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminDashboard.bind(this)
      );
      express.get(
        '/auth/user/:id',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminUserDetails.bind(this)
      );
      express.get(
        '/auth/add-user',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminAddUserPage.bind(this)
      );
      express.post(
        '/auth/add-user',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminAddUser.bind(this)
      );
      express.post(
        '/auth/delete-user/:id',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminDeleteUser.bind(this)
      );
      express.post(
        '/auth/generate-magic-link',
        this.authenticationService.requireAuthMiddleware.bind(this.authenticationService),
        this.adminGenerateMagicLink.bind(this)
      );
    } catch (error) {
      console.error('Failed to register page routes:', error);
      throw new Error('Failed to register page routes');
    }
  }

  async adminDashboard(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const session = await this.authenticationService.getSession(req);
      const currentUserEmail = session?.user?.email || 'Unknown User';

      const users = await this.userManagementService.getUsersForAdmin();
      const html = TemplateService.renderAdminDashboard(users, currentUserEmail);
      res.send(html);
    } catch (error) {
      console.error('Error loading admin dashboard:', error);
      res.status(500).send('Error loading dashboard');
    }
  }

  async adminUserDetails(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const userId = req.params.id;
      if (!userId) {
        res.status(400).send('User ID is required');
        return;
      }

      const user = await this.userManagementService.getUserDetails(userId);

      if (!user) {
        res.status(404).send('User not found');
        return;
      }

      // Get current user role to determine if delete button should be shown
      const session = await this.authenticationService.getSession(req);
      const currentUserRole = session?.user?.id
        ? await this.userManagementService.getUserRole(session.user.id)
        : null;

      const html = TemplateService.renderUserDetails(user, currentUserRole);
      res.send(html);
    } catch (error) {
      console.error('Error loading user details:', error);
      res.status(500).send('Error loading user details');
    }
  }

  async adminAddUserPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      // Get current user role to determine available roles for invitation
      const session = await this.authenticationService.getSession(req);
      if (!session?.user?.id) {
        res.redirect('/auth/sign-in');
        return;
      }

      const currentUserRole = await this.userManagementService.getUserRole(session.user.id);
      if (!currentUserRole) {
        res.status(403).send('Access denied');
        return;
      }

      if (!this.userManagementService.isValidRole(currentUserRole)) {
        res.status(403).send('Access denied');
        return;
      }

      const allowedRoles = this.userManagementService.getAllowedRolesForInvite(currentUserRole);
      const html = TemplateService.renderAddUser(allowedRoles);
      res.send(html);
    } catch (error) {
      console.error('Error loading add user page:', error);
      res.status(500).send('Error loading page');
    }
  }

  async adminAddUser(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const { email, role } = req.body;

      if (!email || !role) {
        res.status(400).json({ error: 'Email and role are required' });
        return;
      }

      // Validate role
      if (!this.userManagementService.isValidRole(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      // Get current user role and check permissions
      const session = await this.authenticationService.getSession(req);
      if (!session?.user?.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const currentUserRole = await this.userManagementService.getUserRole(session.user.id);
      if (!currentUserRole || !this.userManagementService.isValidRole(currentUserRole)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if current user can invite target role
      if (!this.userManagementService.canInviteRole(currentUserRole, role)) {
        res.status(403).json({
          error: `You don't have permission to invite users with role: ${role}`,
        });
        return;
      }

      const magicLink = await this.userManagementService.generateMagicLinkForUser(
        email,
        role as Role
      );

      res.json({
        success: true,
        magicLink,
        email,
        role,
      });
    } catch (error) {
      console.error('Error adding user:', error);
      res.status(500).json({ error: 'Failed to generate magic link' });
    }
  }

  async adminDeleteUser(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const userId = req.params.id;
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      // Check if current user has admin role
      const session = await this.authenticationService.getSession(req);
      if (!session || !session.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const currentUserRole = await this.userManagementService.getUserRole(session.user.id);
      if (currentUserRole !== 'admin') {
        res.status(403).json({ error: 'Only admins can delete users' });
        return;
      }

      await this.userManagementService.removeUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  async adminGenerateMagicLink(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const { userId, email, role } = req.body || {};

      if (!email || !role) {
        res.status(400).json({ error: 'Email and role are required' });
        return;
      }

      // Validate role
      if (!this.userManagementService.isValidRole(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      // Get current user role and check permissions
      const session = await this.authenticationService.getSession(req);
      if (!session?.user?.id) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const currentUserRole = await this.userManagementService.getUserRole(session.user.id);
      if (!currentUserRole || !this.userManagementService.isValidRole(currentUserRole)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if current user can invite target role
      if (!this.userManagementService.canInviteRole(currentUserRole, role)) {
        res.status(403).json({
          error: `You don't have permission to generate magic link for role: ${role}`,
        });
        return;
      }

      const magicLink = await this.userManagementService.generateMagicLinkForUser(
        email,
        role as Role
      );

      res.json({
        success: true,
        magicLink,
        userId,
        email,
        role,
      });
    } catch (error) {
      console.error('Error generating magic link:', error);
      res.status(500).json({ error: 'Failed to generate magic link' });
    }
  }

  private generateNameFromEmail(email: string): string {
    try {
      const parts = email.split('@');
      const localPart = parts[0];

      if (!localPart) {
        return email; // Fallback to full email
      }

      // Convert dots and underscores to spaces and capitalize
      return localPart
        .replace(/[._]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } catch (error) {
      console.error('Error generating name from email:', error);
      return email; // Fallback to full email
    }
  }
}
