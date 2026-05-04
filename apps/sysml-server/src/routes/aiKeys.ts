import { Router, type Request, type Response } from 'express';
import { requireAdminSession } from '../adminAuth.js';
import { createAiApiKey, listAiApiKeys, rechargeAiApiKey, revokeAiApiKey } from '../aiKeys.js';

export const aiKeysRouter = Router();

aiKeysRouter.use(requireAdminSession);

aiKeysRouter.get('/', (_req: Request, res: Response) => {
  res.json(listAiApiKeys());
});

aiKeysRouter.post('/', (req: Request, res: Response) => {
  const { name, balance_usd } = req.body as { name?: string; balance_usd?: number };
  const trimmedName = name?.trim() || 'Default key';
  const initialBalanceUsd =
    typeof balance_usd === 'number' && Number.isFinite(balance_usd) && balance_usd >= 0
      ? balance_usd
      : null;
  const created = createAiApiKey(trimmedName, initialBalanceUsd);
  res.status(201).json({
    record: created.record,
    api_key: created.plaintextKey,
  });
});

aiKeysRouter.post('/:id/recharge', (req: Request, res: Response) => {
  const { amount_usd } = req.body as { amount_usd?: number };
  if (typeof amount_usd !== 'number' || !Number.isFinite(amount_usd) || amount_usd <= 0) {
    res.status(400).json({ error: 'amount_usd must be a positive number' });
    return;
  }

  const updated = rechargeAiApiKey(req.params.id, amount_usd);
  if (!updated) {
    res.status(404).json({ error: 'API key not found' });
    return;
  }

  res.json({ ok: true, record: updated });
});

aiKeysRouter.delete('/:id', (req: Request, res: Response) => {
  if (!revokeAiApiKey(req.params.id)) {
    res.status(404).json({ error: 'API key not found' });
    return;
  }

  res.json({ ok: true });
});