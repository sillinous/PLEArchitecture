import { getDb, jsonResponse } from './lib/db.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }
    
    const sql = await getDb();
    
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const userId = url.searchParams.get('userId');
    const entityType = url.searchParams.get('entityType');
    
    let query = `
      SELECT a.*, u.display_name as user_name, u.avatar_url as user_avatar
      FROM activity_log a LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    
    if (userId) { query += ` AND a.user_id = $${i++}`; params.push(userId); }
    if (entityType) { query += ` AND a.entity_type = $${i++}`; params.push(entityType); }
    
    query += ` ORDER BY a.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);
    
    const activities = await sql(query, params);
    
    return jsonResponse({
      activities: activities.map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details || {},
        user: a.user_id ? { id: a.user_id, name: a.user_name, avatar: a.user_avatar } : null,
        createdAt: a.created_at,
        description: formatActivityDescription(a)
      })),
      limit, offset
    });
  } catch (error) {
    console.error('Activity API error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};

function formatActivityDescription(activity) {
  const userName = activity.user_name || 'Someone';
  const details = activity.details || {};
  
  const descriptions = {
    'user_registered': `${userName} joined the community`,
    'user_login': `${userName} signed in`,
    'proposal_created': `${userName} created a new proposal: "${details.title || 'Untitled'}"`,
    'proposal_updated': `${userName} updated a proposal`,
    'proposal_deleted': `${userName} deleted a proposal`,
    'vote_cast': `${userName} voted ${details.voteType || ''} on a proposal`,
    'vote_removed': `${userName} removed their vote`,
    'discussion_created': `${userName} started a new discussion`,
    'reply_created': `${userName} replied to a discussion`,
    'element_created': `${userName} created a new architecture element`,
    'element_updated': `${userName} updated an architecture element`
  };
  
  return descriptions[activity.action] || `${userName} performed an action`;
}

export const config = { path: '/api/activity' };
