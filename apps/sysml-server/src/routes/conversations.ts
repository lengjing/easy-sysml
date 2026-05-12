import { Router, type Request, type Response } from 'express';
import {
  appendConversationMessage,
  createConversation,
  deleteConversation,
  getConversation,
  getProjectContext,
  listConversationMessages,
  listConversations,
  updateConversation,
} from '../conversationStore.js';

export const conversationsRouter = Router({ mergeParams: true });

conversationsRouter.get('/', (req: Request, res: Response) => {
  const context = getProjectContext(req.params.projectId);
  if (!context) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(listConversations(context.id));
});

conversationsRouter.post('/', (req: Request, res: Response) => {
  const context = getProjectContext(req.params.projectId);
  if (!context) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
  res.status(201).json(createConversation(context.id, title));
});

conversationsRouter.get('/:conversationId', (req: Request, res: Response) => {
  const conversation = getConversation(req.params.projectId, req.params.conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json(conversation);
});

conversationsRouter.patch('/:conversationId', (req: Request, res: Response) => {
  const patch = req.body as {
    title?: string;
    status?: string;
    archived?: boolean;
  };

  if (patch.title !== undefined && !patch.title.trim()) {
    res.status(400).json({ error: 'title cannot be empty' });
    return;
  }

  const updated = updateConversation(req.params.projectId, req.params.conversationId, {
    title: patch.title,
    status: patch.status,
    archived: patch.archived,
  });
  if (!updated) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json(updated);
});

conversationsRouter.delete('/:conversationId', (req: Request, res: Response) => {
  const deleted = deleteConversation(req.params.projectId, req.params.conversationId);
  if (!deleted) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json({ ok: true });
});

conversationsRouter.get('/:conversationId/messages', (req: Request, res: Response) => {
  const messages = listConversationMessages(req.params.projectId, req.params.conversationId);
  if (!messages) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json(messages);
});

conversationsRouter.post('/:conversationId/messages', (req: Request, res: Response) => {
  const { role, content } = req.body as { role?: string; content?: string };
  if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'error') {
    res.status(400).json({ error: 'role must be user, assistant, system, or error' });
    return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const message = appendConversationMessage(req.params.projectId, req.params.conversationId, {
    role,
    content: content.trim(),
  });
  if (!message) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.status(201).json(message);
});