import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      return id ? await getDiscussion(sql, id) : await listDiscussions(sql, url.searchParams);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      return await createDiscussion(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateDiscussion(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteDiscussion(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Discussions API error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};

async function listDiscussions(sql, params) {
  const proposalId = params.get('proposalId');
  const elementId = params.get('elementId');
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');
  
  let query = `
    SELECT d.*, u.display_name as author_name, u.avatar_url as author_avatar,
           (SELECT COUNT(*) FROM discussions WHERE parent_id = d.id) as reply_count
    FROM discussions d LEFT JOIN users u ON d.author_id = u.id
    WHERE d.parent_id IS NULL AND d.status = 'active'
  `;
  const params_ = [];
  let i = 1;
  
  if (proposalId) { query += ` AND d.proposal_id = $${i++}`; params_.push(proposalId); }
  if (elementId) { query += ` AND d.element_id = $${i++}`; params_.push(elementId); }
  
  query += ` ORDER BY d.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  params_.push(limit, offset);
  
  const discussions = await sql(query, params_);
  
  return jsonResponse({ discussions: discussions.map(formatDiscussion), limit, offset });
}

async function getDiscussion(sql, id) {
  const discussions = await sql(`
    SELECT d.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM discussions d LEFT JOIN users u ON d.author_id = u.id
    WHERE d.id = $1
  `, [id]);
  
  if (discussions.length === 0) return jsonResponse({ error: 'Discussion not found' }, 404);
  
  const replies = await sql(`
    SELECT d.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM discussions d LEFT JOIN users u ON d.author_id = u.id
    WHERE d.parent_id = $1 AND d.status = 'active'
    ORDER BY d.created_at ASC
  `, [id]);
  
  return jsonResponse({
    discussion: formatDiscussion(discussions[0]),
    replies: replies.map(formatDiscussion)
  });
}

async function createDiscussion(sql, body, user) {
  const { title, content, proposalId, elementId, parentId, discussionType } = body;
  
  if (!content) return jsonResponse({ error: 'Content is required' }, 400);
  
  const id = uuidv4();
  await sql(`
    INSERT INTO discussions (id, title, content, author_id, proposal_id, element_id, parent_id, discussion_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, title || null, content, user.id, proposalId || null, elementId || null, parentId || null, discussionType || 'general']);
  
  await logActivity(user.id, parentId ? 'reply_created' : 'discussion_created', 'discussion', id, { proposalId, elementId });
  
  return jsonResponse({ success: true, id }, 201);
}

async function updateDiscussion(sql, body, user) {
  const { id, content } = body;
  if (!id || !content) return jsonResponse({ error: 'ID and content required' }, 400);
  
  const discussions = await sql('SELECT author_id FROM discussions WHERE id = $1', [id]);
  if (discussions.length === 0) return jsonResponse({ error: 'Discussion not found' }, 404);
  if (discussions[0].author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql('UPDATE discussions SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [content, id]);
  
  return jsonResponse({ success: true });
}

async function deleteDiscussion(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Discussion ID required' }, 400);
  
  const discussions = await sql('SELECT author_id FROM discussions WHERE id = $1', [id]);
  if (discussions.length === 0) return jsonResponse({ error: 'Discussion not found' }, 404);
  if (discussions[0].author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql("UPDATE discussions SET status = 'deleted' WHERE id = $1", [id]);
  
  return jsonResponse({ success: true });
}

function formatDiscussion(d) {
  return {
    id: d.id, title: d.title, content: d.content,
    author: { id: d.author_id, name: d.author_name, avatar: d.author_avatar },
    proposalId: d.proposal_id, elementId: d.element_id, parentId: d.parent_id,
    type: d.discussion_type, status: d.status,
    replyCount: parseInt(d.reply_count || 0),
    createdAt: d.created_at, updatedAt: d.updated_at
  };
}

export const config = { path: '/api/discussions' };
