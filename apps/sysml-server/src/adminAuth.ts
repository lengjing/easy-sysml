import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_SESSION_HEADER = 'x-admin-session';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'easy-sysml-admin';

interface AdminSession {
  token: string;
  username: string;
  expiresAt: number;
}

const adminSessions = new Map<string, AdminSession>();

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

export function getAdminSessionHeaderName(): string {
  return ADMIN_SESSION_HEADER;
}

export function getAdminUsername(): string {
  return process.env.EASY_SYSML_ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
}

export function getAdminPassword(): string {
  return process.env.EASY_SYSML_ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
}

export function createAdminSession(username: string, password: string): string | null {
  cleanupExpiredSessions();
  if (username !== getAdminUsername() || password !== getAdminPassword()) {
    return null;
  }

  const token = randomUUID();
  adminSessions.set(token, {
    token,
    username,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  return token;
}

export function getAdminSession(token: string | undefined): AdminSession | null {
  cleanupExpiredSessions();
  if (!token) {
    return null;
  }

  const session = adminSessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }

  return session;
}

export function destroyAdminSession(token: string | undefined): void {
  if (!token) {
    return;
  }
  adminSessions.delete(token);
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  const token = req.header(ADMIN_SESSION_HEADER)?.trim();
  const session = getAdminSession(token);
  if (!session) {
    res.status(401).json({ error: 'Admin session required' });
    return;
  }

  next();
}