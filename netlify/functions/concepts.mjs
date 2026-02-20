/**
 * PLE Platform — Concepts API
 * Serves the PLE conceptual ontology: concepts, frameworks, tensions, evidence, intellectual sources
 */

import { getDb, jsonResponse } from './lib/db.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') || 'concepts';

  try {
    const sql = await getDb();

    if (req.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    switch (resource) {
      case 'concepts':    return await handleConcepts(sql, url.searchParams);
      case 'frameworks':  return await handleFrameworks(sql, url.searchParams);
      case 'tensions':    return await handleTensions(sql, url.searchParams);
      case 'evidence':    return await handleEvidence(sql, url.searchParams);
      case 'sources':     return await handleSources(sql, url.searchParams);
      case 'actors':      return await handleActors(sql, url.searchParams);
      case 'graph':       return await handleGraph(sql, url.searchParams);
      default:
        return jsonResponse({ error: `Unknown resource: ${resource}` }, 400);
    }
  } catch (error) {
    console.error('Concepts API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

// ── CONCEPTS ──────────────────────────────────────────────────

async function handleConcepts(sql, params) {
  const id = params.get('id');
  const code = params.get('code');
  const type = params.get('type');
  const domain = params.get('domain');
  const core_only = params.get('core') === 'true';
  const search = params.get('q');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
  const offset = parseInt(params.get('offset') || '0');

  if (id) return await getConceptById(sql, id);
  if (code) return await getConceptByCode(sql, code);
  return await listConcepts(sql, { type, domain, core_only, search, limit, offset });
}

async function getConceptById(sql, id) {
  const concepts = await sql`SELECT * FROM concepts WHERE id = ${id}`;
  if (concepts.length === 0) return jsonResponse({ error: 'Not found' }, 404);
  const concept = concepts[0];

  // Get related evidence
  const evidence = await sql`
    SELECT es.*, el.link_type, el.notes as link_notes
    FROM evidence_links el
    JOIN evidence_sources es ON el.evidence_id = es.id
    WHERE el.concept_id = ${id}
    ORDER BY es.quality DESC, es.created_at DESC
  `;

  // Get outbound relations
  const relations = await sql`
    SELECT cr.*, cr.relation_type, cr.target_type, cr.target_id, cr.description as rel_desc
    FROM concept_relations cr
    WHERE cr.source_id = ${id}
    ORDER BY cr.relation_type, cr.weight DESC
  `;

  // Get tensions involving this concept
  const tensions = await sql`
    SELECT * FROM tensions
    WHERE pole_a_id = ${id} OR pole_b_id = ${id}
    ORDER BY severity DESC
  `;

  return jsonResponse({ concept, evidence, relations, tensions });
}

async function getConceptByCode(sql, code) {
  const concepts = await sql`SELECT * FROM concepts WHERE code = ${code}`;
  if (concepts.length === 0) return jsonResponse({ error: 'Not found' }, 404);
  return getConceptById(sql, concepts[0].id);
}

async function listConcepts(sql, { type, domain, core_only, search, limit, offset }) {
  const concepts = await sql`
    SELECT * FROM concepts
    WHERE (${type || null}::text IS NULL OR concept_type = ${type || null})
      AND (${domain || null}::text IS NULL OR domain = ${domain || null})
      AND (${core_only} = false OR is_core_ple = true)
      AND (${search || null}::text IS NULL 
           OR title ILIKE ${'%' + (search || '') + '%'} 
           OR summary ILIKE ${'%' + (search || '') + '%'})
    ORDER BY is_core_ple DESC, maturity DESC, title ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total_result = await sql`
    SELECT COUNT(*) as total FROM concepts
    WHERE (${type || null}::text IS NULL OR concept_type = ${type || null})
      AND (${domain || null}::text IS NULL OR domain = ${domain || null})
      AND (${core_only} = false OR is_core_ple = true)
      AND (${search || null}::text IS NULL 
           OR title ILIKE ${'%' + (search || '') + '%'} 
           OR summary ILIKE ${'%' + (search || '') + '%'})
  `;

  return jsonResponse({
    concepts,
    total: parseInt(total_result[0]?.total || 0),
    limit,
    offset
  });
}

// ── FRAMEWORKS ──────────────────────────────────────────────────

async function handleFrameworks(sql, params) {
  const id = params.get('id');
  const code = params.get('code');

  if (id || code) {
    const fw = id
      ? await sql`SELECT * FROM frameworks WHERE id = ${id}`
      : await sql`SELECT * FROM frameworks WHERE code = ${code}`;

    if (fw.length === 0) return jsonResponse({ error: 'Not found' }, 404);

    const elements = await sql`
      SELECT * FROM framework_elements
      WHERE framework_id = ${fw[0].id}
      ORDER BY sort_order, layer_number
    `;

    return jsonResponse({ framework: fw[0], elements });
  }

  const frameworks = await sql`SELECT * FROM frameworks ORDER BY code`;
  return jsonResponse({ frameworks });
}

// ── TENSIONS ──────────────────────────────────────────────────

async function handleTensions(sql, params) {
  const type = params.get('type');
  const severity = params.get('severity');
  const status = params.get('status');

  const tensions = await sql`
    SELECT t.*,
           ca.title as pole_a_title, ca.code as pole_a_code,
           cb.title as pole_b_title, cb.code as pole_b_code
    FROM tensions t
    LEFT JOIN concepts ca ON t.pole_a_id = ca.id
    LEFT JOIN concepts cb ON t.pole_b_id = cb.id
    WHERE (${type || null}::text IS NULL OR t.tension_type = ${type || null})
      AND (${severity || null}::text IS NULL OR t.severity = ${severity || null})
      AND (${status || null}::text IS NULL OR t.resolution_status = ${status || null})
    ORDER BY 
      CASE t.severity WHEN 'fundamental' THEN 1 WHEN 'significant' THEN 2 ELSE 3 END,
      t.created_at DESC
  `;

  return jsonResponse({ tensions });
}

// ── EVIDENCE ──────────────────────────────────────────────────

async function handleEvidence(sql, params) {
  const concept_id = params.get('conceptId');
  const type = params.get('type');
  const quality = params.get('quality');

  if (concept_id) {
    const evidence = await sql`
      SELECT es.*, el.link_type, el.notes as link_notes
      FROM evidence_links el
      JOIN evidence_sources es ON el.evidence_id = es.id
      WHERE el.concept_id = ${concept_id}
      ORDER BY 
        CASE es.quality WHEN 'consensus' THEN 1 WHEN 'meta_analysis' THEN 2 
          WHEN 'longitudinal' THEN 3 WHEN 'pilot' THEN 4 ELSE 5 END,
        es.created_at DESC
    `;
    return jsonResponse({ evidence });
  }

  const evidence = await sql`
    SELECT * FROM evidence_sources
    WHERE (${type || null}::text IS NULL OR evidence_type = ${type || null})
      AND (${quality || null}::text IS NULL OR quality = ${quality || null})
    ORDER BY 
      CASE quality WHEN 'consensus' THEN 1 WHEN 'meta_analysis' THEN 2 
        WHEN 'longitudinal' THEN 3 WHEN 'pilot' THEN 4 ELSE 5 END,
      created_at DESC
  `;

  return jsonResponse({ evidence });
}

// ── INTELLECTUAL SOURCES ──────────────────────────────────────

async function handleSources(sql, params) {
  const relationship = params.get('relationship');

  const sources = await sql`
    SELECT * FROM intellectual_sources
    WHERE (${relationship || null}::text IS NULL OR relationship_to_ple = ${relationship || null})
    ORDER BY name ASC
  `;

  return jsonResponse({ sources });
}

// ── ACTOR TYPES ──────────────────────────────────────────────

async function handleActors(sql, params) {
  const actors = await sql`SELECT * FROM actor_types ORDER BY title`;
  return jsonResponse({ actors });
}

// ── FULL GRAPH ────────────────────────────────────────────────

async function handleGraph(sql, params) {
  // Returns the full typed relationship graph for visualization
  const concepts = await sql`SELECT id, code, title, concept_type, domain, maturity, confidence, is_core_ple FROM concepts`;
  const frameworks = await sql`SELECT id, code, title, scope, completeness FROM frameworks`;
  const framework_elements = await sql`SELECT id, code, title, framework_id, layer_number FROM framework_elements`;
  const relations = await sql`SELECT * FROM concept_relations ORDER BY weight DESC`;
  const tensions = await sql`SELECT id, code, title, tension_type, severity, pole_a_id, pole_b_id FROM tensions`;

  // Build nodes and edges
  const nodes = [
    ...concepts.map(c => ({ id: c.id, code: c.code, label: c.title, type: 'concept', sub_type: c.concept_type, domain: c.domain, maturity: c.maturity, is_core: c.is_core_ple })),
    ...frameworks.map(f => ({ id: f.id, code: f.code, label: f.title, type: 'framework', sub_type: f.scope })),
    ...framework_elements.map(e => ({ id: e.id, code: e.code, label: e.title, type: 'framework_element', layer: e.layer_number, framework_id: e.framework_id }))
  ];

  const edges = [
    ...relations.map(r => ({ source: r.source_id, target: r.target_id, type: r.relation_type, weight: r.weight })),
    ...tensions.filter(t => t.pole_a_id && t.pole_b_id).map(t => ({ source: t.pole_a_id, target: t.pole_b_id, type: 'conflicts_with', tension_id: t.id, severity: t.severity })),
    ...framework_elements.map(e => ({ source: e.id, target: e.framework_id, type: 'part_of', weight: 1.0 }))
  ];

  return jsonResponse({ nodes, edges, meta: { node_count: nodes.length, edge_count: edges.length } });
}
