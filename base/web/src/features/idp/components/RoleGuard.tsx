import React from 'react';
import { useRole } from '../hooks';
import type { Role } from '../types';

/**
 * RoleGuard component props
 */
export interface RoleGuardProps {
  children: React.ReactNode;
  roles?: Role[];
  requiredRole?: Role;
  requireAll?: boolean;
  fallback?: React.ReactNode;
  adminOnly?: boolean;
  editorOnly?: boolean;
  viewerOnly?: boolean;
}

/**
 * Access denied fallback component
 */
function AccessDeniedFallback() {
  return (
    <div className='flex h-64 items-center justify-center'>
      <div className='text-center'>
        <h3 className='mb-4'>Access Denied</h3>
        <p className='text-sm'>You don't have permission to access this content.</p>
      </div>
    </div>
  );
}

/**
 * RoleGuard component
 * Controls access to content based on user roles
 */
export function RoleGuard({
  children,
  roles,
  requiredRole,
  requireAll = false,
  fallback,
  adminOnly = false,
  editorOnly = false,
  viewerOnly = false,
}: RoleGuardProps) {
  const roleChecks = useRole();

  let requiredRoles: Role[] = [];

  if (adminOnly) {
    requiredRoles = ['admin'];
  } else if (editorOnly) {
    requiredRoles = ['editor'];
  } else if (viewerOnly) {
    requiredRoles = ['viewer'];
  } else if (requiredRole) {
    requiredRoles = [requiredRole];
  } else if (roles) {
    requiredRoles = roles;
  }

  if (requiredRoles.length === 0) {
    return <>{children}</>;
  }

  let hasAccess = false;

  if (requireAll) {
    hasAccess = roleChecks.hasAllRoles(requiredRoles);
  } else {
    hasAccess = roleChecks.hasAnyRole(requiredRoles);
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : <AccessDeniedFallback />;
}
