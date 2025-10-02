import React from 'react';
import { useAuthState } from '../hooks';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';
import { Button } from '@owox/ui/components/button';

/**
 * AuthGuard component props
 */
export interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * Unauthenticated fallback component
 */
function UnauthenticatedFallback() {
  return (
    <div className='flex h-screen items-center justify-center'>
      <div className='text-center'>
        <h2 className='mb-4 text-2xl font-bold text-gray-900'>Authentication Required</h2>
        <p className='mb-6 text-gray-600'>You need to sign in to access this page.</p>
        <Button onClick={() => (window.location.href = '/api/auth/sign-in')}>Sign In</Button>
      </div>
    </div>
  );
}

/**
 * AuthGuard component
 * Protects routes by checking authentication status
 */
export function AuthGuard({ children, fallback, redirectTo }: AuthGuardProps) {
  const { isLoading, isAuthenticated, isUnauthenticated } = useAuthState();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (isUnauthenticated) {
    if (redirectTo) {
      window.location.href = redirectTo;
      return <FullScreenLoader />;
    }

    return fallback ? <>{fallback}</> : <UnauthenticatedFallback />;
  }

  return fallback ? <>{fallback}</> : <UnauthenticatedFallback />;
}
