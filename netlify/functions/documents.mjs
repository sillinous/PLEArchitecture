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
      if (id) return await getDocument(sql, id, user);
      if (slug) return await getDocumentBySlug(sql, slug, user);
      return await listDocuments(sql, url.searchParams, user);
    }
    
    if (!user) return jsonResponse({ error: 'Authentication required' }, 401);
    
    if (req.method === 'POST') {
      const action = url.searchParams.get('action');
      if (action === 'publish') return await publishDocument(sql, url.searchParams.get('id'), user);
      if (action === 'unpublish') return await unpublishDocument(sql, url.searchParams.get('id'), user);
      return await createDocument(sql, await req.json(), user);
    }
    if (req.method === 'PUT') {
      return await updateDocument(sql, await req.json(), user);
    }
    if (req.method === 'DELETE') {
      return await deleteDocument(sql, url.searchParams.get('id'), user);
    }
    
    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Documents API error:', error);
    return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
  }
};

async function listDocuments(sql, params, user) {
  const projectId = params.get('projectId') || null;
  const groupId = params.get('groupId') || null;
  const documentType = params.get('type') || null;
  const status = params.get('status') || null;
  const visibility = params.get('visibility') || null;
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);
  const offset = parseInt(params.get('offset') || '0');
  
  // Determine visibility filter based on auth
  let visibilityFilter;
  if (visibility) {
    visibilityFilter = [visibility];
  } else if (user) {
    visibilityFilter = ['public', 'internal'];
  } else {
    visibilityFilter = ['public'];
  }
  
  // For public visibility, only show published docs
  const statusFilter = !user && visibilityFilter.includes('public') ? 'published' : status;
  
  const documents = await sql`
    SELECT d.*,
           u.display_name as author_name, u.avatar_url as author_avatar,
           p.title as project_title, p.slug as project_slug,
           wg.name as group_name, wg.slug as group_slug
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN projects p ON d.project_id = p.id
    LEFT JOIN working_groups wg ON d.working_group_id = wg.id
    WHERE (${projectId}::uuid IS NULL OR d.project_id = ${projectId}::uuid)
      AND (${groupId}::uuid IS NULL OR d.working_group_id = ${groupId}::uuid)
      AND (${documentType}::text IS NULL OR d.document_type = ${documentType})
      AND (${statusFilter}::text IS NULL OR d.status = ${statusFilter})
      AND d.visibility = ANY(${visibilityFilter})
      AND d.parent_id IS NULL
    ORDER BY d.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  
  const countResult = await sql`
    SELECT COUNT(*) as total FROM documents
    WHERE (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
      AND (${groupId}::uuid IS NULL OR working_group_id = ${groupId}::uuid)
      AND (${documentType}::text IS NULL OR document_type = ${documentType})
      AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
      AND visibility = ANY(${visibilityFilter})
      AND parent_id IS NULL
  `;
  
  return jsonResponse({
    documents: documents.map(formatDocument),
    total: parseInt(countResult[0]?.total || 0),
    limit, offset
  });
}

async function getDocument(sql, id, user) {
  const documents = await sql`
    SELECT d.*,
           u.display_name as author_name, u.avatar_url as author_avatar,
           p.title as project_title, p.slug as project_slug,
           wg.name as group_name, wg.slug as group_slug
    FROM documents d
    LEFT JOIN users u ON d.author_id = u.id
    LEFT JOIN projects p ON d.project_id = p.id
    LEFT JOIN working_groups wg ON d.working_group_id = wg.id
    WHERE d.id = ${id}
  `;
  
  if (documents.length === 0) return jsonResponse({ error: 'Document not found' }, 404);
  
  const doc = documents[0];
  
  // Check visibility
  if (doc.visibility === 'internal' && !user) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }
  if (doc.status !== 'published' && !user) {
    return jsonResponse({ error: 'Document not published' }, 404);
  }
  
  // Get version history
  const versions = await sql`
    SELECT dv.*, u.display_name as created_by_name
    FROM document_versions dv
    LEFT JOIN users u ON dv.created_by = u.id
    WHERE dv.document_id = ${id}
    ORDER BY dv.version DESC
    LIMIT 20
  `;
  
  // Get child documents (for hierarchical docs)
  const children = await sql`
    SELECT id, title, slug, document_type, status, updated_at
    FROM documents
    WHERE parent_id = ${id}
    ORDER BY title
  `;
  
  return jsonResponse({
    document: {
      ...formatDocument(doc),
      content: doc.content
    },
    versions: versions.map(v => ({
      id: v.id,
      version: v.version,
      changeSummary: v.change_summary,
      createdBy: v.created_by_name,
      createdAt: v.created_at
    })),
    children: children.map(c => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      type: c.document_type,
      status: c.status,
      updatedAt: c.updated_at
    }))
  });
}

async function getDocumentBySlug(sql, slug, user) {
  const documents = await sql`SELECT id FROM documents WHERE slug = ${slug}`;
  if (documents.length === 0) return jsonResponse({ error: 'Document not found' }, 404);
  return getDocument(sql, documents[0].id, user);
}

async function createDocument(sql, body, user) {
  const { title, content, documentType, visibility, projectId, workingGroupId, parentId } = body;
  
  if (!title) return jsonResponse({ error: 'Title is required' }, 400);
  
  const id = uuidv4();
  const slug = generateSlug(title);
  
  await sql`
    INSERT INTO documents (id, title, slug, content, document_type, visibility, project_id, working_group_id, parent_id, author_id)
    VALUES (${id}, ${title}, ${slug}, ${content || ''}, ${documentType || 'page'}, ${visibility || 'internal'}, ${projectId || null}, ${workingGroupId || null}, ${parentId || null}, ${user.id})
  `;
  
  await logActivity(user.id, 'document_created', 'document', id, { title, documentType });
  
  return jsonResponse({ success: true, id, slug }, 201);
}

async function updateDocument(sql, body, user) {
  const { id, title, content, documentType, visibility, changeSummary } = body;
  
  if (!id) return jsonResponse({ error: 'Document ID required' }, 400);
  
  const documents = await sql`SELECT author_id, content, version FROM documents WHERE id = ${id}`;
  if (documents.length === 0) return jsonResponse({ error: 'Document not found' }, 404);
  
  const doc = documents[0];
  
  // Save version history if content changed
  if (content && content !== doc.content) {
    const newVersion = (doc.version || 1) + 1;
    
    // Save current version to history
    await sql`
      INSERT INTO document_versions (document_id, content, version, change_summary, created_by)
      VALUES (${id}, ${doc.content}, ${doc.version || 1}, ${changeSummary || 'Content update'}, ${user.id})
    `;
    
    // Update document with new version
    await sql`
      UPDATE documents SET
        title = COALESCE(${title || null}, title),
        content = ${content},
        document_type = COALESCE(${documentType || null}, document_type),
        visibility = COALESCE(${visibility || null}, visibility),
        version = ${newVersion},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE documents SET
        title = COALESCE(${title || null}, title),
        document_type = COALESCE(${documentType || null}, document_type),
        visibility = COALESCE(${visibility || null}, visibility),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  }
  
  await logActivity(user.id, 'document_updated', 'document', id);
  
  return jsonResponse({ success: true });
}

