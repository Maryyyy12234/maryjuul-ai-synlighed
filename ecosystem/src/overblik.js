'use strict';
// OVERBLIK: opgaver, ansvar og deadlines.

const TASK_STATUSES = Object.freeze(['not_started', 'in_progress', 'waiting', 'done', 'cancelled']);
const STATUS_LABELS = Object.freeze({ not_started: 'Ikke startet', in_progress: 'I gang', waiting: 'Afventer', done: 'Færdig', cancelled: 'Annulleret' });

function createOverblik(platform) {
  const repo = (a) => platform.repo(a, 'overblik');

  function createTask(actor, t) {
    if (!t.title) throw new Error('Opgaven skal have en titel');
    const isWorker = actor.type === 'ai_worker';
    return repo(actor).insert('tasks', {
      title: t.title, description: t.description || '', assignee_id: t.assignee_id || null,
      due_on: t.due_on || null, priority: t.priority || 'normal', status: 'not_started',
      // AI-oprettede opgaver er kladder, indtil et menneske accepterer dem.
      draft: isWorker || !!t.draft, origin: t.origin || (isWorker ? actor.label : 'manual'),
      approval_id: t.approval_id || null, customer_id: t.customer_id || null,
    });
  }

  function setStatus(actor, taskId, status) {
    if (!TASK_STATUSES.includes(status)) throw new Error(`Ukendt status: ${status}`);
    return repo(actor).update('tasks', taskId, { status, ...(status === 'done' ? { completed_at: platform.now().toISOString() } : {}) });
  }
  function acceptDraft(actor, taskId) { return repo(actor).update('tasks', taskId, { draft: false }); }
  function assign(actor, taskId, userId) { return repo(actor).update('tasks', taskId, { assignee_id: userId }); }

  function listTasks(actor, { status, assignee_id, includeDrafts = true } = {}) {
    return repo(actor).list('tasks', (t) => (!status || t.status === status) && (!assignee_id || t.assignee_id === assignee_id) && (includeDrafts || !t.draft));
  }

  // Dagens overblik: højst fem punkter, kun det brugeren må se.
  function today(actor, { date, approvals }) {
    const open = listTasks(actor).filter((t) => !['done', 'cancelled'].includes(t.status));
    const dueToday = open.filter((t) => t.due_on === date);
    const overdue = open.filter((t) => t.due_on && t.due_on < date);
    const pending = approvals ? approvals.list(actor, 'pending') : [];
    const items = [
      ...pending.map((p) => ({ kind: 'approval', id: p.id, title: p.title })),
      ...overdue.map((t) => ({ kind: 'overdue', id: t.id, title: t.title })),
      ...dueToday.map((t) => ({ kind: 'due_today', id: t.id, title: t.title })),
    ].slice(0, 5);
    return { date, counts: { dueToday: dueToday.length, overdue: overdue.length, pendingApprovals: pending.length }, items,
      headline: items.length ? `Der er ${items.length} ting, du bør tage stilling til i dag.` : 'Intet kræver din handling i dag.' };
  }

  return { TASK_STATUSES, STATUS_LABELS, createTask, setStatus, acceptDraft, assign, listTasks, today };
}

module.exports = { createOverblik, TASK_STATUSES, STATUS_LABELS };
