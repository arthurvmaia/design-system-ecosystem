import { Hono } from 'hono';
import { getTask, listTasks } from '../lib/task-queue.js';

export const tasksRoute = new Hono();

tasksRoute.get('/', (c) => {
  return c.json({ items: listTasks() });
});

tasksRoute.get('/:id', (c) => {
  const task = getTask(c.req.param('id'));
  if (!task) return c.json({ error: 'not_found' }, 404);
  return c.json({ task });
});
