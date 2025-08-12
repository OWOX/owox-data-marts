import React from 'react';
import { RoleGuard } from './RoleGuard';

/**
 * Convenient components for specific role requirements
 */
export function AdminOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard adminOnly fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export function EditorOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard editorOnly fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

export function ViewerOnly({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard viewerOnly fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

/**
 * Component that shows content only if user can edit (admin or editor)
 */
export function CanEdit({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard roles={['admin', 'editor']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}

/**
 * Component that shows content only if user can view (any role)
 */
export function CanView({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return (
    <RoleGuard roles={['admin', 'editor', 'viewer']} fallback={fallback}>
      {children}
    </RoleGuard>
  );
}
