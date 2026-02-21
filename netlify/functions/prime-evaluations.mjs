/**
 * PLE Platform — PRIME Evaluations API
 * Structured policy assessment against the five PRIME dimensions:
 * Practicality · Rights · Implementation · Monitoring · Equity
 */

import { getDb, getCurrentUser, logActivity, jsonResponse } from './lib/db.mjs';
import { v4 as uuidv4 } from 'uuid';

const DIMENSIONS = ['practicality', 'rights', 'implementation', 'monitoring', 'equity'];

export default async (req, context) => {
  const url = new URL(req.url);

  try {
    const sql = await getDb();
    const user = await getCurrentUser(req);

    if (req.method === 'GET') {
      const proposalId = url.searchParams.get('proposalId');
      const id = url.searchParams.get('id');
      if (id) return await getEvaluation(sql, id, user);
      if (proposalId) return await listForProposal(sql, proposalId, user);
      return jsonResponse({ error: 'proposalId or id required' }, 400);
    }

    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);

    if (req.method === 'POST') return await createOrUpdateEvaluation(sql, await req.json(), user);
    if (req.method === 'PUT')  return await createOrUpdateEvaluation(sql, await req.json(), user);

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('PRIME evaluations error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

// ─── GET: aggregate + individual evaluations for a proposal ───────────────

async function listForProposal(sql, proposalId, currentUser) {
  const evaluations = await sql`
    SELECT pe.*,
           u.display_name as evaluator_name,
           u.avatar_url   as evaluator_avatar
    FROM prime_evaluations pe
    LEFT JOIN users u ON pe.evaluator_id = u.id
    WHERE pe.proposal_id = ${proposalId}
      AND pe.status = 'submitted'
    ORDER BY pe.created_at DESC
  `;

  // Aggregate scores across all evaluators
  const aggregate = computeAggregate(evaluations);

  // User's own draft (if exists and logged in)
  let myEvaluation = null;
  if (currentUser) {
    const myRows = await sql`
      SELECT * FROM prime_evaluations
      WHERE proposal_id = ${proposalId} AND evaluator_id = ${currentUser.id}
      LIMIT 1
    `;
    myEvaluation = myRows[0] || null;
  }

  return jsonResponse({ evaluations, aggregate, myEvaluation, count: evaluations.length });
}

async function getEvaluation(sql, id, currentUser) {
  const rows = await sql`SELECT pe.*, u.display_name as evaluator_name FROM prime_evaluations pe LEFT JOIN users u ON pe.evaluator_id = u.id WHERE pe.id = ${id}`;
  if (!rows.length) return jsonResponse({ error: 'Not found' }, 404);
  const ev = rows[0];
  // Only evaluator or admin can see draft
  if (ev.status === 'draft' && currentUser?.id !== ev.evaluator_id && currentUser?.role !== 'admin') {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  return jsonResponse({ evaluation: ev });
}

// ─── POST/PUT: create or update own evaluation ────────────────────────────

async function createOrUpdateEvaluation(sql, body, user) {
  const { proposalId, status = 'draft', notes = {}, scores = {} } = body;

  if (!proposalId) return jsonResponse({ error: 'proposalId required' }, 400);

  // Validate scores
  for (const dim of DIMENSIONS) {
    const s = scores[dim];
    if (s !== undefined && s !== null && (s < 1 || s > 5 || !Number.isInteger(s))) {
      return jsonResponse({ error: `${dim}_score must be integer 1-5` }, 400);
    }
  }

  // Check if proposal exists
  const proposal = await sql`SELECT id, title FROM proposals WHERE id = ${proposalId}`;
  if (!proposal.length) return jsonResponse({ error: 'Proposal not found' }, 404);

  // Upsert evaluation
  const existing = await sql`
    SELECT id FROM prime_evaluations WHERE proposal_id = ${proposalId} AND evaluator_id = ${user.id}
  `;

  const fields = {
    proposal_id:          proposalId,
    evaluator_id:         user.id,
    practicality_score:   scores.practicality   || null,
    rights_score:         scores.rights         || null,
    implementation_score: scores.implementation || null,
    monitoring_score:     scores.monitoring     || null,
    equity_score:         scores.equity         || null,
    practicality_notes:   notes.practicality    || null,
    rights_notes:         notes.rights          || null,
    implementation_notes: notes.implementation  || null,
    monitoring_notes:     notes.monitoring      || null,
    equity_notes:         notes.equity          || null,
    status,
    updated_at: new Date()
  };

  let evaluation;

  if (existing.length) {
    evaluation = await sql`
      UPDATE prime_evaluations SET
        practicality_score   = ${fields.practicality_score},
        rights_score         = ${fields.rights_score},
        implementation_score = ${fields.implementation_score},
        monitoring_score     = ${fields.monitoring_score},
        equity_score         = ${fields.equity_score},
        practicality_notes   = ${fields.practicality_notes},
        rights_notes         = ${fields.rights_notes},
        implementation_notes = ${fields.implementation_notes},
        monitoring_notes     = ${fields.monitoring_notes},
        equity_notes         = ${fields.equity_notes},
        status = ${status},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING *
    `;
  } else {
    const id = uuidv4();
    evaluation = await sql`
      INSERT INTO prime_evaluations (
        id, proposal_id, evaluator_id,
        practicality_score, rights_score, implementation_score, monitoring_score, equity_score,
        practicality_notes, rights_notes, implementation_notes, monitoring_notes, equity_notes,
        status
      ) VALUES (
        ${id}, ${fields.proposal_id}, ${fields.evaluator_id},
        ${fields.practicality_score}, ${fields.rights_score}, ${fields.implementation_score},
        ${fields.monitoring_score}, ${fields.equity_score},
        ${fields.practicality_notes}, ${fields.rights_notes}, ${fields.implementation_notes},
        ${fields.monitoring_notes}, ${fields.equity_notes},
        ${status}
      ) RETURNING *
    `;
  }

  if (status === 'submitted') {
    await logActivity(user.id, 'prime_evaluation_submitted', 'proposal', proposalId, {
      total_score: evaluation[0]?.total_score
    });
  }

  return jsonResponse({ evaluation: evaluation[0] }, existing.length ? 200 : 201);
}

// ─── Aggregate: mean scores + confidence interval ─────────────────────────

function computeAggregate(evaluations) {
  if (!evaluations.length) return null;

  const agg = {};
  for (const dim of DIMENSIONS) {
    const key = `${dim}_score`;
    const scores = evaluations.map(e => e[key]).filter(s => s !== null);
    if (!scores.length) { agg[dim] = null; continue; }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    agg[dim] = {
      mean: Math.round(mean * 10) / 10,
      count: scores.length,
      distribution: [1,2,3,4,5].map(v => scores.filter(s => s === v).length)
    };
  }

  const totals = evaluations.map(e => parseFloat(e.total_score)).filter(Boolean);
  const overallMean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;

  return {
    dimensions: agg,
    overall_mean: overallMean ? Math.round(overallMean * 10) / 10 : null,
    evaluator_count: evaluations.length
  };
}
