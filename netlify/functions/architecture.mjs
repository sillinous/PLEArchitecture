import { getDb, jsonResponse } from './lib/db.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  
  try {
    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }
    
    const sql = await getDb();
    const id = url.searchParams.get('id');
    const code = url.searchParams.get('code');
    
    if (id) return await getElement(sql, id);
    if (code) return await getElementByCode(sql, code);
    return await listElements(sql, url.searchParams);
  } catch (error) {
    console.error('Architecture API error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};

async function listElements(sql, params) {
  const type = params.get('type');
  const status = params.get('status') || 'active';
  const search = params.get('search');
  
  let query = `
    SELECT ae.*, u.display_name as created_by_name,
           (SELECT COUNT(*) FROM element_relationships WHERE source_id = ae.id) as relationship_count,
           (SELECT COUNT(*) FROM proposals WHERE element_id = ae.id) as proposal_count
    FROM architecture_elements ae
    LEFT JOIN users u ON ae.created_by = u.id
    WHERE 1=1
  `;
  const params_ = [];
  let i = 1;
  
  if (type) { query += ` AND ae.element_type = $${i++}`; params_.push(type); }
  if (status) { query += ` AND ae.status = $${i++}`; params_.push(status); }
  if (search) {
    query += ` AND (ae.title ILIKE $${i} OR ae.description ILIKE $${i} OR ae.code ILIKE $${i})`;
    params_.push(`%${search}%`);
  }
  
  query += ` ORDER BY ae.element_type, ae.code`;
  
  const elements = await sql(query, params_);
  
  const grouped = { goals: [], strategies: [], capabilities: [], principles: [] };
  elements.forEach(el => {
    const formatted = formatElement(el);
    if (el.element_type === 'goal') grouped.goals.push(formatted);
    else if (el.element_type === 'strategy') grouped.strategies.push(formatted);
    else if (el.element_type === 'capability') grouped.capabilities.push(formatted);
    else if (el.element_type === 'principle') grouped.principles.push(formatted);
  });
  
  return jsonResponse({ elements: elements.map(formatElement), grouped, total: elements.length });
}

async function getElement(sql, id) {
  const elements = await sql(`
    SELECT ae.*, u.display_name as created_by_name
    FROM architecture_elements ae LEFT JOIN users u ON ae.created_by = u.id
    WHERE ae.id = $1
  `, [id]);
  
  if (elements.length === 0) return jsonResponse({ error: 'Element not found' }, 404);
  
  const relationships = await sql(`
    SELECT er.*, ae.title as target_title, ae.code as target_code, ae.element_type as target_type
    FROM element_relationships er
    JOIN architecture_elements ae ON er.target_id = ae.id
    WHERE er.source_id = $1
    UNION
    SELECT er.*, ae.title as target_title, ae.code as target_code, ae.element_type as target_type
    FROM element_relationships er
    JOIN architecture_elements ae ON er.source_id = ae.id
    WHERE er.target_id = $1
  `, [id]);
  
  const proposals = await sql(`
    SELECT id, title, status, proposal_type, created_at
    FROM proposals WHERE element_id = $1 ORDER BY created_at DESC LIMIT 10
  `, [id]);
  
  return jsonResponse({
    element: formatElement(elements[0]),
    relationships: relationships.map(r => ({
      id: r.id, type: r.relationship_type,
      target: { id: r.target_id, title: r.target_title, code: r.target_code, elementType: r.target_type }
    })),
    proposals: proposals.map(p => ({
      id: p.id, title: p.title, status: p.status, type: p.proposal_type, createdAt: p.created_at
    }))
  });
}

async function getElementByCode(sql, code) {
  const elements = await sql(`SELECT id FROM architecture_elements WHERE code = $1`, [code.toUpperCase()]);
  if (elements.length === 0) return jsonResponse({ error: 'Element not found' }, 404);
  return getElement(sql, elements[0].id);
}

function formatElement(el) {
  return {
    id: el.id, type: el.element_type, code: el.code, title: el.title,
    description: el.description, status: el.status, parentId: el.parent_id,
    createdBy: el.created_by ? { id: el.created_by, name: el.created_by_name } : null,
    metadata: el.metadata || {},
    relationshipCount: parseInt(el.relationship_count || 0),
    proposalCount: parseInt(el.proposal_count || 0),
    createdAt: el.created_at, updatedAt: el.updated_at
  };
}

export const config = { path: '/api/architecture' };
