import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      return id ? await getProposal(sql, id) : await listProposals(sql, url.searchParams);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      return await createProposal(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateProposal(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteProposal(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Proposals API error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};

async function listProposals(sql, params) {
  const status = params.get('status');
  const type = params.get('type');
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');
  
  let query = `
    SELECT p.*, u.display_name as author_name, u.avatar_url as author_avatar,
           (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_type = 'approve') as approve_count,
           (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_type = 'reject') as reject_count,
           (SELECT COUNT(*) FROM discussions WHERE proposal_id = p.id) as comment_count
    FROM proposals p LEFT JOIN users u ON p.author_id = u.id WHERE 1=1
  `;
  const queryParams = [];
  let i = 1;
  
  if (status) { query += ` AND p.status = $${i++}`; queryParams.push(status); }
  if (type) { query += ` AND p.proposal_type = $${i++}`; queryParams.push(type); }
  
  query += ` ORDER BY p.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
  queryParams.push(limit, offset);
  
  const proposals = await sql(query, queryParams);
  
  let countQuery = 'SELECT COUNT(*) as total FROM proposals WHERE 1=1';
  const countParams = [];
  let j = 1;
  if (status) { countQuery += ` AND status = $${j++}`; countParams.push(status); }
  if (type) { countQuery += ` AND proposal_type = $${j++}`; countParams.push(type); }
  
  const countResult = await sql(countQuery, countParams);
  
  return jsonResponse({
    proposals: proposals.map(formatProposal),
    total: parseInt(countResult[0]?.total || 0),
    limit, offset
  });
}

async function getProposal(sql, id) {
  const proposals = await sql(`
    SELECT p.*, u.display_name as author_name, u.avatar_url as author_avatar,
           ae.title as element_title, ae.code as element_code,
           (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_type = 'approve') as approve_count,
           (SELECT COUNT(*) FROM votes WHERE proposal_id = p.id AND vote_type = 'reject') as reject_count
    FROM proposals p
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN architecture_elements ae ON p.element_id = ae.id
    WHERE p.id = $1
  `, [id]);
  
  if (proposals.length === 0) return jsonResponse({ error: 'Proposal not found' }, 404);
  
  const comments = await sql(`
    SELECT d.*, u.display_name as author_name, u.avatar_url as author_avatar
    FROM discussions d LEFT JOIN users u ON d.author_id = u.id
    WHERE d.proposal_id = $1 ORDER BY d.created_at ASC
  `, [id]);
  
  return jsonResponse({
    proposal: formatProposal(proposals[0]),
    comments: comments.map(c => ({
      id: c.id, content: c.content,
      author: { id: c.author_id, name: c.author_name, avatar: c.author_avatar },
      createdAt: c.created_at
    }))
  });
}

async function createProposal(sql, body, user) {
  const { title, content, proposalType, elementId } = body;
  
  if (!title || !content || !proposalType) {
    return jsonResponse({ error: 'Title, content, and proposal type are required' }, 400);
  }
  
  const id = uuidv4();
  await sql(`
    INSERT INTO proposals (id, title, content, proposal_type, author_id, element_id, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'draft')
  `, [id, title, content, proposalType, user.id, elementId || null]);
  
  await logActivity(user.id, 'proposal_created', 'proposal', id, { title, proposalType });
  
  return jsonResponse({ success: true, id }, 201);
}

async function updateProposal(sql, body, user) {
  const { id, title, content, status } = body;
  if (!id) return jsonResponse({ error: 'Proposal ID is required' }, 400);
  
  const proposals = await sql('SELECT author_id FROM proposals WHERE id = $1', [id]);
  if (proposals.length === 0) return jsonResponse({ error: 'Proposal not found' }, 404);
  if (proposals[0].author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  const updates = [], params = [];
  let i = 1;
  if (title) { updates.push(`title = $${i++}`); params.push(title); }
  if (content) { updates.push(`content = $${i++}`); params.push(content); }
  if (status && user.role === 'admin') { updates.push(`status = $${i++}`); params.push(status); }
  
  if (updates.length === 0) return jsonResponse({ error: 'No fields to update' }, 400);
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  
  await sql(`UPDATE proposals SET ${updates.join(', ')} WHERE id = $${i}`, params);
  await logActivity(user.id, 'proposal_updated', 'proposal', id);
  
  return jsonResponse({ success: true });
}

async function deleteProposal(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Proposal ID is required' }, 400);
  
  const proposals = await sql('SELECT author_id FROM proposals WHERE id = $1', [id]);
  if (proposals.length === 0) return jsonResponse({ error: 'Proposal not found' }, 404);
  if (proposals[0].author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql('DELETE FROM proposals WHERE id = $1', [id]);
  await logActivity(user.id, 'proposal_deleted', 'proposal', id);
  
  return jsonResponse({ success: true });
}

function formatProposal(p) {
  return {
    id: p.id, title: p.title, content: p.content,
    proposalType: p.proposal_type, status: p.status,
    author: { id: p.author_id, name: p.author_name, avatar: p.author_avatar },
    element: p.element_id ? { id: p.element_id, title: p.element_title, code: p.element_code } : null,
    votes: { approve: parseInt(p.approve_count || 0), reject: parseInt(p.reject_count || 0) },
    commentCount: parseInt(p.comment_count || 0),
    votingStarts: p.voting_starts, votingEnds: p.voting_ends,
    createdAt: p.created_at, updatedAt: p.updated_at
  };
}

export const config = { path: '/api/proposals' };
