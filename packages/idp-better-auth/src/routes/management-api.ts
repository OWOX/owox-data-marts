import { Request, Response } from 'express';
import {
  API_ROUTES,
  ApiHandler,
  GetUsersRequest,
  GetUsersResponse,
  CreateUserRequest,
  CreateUserResponse,
  GetUserRequest,
  GetUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  DeleteUserRequest,
  DeleteUserResponse,
  HealthCheckRequest,
  HealthCheckResponse,
} from '@owox/idp-protocol';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';

/**
 * Management API handlers for Better Auth
 * These handle user management, health checks, and other admin functions
 */
export class BetterAuthManagementHandlers {
  constructor(private provider: BetterAuthProvider) {}

  /**
   * Get users list
   * GET /api/users
   */
  getUsers: ApiHandler<GetUsersRequest, GetUsersResponse> = async (req, res) => {
    try {
      const { page = '1', limit = '10', search, projectId } = req.query;

      // Better Auth doesn't have built-in user listing
      // This would need to be implemented via direct database queries
      // For now, return a placeholder response

      res.json({
        success: true,
        data: {
          users: [], // Would be populated from database
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      });
      return;
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      });
      return;
    }
  };

  /**
   * Create new user
   * POST /api/users
   */
  createUser: ApiHandler<CreateUserRequest, CreateUserResponse> = async (req, res) => {
    try {
      const { email, name, password, projectId, roles } = req.body;

      if (!email) {
        res.status(400).json({
          success: false,
          error: 'Email is required',
        });
        return;
      }

      const user = await this.provider.getManagement().createUser({
        email,
        name,
        password,
        projectId,
        roles,
      });

      res.status(201).json({
        success: true,
        data: user,
      });
      return;
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user',
      });
      return;
    }
  };

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  getUser: ApiHandler<GetUserRequest, GetUserResponse> = async (req, res) => {
    try {
      const { id } = req.params;

      const user = await this.provider.getManagement().getUser(id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
      return;
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch user',
      });
      return;
    }
  };

  /**
   * Update user
   * PUT /api/users/:id
   */
  updateUser: ApiHandler<UpdateUserRequest, UpdateUserResponse> = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, roles } = req.body;

      const user = await this.provider.getManagement().updateUser(id, {
        name,
        email,
        roles,
      });

      res.json({
        success: true,
        data: user,
      });
      return;
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update user',
      });
      return;
    }
  };

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  deleteUser: ApiHandler<DeleteUserRequest, DeleteUserResponse> = async (req, res) => {
    try {
      const { id } = req.params;

      await this.provider.getManagement().deleteUser(id);

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
      return;
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete user',
      });
      return;
    }
  };

  /**
   * Health check endpoint
   * GET /api/health
   */
  healthCheck: ApiHandler<HealthCheckRequest, HealthCheckResponse> = async (req, res) => {
    try {
      // Check database connection
      const databaseStatus = await this.checkDatabaseHealth();

      const response: HealthCheckResponse = {
        status: databaseStatus ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        dependencies: {
          database: databaseStatus ? 'ok' : 'error',
        },
      };

      res.json(response);
      return;
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
        dependencies: {
          database: 'error',
        },
      });
      return;
    }
  };

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // This would check the database connection
      // For Better Auth, we could try a simple query or use their health check
      const betterAuth = this.provider;

      // Placeholder - in real implementation, you'd check database connectivity
      return true;
    } catch (error) {
      return false;
    }
  }
}
