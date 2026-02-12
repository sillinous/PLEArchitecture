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
      if (id) return await getWorkingGroup(sql, id, user);
      if (slug) return await getWorkingGroupBySlug(sql, slug, user);
      return await listWorkingGroups(sql, url.searchParams, user);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      const action = url.searchParams.get('action');
      if (action === 'join') return await joinGroup(sql, url.searchParams.get('id'), user);
      if (action === 'leave') return await leaveGroup(sql, url.searchParams.get('id'), user);
      return await createWorkingGroup(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateWorkingGroup(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteWorkingGroup(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Working Groups API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

async function listWorkingGroups(sql, params, user) {
  const status = params.get('status') || 'active';
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');
  
  const groups = await sql`
    SELECT wg.*,
           u.display_name as created_by_name,
           (SELECT COUNT(*) FROM working_group_members WHERE group_id = wg.id) as member_count,
           (SELECT COUNT(*) FROM projects WHERE working_group_id = wg.id) as project_count
    FROM working_groups wg
    LEFT JOIN users u ON wg.created_by = u.id
    WHERE (${status}::text IS NULL OR wg.status = ${status})
      AND (wg.visibility = 'public' OR ${user?.id}::uuid IS NOT NULL)
    ORDER BY wg.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  return jsonResponse({
    groups: groups.map(formatGroup),
    limit, offset
  });
}

async function getWorkingGroup(sql, id, user) {
  const groups = await sql`
    SELECT wg.*, u.display_name as created_by_name
    FROM working_groups wg
    LEFT JOIN users u ON wg.created_by = u.id
    WHERE wg.id = ${id}
  `;
  
  if (groups.length === 0) return jsonResponse({ error: 'Working group not found' }, 404);
  
  const group = groups[0];
  
  // Get members
  const members = await sql`
    SELECT wgm.*, u.display_name, u.avatar_url, u.email
    FROM working_group_members wgm
    JOIN users u ON wgm.user_id = u.id
    WHERE wgm.group_id = ${id}
    ORDER BY wgm.role DESC, wgm.joined_at
  `;
  
  // Get projects
  const projects = await sql`
    SELECT p.*, 
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as completed_task_count
    FROM projects p
    WHERE p.working_group_id = ${id}
    ORDER BY p.updated_at DESC
    LIMIT 10
  `;
  
  // Get documents
  const documents = await sql`
    SELECT d.*, u.display_name as author_name
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    WHERE d.working_group_id = ${id}
    ORDER BY d.updated_at DESC
    LIMIT 10
  `;
  
  const isMember = user ? members.some(m => m.user_id === user.id) : false;
  const memberRole = user ? members.find(m => m.user_id === user.id)?.role : null;
  
  return jsonResponse({
    group: formatGroup(group),
    members: members.map(m => ({
      id: m.user_id,
      name: m.display_name,
      avatar: m.avatar_url,
      role: m.role,
      joinedAt: m.joined_at
    })),
    projects: projects.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      taskCount: parseInt(p.task_count || 0),
      progress: p.task_count > 0 ? Math.round((p.completed_task_count / p.task_count) * 100) : 0
    })),
    documents: documents.map(d => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
      type: d.document_type,
      status: d.status,
      author: d.author_name,
      updatedAt: d.updated_at
    })),
    isMember,
    memberRole
  });
}

async function getWorkingGroupBySlug(sql, slug, user) {
  const groups = await sql`SELECT id FROM working_groups WHERE slug = ${slug}`;
  if (groups.length === 0) return jsonResponse({ error: 'Working group not found' }, 404);
  return getWorkingGroup(sql, groups[0].id, user);
}

async function createWorkingGroup(sql, body, user) {
  const { name, description, mission, visibility } = body;
  
  if (!name) return jsonResponse({ error: 'Name is required' }, 400);
  
  const id = uuidv4();
  const slug = generateSlug(name);
  
  await sql`
    INSERT INTO working_groups (id, name, slug, description, mission, visibility, created_by)
    VALUES (${id}, ${name}, ${slug}, ${description || null}, ${mission || null}, ${visibility || 'public'}, ${user.id})
  `;
  
  // Add creator as lead
  await sql`
    INSERT INTO working_group_members (group_id, user_id, role)
    VALUES (${id}, ${user.id}, 'lead')
  `;
  
  await logActivity(user.id, 'working_group_created', 'working_group', id, { name });
  
  return jsonResponse({ success: true, id, slug }, 201);
}

async function updateWorkingGroup(sql, body, user) {
  const { id, name, description, mission, status, visibility } = body;
  
  if (!id) return jsonResponse({ error: 'Group ID required' }, 400);
  
  // Check authorization (must be lead or admin)
  const membership = await sql`
    SELECT role FROM working_group_members WHERE group_id = ${id} AND user_id = ${user.id}
  `;
  
  if (membership.length === 0 || (membership[0].role !== 'lead' && user.role !== 'admin')) {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql`
    UPDATE working_groups SET
      name = COALESCE(${name || null}, name),
      description = COALESCE(${description || null}, description),
      mission = COALESCE(${mission || null}, mission),
      status = COALESCE(${status || null}, status),
      visibility = COALESCE(${visibility || null}, visibility),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'working_group_updated', 'working_group', id);
  
  return jsonResponse({ success: true });
}

async function deleteWorkingGroup(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Group ID required' }, 400);
  
  const groups = await sql`SELECT created_by FROM working_groups WHERE id = ${id}`;
  if (groups.length === 0) return jsonResponse({ error: 'Working group not found' }, 404);
  
  if (groups[0].created_by !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql`DELETE FROM working_groups WHERE id = ${id}`;
  await logActivity(user.id, 'working_group_deleted', 'working_group', id);
  
  return jsonResponse({ success: true });
}

async function joinGroup(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Group ID required' }, 400);
  
  const existing = await sql`SELECT id FROM working_group_members WHERE group_id = ${id} AND user_id = ${user.id}`;
  if (existing.length > 0) return jsonResponse({ error: 'Already a member' }, 400);
  
  await sql`
    INSERT INTO working_group_members (group_id, user_id, role)
    VALUES (${id}, ${user.id}, 'member')
  `;
  
  await logActivity(user.id, 'group_joined', 'working_group', id);
  
  return jsonResponse({ success: true });
}

async function leaveGroup(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Group ID required' }, 400);
  
  await sql`DELETE FROM working_group_members WHERE group_id = ${id} AND user_id = ${user.id}`;
  await logActivity(user.id, 'group_left', 'working_group', id);
  
  return jsonResponse({ success: true });
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function formatGroup(g) {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    description: g.description,
    mission: g.mission,
    status: g.status,
    visibility: g.visibility,
    memberCount: parseInt(g.member_count || 0),
    projectCount: parseInt(g.project_count || 0),
    createdBy: g.created_by_name || null,
    createdAt: g.created_at,
    updatedAt: g.updated_at
  };
}

export const config = { path: '/api/working-groups' };
