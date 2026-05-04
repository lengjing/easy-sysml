import { Router, type Request, type Response } from 'express';
import {
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  getAdminSessionHeaderName,
} from '../adminAuth.js';

export const adminAuthRouter = Router();

adminAuthRouter.get('/session', (req: Request, res: Response) => {
  const token = req.header(getAdminSessionHeaderName())?.trim();
  const session = getAdminSession(token);
  res.json({
    authenticated: Boolean(session),
    username: session?.username,
  });
});

adminAuthRouter.post('/session/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || !password?.trim()) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const sessionToken = createAdminSession(username.trim(), password.trim());
  if (!sessionToken) {
    res.status(401).json({ error: 'Invalid admin credentials' });
    return;
  }

  res.json({
    ok: true,
    username: username.trim(),
    session_token: sessionToken,
    session_header: getAdminSessionHeaderName(),
  });
});

adminAuthRouter.delete('/session', (req: Request, res: Response) => {
  const token = req.header(getAdminSessionHeaderName())?.trim();
  destroyAdminSession(token);
  res.json({ ok: true });
});