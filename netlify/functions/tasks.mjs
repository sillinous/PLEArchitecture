import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      return id ? await getTask(sql, id) : await listTasks(sql, url.searchParams, user);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      return await createTask(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateTask(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteTask(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Tasks API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

async function listTasks(sql, params, user) {
  const projectId = params.get('projectId');
  const assigneeId = params.get('assigneeId');
  const status = params.get('status') || null;
  const priority = params.get('priority') || null;
  const view = params.get('view') || 'list'; // list, board, my-tasks
  const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
  const offset = parseInt(params.get('offset') || '0');
  
  // If view is my-tasks, filter to current user's assignments
  const effectiveAssigneeId = view === 'my-tasks' && user ? user.id : (assigneeId || null);
  
  const tasks = await sql`
    SELECT t.*,
           a.display_name as assignee_name, a.avatar_url as assignee_avatar,
           r.display_name as reporter_name,
           p.title as project_title, p.slug as project_slug,
           (SELECT COUNT(*) FROM tasks WHERE parent_id = t.id) as subtask_count
    FROM tasks t
    LEFT JOIN users a ON t.assignee_id = a.id
    LEFT JOIN users r ON t.reporter_id = r.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE (${projectId}::uuid IS NULL OR t.project_id = ${projectId}::uuid)
      AND (${effectiveAssigneeId}::uuid IS NULL OR t.assignee_id = ${effectiveAssigneeId}::uuid)
      AND (${status}::text IS NULL OR t.status = ${status})
      AND (${priority}::text IS NULL OR t.priority = ${priority})
      AND t.parent_id IS NULL
    ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      t.due_date NULLS LAST,
      t.sort_order,
      t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  // For board view, group by status
  if (view === 'board') {
    const columns = {
      todo: [],
      in_progress: [],
      review: [],
      done: []
    };
    
    tasks.forEach(t => {
      const status = t.status || 'todo';
      if (columns[status]) {
        columns[status].push(formatTask(t));
      } else {
        columns.todo.push(formatTask(t));
      }
    });
    
    return jsonResponse({ columns, view: 'board' });
  }
  
  return jsonResponse({
    tasks: tasks.map(formatTask),
    limit, offset
  });
}

async function getTask(sql, id) {
  const tasks = await sql`
    SELECT t.*,
           a.display_name as assignee_name, a.avatar_url as assignee_avatar,
           r.display_name as reporter_name, r.avatar_url as reporter_avatar,
           p.title as project_title, p.slug as project_slug
    FROM tasks t
    LEFT JOIN users a ON t.assignee_id = a.id
    LEFT JOIN users r ON t.reporter_id = r.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ${id}
  `;
  
  if (tasks.length === 0) return jsonResponse({ error: 'Task not found' }, 404);
  
  // Get subtasks
  const subtasks = await sql`
    SELECT t.*, a.display_name as assignee_name, a.avatar_url as assignee_avatar
    FROM tasks t
    LEFT JOIN users a ON t.assignee_id = a.id
    WHERE t.parent_id = ${id}
    ORDER BY t.sort_order, t.created_at
  `;
  
  // Get comments (discussions linked to this task)
  const comments = await sql`
    SELECT d.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM discussions d
    LEFT JOIN users u ON d.author_id = u.id
    WHERE d.element_id = ${id} AND d.discussion_type = 'task_comment'
    ORDER BY d.created_at ASC
  `;
  
  return jsonResponse({
    task: formatTask(tasks[0]),
    subtasks: subtasks.map(formatTask),
    comments: comments.map(c => ({
      id: c.id,
      content: c.content,
      author: { id: c.author_id, name: c.author_name, avatar: c.author_avatar },
      createdAt: c.created_at
    }))
  });
}

async function createTask(sql, body, user) {
  const { projectId, parentId, title, description, status, priority, assigneeId, dueDate, estimatedHours } = body;
  
  if (!title) return jsonResponse({ error: 'Title is required' }, 400);
  if (!projectId && !parentId) return jsonResponse({ error: 'Project ID or parent task required' }, 400);
  
  // If parentId provided, get projectId from parent
  let effectiveProjectId = projectId;
  if (parentId && !projectId) {
    const parents = await sql`SELECT project_id FROM tasks WHERE id = ${parentId}`;
    if (parents.length > 0) effectiveProjectId = parents[0].project_id;
  }
  
  const id = uuidv4();
  
  await sql`
    INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, assignee_id, reporter_id, due_date, estimated_hours)
    VALUES (${id}, ${effectiveProjectId}, ${parentId || null}, ${title}, ${description || null}, ${status || 'todo'}, ${priority || 'medium'}, ${assigneeId || null}, ${user.id}, ${dueDate || null}, ${estimatedHours || null})
  `;
  
  await logActivity(user.id, 'task_created', 'task', id, { title, projectId: effectiveProjectId });
  
  // Update project's updated_at
  if (effectiveProjectId) {
    await sql`UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ${effectiveProjectId}`;
  }
  
  return jsonResponse({ success: true, id }, 201);
}

async function updateTask(sql, body, user) {
  const { id, title, description, status, priority, assigneeId, dueDate, estimatedHours, actualHours, sortOrder } = body;
  
  if (!id) return jsonResponse({ error: 'Task ID required' }, 400);
  
  const tasks = await sql`SELECT project_id, status as old_status FROM tasks WHERE id = ${id}`;
  if (tasks.length === 0) return jsonResponse({ error: 'Task not found' }, 404);
  
  const completedAt = status === 'done' && tasks[0].old_status !== 'done' ? new Date().toISOString() : null;
  
  await sql`
    UPDATE tasks SET
      title = COALESCE(${title || null}, title),
      description = COALESCE(${description || null}, description),
      status = COALESCE(${status || null}, status),
      priority = COALESCE(${priority || null}, priority),
      assignee_id = ${assigneeId === '' ? null : (assigneeId || null)},
      due_date = ${dueDate === '' ? null : (dueDate || null)},
      estimated_hours = COALESCE(${estimatedHours || null}, estimated_hours),
      actual_hours = COALESCE(${actualHours || null}, actual_hours),
      sort_order = COALESCE(${sortOrder || null}, sort_order),
      completed_at = COALESCE(${completedAt}, completed_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'task_updated', 'task', id, { status, assigneeId });
  
  // Update project's updated_at
  if (tasks[0].project_id) {
    await sql`UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ${tasks[0].project_id}`;
  }
  
  return jsonResponse({ success: true });
}

async function deleteTask(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Task ID required' }, 400);
  
  const tasks = await sql`SELECT project_id FROM tasks WHERE id = ${id}`;
  if (tasks.length === 0) return jsonResponse({ error: 'Task not found' }, 404);
  
  await sql`DELETE FROM tasks WHERE id = ${id}`;
  await logActivity(user.id, 'task_deleted', 'task', id);
  
  return jsonResponse({ success: true });
}

function formatTask(t) {
  return {
    id: t.id,
    projectId: t.project_id,
    project: t.project_title ? { id: t.project_id, title: t.project_title, slug: t.project_slug } : null,
    parentId: t.parent_id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee_id ? { id: t.assignee_id, name: t.assignee_name, avatar: t.assignee_avatar } : null,
    reporter: t.reporter_id ? { id: t.reporter_id, name: t.reporter_name, avatar: t.reporter_avatar } : null,
    dueDate: t.due_date,
    estimatedHours: t.estimated_hours ? parseFloat(t.estimated_hours) : null,
    actualHours: t.actual_hours ? parseFloat(t.actual_hours) : null,
    subtaskCount: parseInt(t.subtask_count || 0),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    completedAt: t.completed_at
  };
}

export const config = { path: '/api/tasks' };