async function publishDocument(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Document ID required' }, 400);
  
  await sql`
    UPDATE documents SET
      status = 'published',
      published_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'document_published', 'document', id);
  
  return jsonResponse({ success: true });
}

async function unpublishDocument(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Document ID required' }, 400);
  
  await sql`
    UPDATE documents SET
      status = 'draft',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
  
  await logActivity(user.id, 'document_unpublished', 'document', id);
  
  return jsonResponse({ success: true });
}

async function deleteDocument(sql, id, user) {
  if (!id) return jsonResponse({ error: 'Document ID required' }, 400);
  
  const documents = await sql`SELECT author_id FROM documents WHERE id = ${id}`;
  if (documents.length === 0) return jsonResponse({ error: 'Document not found' }, 404);
  
  if (documents[0].author_id !== user.id && user.role !== 'admin') {
    return jsonResponse({ error: 'Not authorized' }, 403);
  }
  
  await sql`DELETE FROM documents WHERE id = ${id}`;
  await logActivity(user.id, 'document_deleted', 'document', id);
  
  return jsonResponse({ success: true });
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) + '-' + Date.now().toString(36);
}

function formatDocument(d) {
  return {
    id: d.id,
    title: d.title,
    slug: d.slug,
    documentType: d.document_type,
    status: d.status,
    visibility: d.visibility,
    version: d.version || 1,
    author: d.author_id ? { id: d.author_id, name: d.author_name, avatar: d.author_avatar } : null,
    project: d.project_id ? { id: d.project_id, title: d.project_title, slug: d.project_slug } : null,
    group: d.working_group_id ? { id: d.working_group_id, name: d.group_name, slug: d.group_slug } : null,
    parentId: d.parent_id,
    publishedAt: d.published_at,
    createdAt: d.created_at,
    updatedAt: d.updated_at
  };
}

export const config = { path: '/api/documents' };
