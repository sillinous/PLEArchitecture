import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      return await listMilestones(sql, url.searchParams);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      return await createMilestone(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateMilestone(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteMilestone(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Milestones API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

async function listMilestones(sql, params) {
  const projectId = params.get('projectId');
  
  if (!projectId) return jsonResponse({ error: 'Project ID required' }, 400);
  
  const milestones = await sql`
    SELECT m.*,
           (SELECT COUNT(*) FROM tasks t WHERE t.project_id = m.project_id AND t.due_date <= m.target_date) as total_tasks,
           (SELECT COUNT(*) FROM tasks t WHERE t.project_id = m.project_id AND t.due_date <= m.target_date AND t.status = 'done') as completed_tasks
    FROM milestones m
    WHERE m.project_id = ${projectId}
    ORDER BY m.target_date, m.sort_order
  `;
  
  return jsonResponse({
    milestones: milestones.map(m => ({
      id: m.id,
      projectId: m.project_id,
      title: m.title,
      description: m.description,
      targetDate: m.target_date,
      status: m.status,
      completedAt: m.completed_at,
      totalTasks: parseInt(m.total_tasks || 0),
      completedTasks: parseInt(m.completed_tasks || 0),
      progress: m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0,
      createdAt: m.created_at
    }))
  });
}

async function createMilestone(sql, body, user) {
  const { projectId, title, description, targetDate } = body;
  
  if (!projectId || !title) return jsonResponse({ error: 'Project ID and title required' }, 400);
  
  const id = uuidv4();
  
  await sql`
    INSERT INTO milestones (id, project_id, title, description, target_date)
    VALUES (${id}, ${projectId}, ${title}, ${description || null}, ${targetDate || null})
  `;
  
  await logActivity(user.id, 'milestone_created', 'milestone', id, { projectId, title });
  
  return jsonResponse({ success: true, id }, 201);
}

async function updateMilestone(sql, body, user) {
  const { id, title, description, targetDate, status, sortOrder } = body;
  
  if (!id) return jsonResponse({ error: 'Milestone ID required' }, 400);
  
  const milestones = await sql`SELECT status as old_status FROM milestones WHERE id = ${id}`;
  if (milestones.length === 0) return jsonResponse({ error: 'Milestone not found' }, 404);
  
  const completedAt = status === 'completed' && milestones[0].old_status !== 'completed' ? new Date().toISOString() : null;
  
  await sql`
    UPDATE milestones SET
      title = COALESCE(${title || null}, title),
      description = COALESCE(${description || null}, description),
      target_date = ${targetDate === '' ? null : (targetDate || null)},
      status = COALESCE(${status || null}, status),
      sort_order = COALESCE(${sortOrder || null}, sort_order),
      completed_at = COALESCE(${completedAt}, completed_at)
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'milestone_updated', 'milestone', id, { status });
  
  return jsonResponse({ success: true });
}

async function deleteMilestone(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Milestone ID required' }, 400);
  
  await sql`DELETE FROM milestones WHERE id = ${id}`;
  await logActivity(user.id, 'milestone_deleted', 'milestone', id);
  
  return jsonResponse({ success: true });
}

export const config = { path: '/api/milestones' };
