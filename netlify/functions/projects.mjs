import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      const slug = url.searchParams.get('slug');
      if (id) return await getProject(sql, id, user);
      if (slug) return await getProjectBySlug(sql, slug, user);
      return await listProjects(sql, url.searchParams, user);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      const action = url.searchParams.get('action');
      if (action === 'join') return await joinProject(sql, url.searchParams.get('id'), user);
      if (action === 'leave') return await leaveProject(sql, url.searchParams.get('id'), user);
      return await createProject(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateProject(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteProject(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Projects API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

async function listProjects(sql, params, user) {
  const status = params.get('status') || null;
  const visibility = params.get('visibility') || null;
  const groupId = params.get('groupId') || null;
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');
  
  // Show public projects, or internal if user is logged in
  const visibilityFilter = user ? ['public', 'internal'] : ['public'];
  
  const projects = await sql`
    SELECT p.*, 
           u.display_name as lead_name, u.avatar_url as lead_avatar,
           wg.name as group_name, wg.slug as group_slug,
           (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as completed_task_count
    FROM projects p
    LEFT JOIN users u ON p.lead_id = u.id
    LEFT JOIN working_groups wg ON p.working_group_id = wg.id
    WHERE (${status}::text IS NULL OR p.status = ${status})
      AND p.visibility = ANY(${visibilityFilter})
      AND (${groupId}::uuid IS NULL OR p.working_group_id = ${groupId}::uuid)
    ORDER BY p.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  const countResult = await sql`
    SELECT COUNT(*) as total FROM projects
    WHERE (${status}::text IS NULL OR status = ${status})
      AND visibility = ANY(${visibilityFilter})
      AND (${groupId}::uuid IS NULL OR working_group_id = ${groupId}::uuid)
  `;
  
  return jsonResponse({
    projects: projects.map(formatProject),
    total: parseInt(countResult[0]?.total || 0),
    limit, offset
  });
}

async function getProject(sql, id, user) {
  const projects = await sql`
    SELECT p.*, 
           u.display_name as lead_name, u.avatar_url as lead_avatar,
           wg.name as group_name, wg.slug as group_slug,
           pr.title as proposal_title,
           cb.display_name as created_by_name
    FROM projects p
    LEFT JOIN users u ON p.lead_id = u.id
    LEFT JOIN users cb ON p.created_by = cb.id
    LEFT JOIN working_groups wg ON p.working_group_id = wg.id
    LEFT JOIN proposals pr ON p.proposal_id = pr.id
    WHERE p.id = ${id}
  `;
  
  if (projects.length === 0) return jsonResponse({ error: 'Project not found' }, 404);
  
  const project = projects[0];
  
  // Check visibility
  if (project.visibility === 'internal' && !user) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }
  
  // Get members
  const members = await sql`
    SELECT pm.*, u.display_name, u.avatar_url, u.email
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ${id}
    ORDER BY pm.role, pm.joined_at
  `;
  
  // Get tasks summary
  const taskStats = await sql`
    SELECT status, COUNT(*) as count
    FROM tasks WHERE project_id = ${id}
    GROUP BY status
  `;
  
  // Get milestones
  const milestones = await sql`
    SELECT * FROM milestones
    WHERE project_id = ${id}
    ORDER BY target_date, sort_order
  `;
  
  // Get recent activity
  const activity = await sql`
    SELECT al.*, u.display_name as user_name
    FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.entity_type = 'project' AND al.entity_id = ${id}
    ORDER BY al.created_at DESC
    LIMIT 10
  `;
  
  // Check if current user is a member
  const isMember = user ? members.some(m => m.user_id === user.id) : false;
  
  return jsonResponse({
    project: formatProject(project),
    members: members.map(m => ({
      id: m.user_id,
      name: m.display_name,
      avatar: m.avatar_url,
      role: m.role,
      joinedAt: m.joined_at
    })),
    taskStats: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: parseInt(s.count) }), {}),
    milestones: milestones.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      targetDate: m.target_date,
      status: m.status,
      completedAt: m.completed_at
    })),
    activity: activity.map(a => ({
      id: a.id,
      action: a.action,
      user: a.user_name,
      details: a.details,
      createdAt: a.created_at
    })),
    isMember
  });
}

async function getProjectBySlug(sql, slug, user) {
  const projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
  if (projects.length === 0) return jsonResponse({ error: 'Project not found' }, 404);
  return getProject(sql, projects[0].id, user);
}

async function createProject(sql, body, user) {
  const { title, description, objectives, status, priority, visibility, workingGroupId, proposalId, startDate, targetDate } = body;
  
  if (!title) return jsonResponse({ error: 'Title is required' }, 400);
  
  const id = uuidv4();
  const slug = generateSlug(title);
  
  await sql`
    INSERT INTO projects (id, title, slug, description, objectives, status, priority, visibility, working_group_id, proposal_id, lead_id, start_date, target_date, created_by)
    VALUES (${id}, ${title}, ${slug}, ${description || null}, ${objectives || null}, ${status || 'planning'}, ${priority || 'medium'}, ${visibility || 'internal'}, ${workingGroupId || null}, ${proposalId || null}, ${user.id}, ${startDate || null}, ${targetDate || null}, ${user.id})
  `;
  
  // Add creator as lead member
  await sql`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (${id}, ${user.id}, 'lead')
  `;
  
  await logActivity(user.id, 'project_created', 'project', id, { title });
  
  return jsonResponse({ success: true, id, slug }, 201);
}

async function updateProject(sql, body, user) {
  const { id, title, description, objectives, status, priority, visibility, leadId, startDate, targetDate } = body;
  
  if (!id) return jsonResponse({ error: 'Project ID required' }, 400);
  
  // Check authorization
  const projects = await sql`SELECT lead_id, created_by FROM projects WHERE id = ${id}`;
  if (projects.length === 0) return jsonResponse({ error: 'Project not found' }, 404);
  
  const isAuthorized = projects[0].lead_id === user.id || projects[0].created_by === user.id || user.role === 'admin';
  if (!isAuthorized) return jsonResponse({ error: 'Not authorized' }, 403);
  
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  
  await sql`
    UPDATE projects SET
      title = COALESCE(${title || null}, title),
      description = COALESCE(${description || null}, description),
      objectives = COALESCE(${objectives || null}, objectives),
      status = COALESCE(${status || null}, status),
      priority = COALESCE(${priority || null}, priority),
      visibility = COALESCE(${visibility || null}, visibility),
      lead_id = COALESCE(${leadId || null}, lead_id),
      start_date = COALESCE(${startDate || null}, start_date),
      target_date = COALESCE(${targetDate || null}, target_date),
      completed_at = COALESCE(${completedAt}, completed_at),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'project_updated', 'project', id, { status });
  
  return jsonResponse({ success: true });
}

async function deleteProject(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Project ID required' }, 400);
  
  const projects = await sql`SELECT lead_id, created_by FROM projects WHERE id = ${id}`;
  if (projects.length === 0) return jsonResponse({ error: 'Project not found' }, 404);
  
  const isAuthorized = projects[0].created_by === user.id || user.role === 'admin';
  if (!isAuthorized) return jsonResponse({ error: 'Not authorized' }, 403);
  
  await sql`DELETE FROM projects WHERE id = ${id}`;
  await logActivity(user.id, 'project_deleted', 'project', id);
  
  return jsonResponse({ success: true });
}

async function joinProject(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Project ID required' }, 400);
  
  const existing = await sql`SELECT id FROM project_members WHERE project_id = ${id} AND user_id = ${user.id}`;
  if (existing.length > 0) return jsonResponse({ error: 'Already a member' }, 400);
  
  await sql`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (${id}, ${user.id}, 'contributor')
  `;
  
  await logActivity(user.id, 'project_joined', 'project', id);
  
  return jsonResponse({ success: true });
}

async function leaveProject(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Project ID required' }, 400);
  
  await sql`DELETE FROM project_members WHERE project_id = ${id} AND user_id = ${user.id}`;
  await logActivity(user.id, 'project_left', 'project', id);
  
  return jsonResponse({ success: true });
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) + '-' + Date.now().toString(36);
}

function formatProject(p) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    objectives: p.objectives,
    status: p.status,
    priority: p.priority,
    visibility: p.visibility,
    lead: p.lead_id ? { id: p.lead_id, name: p.lead_name, avatar: p.lead_avatar } : null,
    group: p.working_group_id ? { id: p.working_group_id, name: p.group_name, slug: p.group_slug } : null,
    proposal: p.proposal_id ? { id: p.proposal_id, title: p.proposal_title } : null,
    memberCount: parseInt(p.member_count || 0),
    taskCount: parseInt(p.task_count || 0),
    completedTaskCount: parseInt(p.completed_task_count || 0),
    progress: p.task_count > 0 ? Math.round((p.completed_task_count / p.task_count) * 100) : 0,
    startDate: p.start_date,
    targetDate: p.target_date,
    completedAt: p.completed_at,
    createdBy: p.created_by_name || null,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

export const config = { path: '/api/projects' };
