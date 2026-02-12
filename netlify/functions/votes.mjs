import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);
    
    if (req.method === 'GET') {
      const proposalId = url.searchParams.get('proposalId');
      if (!proposalId) return jsonResponse({ error: 'Proposal ID required' }, 400);
      return await getVotes(sql, proposalId, user);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      return await castVote(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await removeVote(sql, url.searchParams.get('proposalId'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Voting API error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};

async function getVotes(sql, proposalId, user) {
  const counts = await sql(`
    SELECT 
      COUNT(*) FILTER (WHERE vote_type = 'approve') as approve_count,
      COUNT(*) FILTER (WHERE vote_type = 'reject') as reject_count,
      COUNT(*) FILTER (WHERE vote_type = 'abstain') as abstain_count
    FROM votes WHERE proposal_id = $1
  `, [proposalId]);
  
  let userVote = null;
  if (user) {
    const votes = await sql(
      'SELECT vote_type, comment FROM votes WHERE proposal_id = $1 AND user_id = $2',
      [proposalId, user.id]
    );
    if (votes.length > 0) {
      userVote = { type: votes[0].vote_type, comment: votes[0].comment };
    }
  }
  
  const recentVotes = await sql(`
    SELECT v.vote_type, v.comment, v.created_at, u.display_name as user_name, u.avatar_url as user_avatar
    FROM votes v JOIN users u ON v.user_id = u.id
    WHERE v.proposal_id = $1 AND v.comment IS NOT NULL AND v.comment != ''
    ORDER BY v.created_at DESC LIMIT 10
  `, [proposalId]);
  
  return jsonResponse({
    counts: {
      approve: parseInt(counts[0]?.approve_count || 0),
      reject: parseInt(counts[0]?.reject_count || 0),
      abstain: parseInt(counts[0]?.abstain_count || 0)
    },
    userVote,
    recentVotes: recentVotes.map(v => ({
      type: v.vote_type, comment: v.comment,
      user: { name: v.user_name, avatar: v.user_avatar },
      createdAt: v.created_at
    }))
  });
}

async function castVote(sql, body, user) {
  const { proposalId, voteType, comment } = body;
  
  if (!proposalId || !voteType) {
    return jsonResponse({ error: 'Proposal ID and vote type required' }, 400);
  }
  
  if (!['approve', 'reject', 'abstain'].includes(voteType)) {
    return jsonResponse({ error: 'Invalid vote type' }, 400);
  }
  
  const proposals = await sql('SELECT id, status FROM proposals WHERE id = $1', [proposalId]);
  if (proposals.length === 0) return jsonResponse({ error: 'Proposal not found' }, 404);
  
  await sql(`
    INSERT INTO votes (id, proposal_id, user_id, vote_type, comment)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (proposal_id, user_id) 
    DO UPDATE SET vote_type = $4, comment = $5, created_at = CURRENT_TIMESTAMP
  `, [uuidv4(), proposalId, user.id, voteType, comment || null]);
  
  await logActivity(user.id, 'vote_cast', 'proposal', proposalId, { voteType });
  
  return getVotes(sql, proposalId, user);
}

async function removeVote(sql, proposalId, user) {
  if (!proposalId) return jsonResponse({ error: 'Proposal ID required' }, 400);
  
  await sql('DELETE FROM votes WHERE proposal_id = $1 AND user_id = $2', [proposalId, user.id]);
  await logActivity(user.id, 'vote_removed', 'proposal', proposalId);
  
  return jsonResponse({ success: true });
}

export const config = { path: '/api/votes' };
