/**
 * PLE Platform - Database Module
 * Handles connection and auto-migration on first use
 */

import { neon } from '@netlify/neon';

const sql = neon();

// Migration status tracking (per-instance, runs once per cold start)
let migrationChecked = false;

/**
 * Ensure database is initialized before any query
 * Runs idempotent migrations on cold start
 */
export async function ensureDatabase() {
  if (migrationChecked) return;
  
  try {
    // Quick check - if users table exists, we're good
    const check = await sql`SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'users'
    )`;
    
    if (check[0]?.exists) {
      migrationChecked = true;
      return;
    }
    
    // Run migrations
    console.log('🚀 Running database initialization...');
    await runMigrations();
    
    migrationChecked = true;
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    migrationChecked = true;
    throw error;
  }
}

async function runMigrations() {
  // ── Run v2.0 metamodel migration if needed ──
  await runMetamodelMigration();

  // Users table
  await sql`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
  )`;

  // Architecture Elements
  await sql`CREATE TABLE IF NOT EXISTS architecture_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    element_type VARCHAR(50) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    parent_id UUID REFERENCES architecture_elements(id),
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Element relationships
  await sql`CREATE TABLE IF NOT EXISTS element_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID,
    target_id UUID,
    relationship_type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Proposals
  await sql`CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    proposal_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    author_id UUID,
    element_id UUID,
    voting_starts TIMESTAMP,
    voting_ends TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Votes
  await sql`CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID,
    user_id UUID,
    vote_type VARCHAR(20) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, user_id)
  )`;

  // Discussions
  await sql`CREATE TABLE IF NOT EXISTS discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200),
    content TEXT NOT NULL,
    author_id UUID,
    parent_id UUID,
    proposal_id UUID,
    element_id UUID,
    discussion_type VARCHAR(50) DEFAULT 'general',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Activity log
  await sql`CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Sessions
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT
  )`;

  // Working Groups - teams that own projects
  await sql`CREATE TABLE IF NOT EXISTS working_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    mission TEXT,
    status VARCHAR(50) DEFAULT 'active',
    visibility VARCHAR(50) DEFAULT 'public',
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Working Group Members
  await sql`CREATE TABLE IF NOT EXISTS working_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES working_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
  )`;

  // Projects - first-class work containers
  await sql`CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    objectives TEXT,
    status VARCHAR(50) DEFAULT 'planning',
    priority VARCHAR(50) DEFAULT 'medium',
    visibility VARCHAR(50) DEFAULT 'internal',
    working_group_id UUID REFERENCES working_groups(id),
    proposal_id UUID REFERENCES proposals(id),
    lead_id UUID REFERENCES users(id),
    start_date DATE,
    target_date DATE,
    completed_at TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Project Members
  await sql`CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'contributor',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
  )`;

  // Tasks - work items within projects
  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES tasks(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    priority VARCHAR(50) DEFAULT 'medium',
    assignee_id UUID REFERENCES users(id),
    reporter_id UUID REFERENCES users(id),
    due_date DATE,
    estimated_hours DECIMAL(6,2),
    actual_hours DECIMAL(6,2),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Milestones - project checkpoints
  await sql`CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    target_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    sort_order INTEGER DEFAULT 0,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Documents - content management
  await sql`CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    content TEXT,
    document_type VARCHAR(50) DEFAULT 'page',
    status VARCHAR(50) DEFAULT 'draft',
    visibility VARCHAR(50) DEFAULT 'internal',
    project_id UUID REFERENCES projects(id),
    working_group_id UUID REFERENCES working_groups(id),
    author_id UUID REFERENCES users(id),
    parent_id UUID REFERENCES documents(id),
    version INTEGER DEFAULT 1,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // Document Versions - track changes
  await sql`CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT,
    version INTEGER NOT NULL,
    change_summary VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Tags - flexible categorization
  await sql`CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    color VARCHAR(20) DEFAULT '#6B7280',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // Entity Tags - polymorphic tagging
  await sql`CREATE TABLE IF NOT EXISTS entity_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tag_id, entity_type, entity_id)
  )`;

  // Seed architecture data
  await seedArchitecture();
}

// ─────────────────────────────────────────────────────────────
// V2.0 METAMODEL MIGRATION (additive, idempotent)
// ─────────────────────────────────────────────────────────────

async function runMetamodelMigration() {
  // Check if already migrated
  const check = await sql`SELECT EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'concepts'
  )`;
  if (check[0]?.exists) return;

  console.log('🧠 Running v2.0 metamodel migration...');

  // ── CONCEPTS — core PLE intellectual vocabulary
  await sql`CREATE TABLE IF NOT EXISTS concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary TEXT NOT NULL,
    body TEXT,
    concept_type VARCHAR(50) NOT NULL,   -- phenomenon|mechanism|proposal|critique|synthesis
    domain VARCHAR(50) NOT NULL,         -- economic|political|social|technical|ecological|philosophical
    origin_tradition VARCHAR(200),
    maturity VARCHAR(30) DEFAULT 'developing',  -- embryonic|developing|established|canonical
    confidence VARCHAR(30) DEFAULT 'contested', -- speculative|contested|supported|consensus
    is_core_ple BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // ── FRAMEWORKS — overarching analytical/normative structures
  await sql`CREATE TABLE IF NOT EXISTS frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary TEXT NOT NULL,
    scope VARCHAR(30) NOT NULL,          -- descriptive|normative|analytical|evaluative
    completeness VARCHAR(30) DEFAULT 'draft', -- outline|draft|complete|validated
    layer_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // ── FRAMEWORK ELEMENTS — layers, dimensions, nodes within a framework
  await sql`CREATE TABLE IF NOT EXISTS framework_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    layer_number INTEGER,
    element_role VARCHAR(100),           -- what this element does within the framework
    examples TEXT[],                     -- concrete real-world examples
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // ── CONCEPT RELATIONS — typed, directed relationship graph
  await sql`CREATE TABLE IF NOT EXISTS concept_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL,    -- concept|framework|goal|project|intervention
    source_id UUID NOT NULL,
    relation_type VARCHAR(50) NOT NULL,  -- enables|requires|conflicts_with|addresses|
                                         -- instantiates|part_of|evolved_from|measures|
                                         -- embodies|challenges|supports|critiques|synthesizes
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    description TEXT,
    weight DECIMAL(3,2) DEFAULT 1.0,     -- relationship strength 0.0–1.0
    is_bidirectional BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id, relation_type, target_type, target_id)
  )`;

  // ── TENSIONS — documented trade-offs and contradictions
  await sql`CREATE TABLE IF NOT EXISTS tensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    tension_type VARCHAR(30) NOT NULL,   -- empirical|normative|political|implementation
    severity VARCHAR(30) DEFAULT 'significant', -- minor|significant|fundamental
    resolution_status VARCHAR(30) DEFAULT 'unresolved', -- unresolved|partially_addressed|resolved
    resolution_notes TEXT,
    pole_a_id UUID,                      -- first concept in tension
    pole_b_id UUID,                      -- second concept in tension
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // ── EVIDENCE SOURCES — empirical anchors
  await sql`CREATE TABLE IF NOT EXISTS evidence_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    evidence_type VARCHAR(50) NOT NULL,  -- case_study|research|data_source|theoretical
    quality VARCHAR(30) DEFAULT 'pilot', -- anecdotal|pilot|longitudinal|meta_analysis|consensus
    location VARCHAR(200),               -- where this happened (for case studies)
    time_period VARCHAR(100),
    url TEXT,
    citation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // ── EVIDENCE LINKS — connect evidence to concepts
  await sql`CREATE TABLE IF NOT EXISTS evidence_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID REFERENCES evidence_sources(id) ON DELETE CASCADE,
    concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
    link_type VARCHAR(20) NOT NULL,      -- supports|challenges|illustrates
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(evidence_id, concept_id, link_type)
  )`;

  // ── INTELLECTUAL SOURCES — research lineage
  await sql`CREATE TABLE IF NOT EXISTS intellectual_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    tradition VARCHAR(200),
    key_works TEXT[],
    relationship_to_ple VARCHAR(30) NOT NULL, -- draws_on|responds_to|critiques|synthesizes
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  // ── INTERVENTIONS — real-world change proposals
  await sql`CREATE TABLE IF NOT EXISTS interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    intervention_type VARCHAR(50) NOT NULL,  -- policy|institutional|technological|cultural|legal
    target_actor_type VARCHAR(50),           -- who must act to implement this
    scale VARCHAR(30) NOT NULL,              -- individual|local|national|global
    feasibility VARCHAR(30) DEFAULT 'medium', -- low|medium|high
    time_to_impact VARCHAR(30),
    prosperity_layer INTEGER[],              -- which pyramid layers this addresses
    power_layer INTEGER[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
  )`;

  // ── ACTOR TYPES — agent taxonomy
  await sql`CREATE TABLE IF NOT EXISTS actor_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    is_collective BOOLEAN DEFAULT false,
    post_labor_role TEXT,                    -- how this actor type is transformed in post-labor economy
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`;

  console.log('✅ v2.0 metamodel tables created');
  await seedMetamodel();
}

// ─────────────────────────────────────────────────────────────
// V2.0 SEED DATA — full PLE ontology
// ─────────────────────────────────────────────────────────────

async function seedMetamodel() {
  console.log('🌱 Seeding PLE metamodel...');

  // ── FRAMEWORKS ──
  const frameworks_data = [
    ['FW-L0',    'L/0 Thesis (Labor Zero)',       'The foundational claim that obligatory human labor is ending — not that humans will stop doing things, but that economic compulsion to work will dissolve as AI and automation perform most productive work.',   'descriptive', 'complete', 0],
    ['FW-PROS',  'Pyramid of Prosperity',          'Five-layer architecture for distributing income and wealth to households after labor ceases to be the primary distribution mechanism. Layers are ordered by universality — lower layers cover everyone, higher layers are more differentiated.',  'normative',   'complete', 5],
    ['FW-POW',   'Pyramid of Power',               'Five-layer architecture for maintaining democratic leverage and civic participation after labor power (strikes, collective bargaining) sunsets. Each layer is a different substrate of power.',                  'normative',   'complete', 5],
    ['FW-GATO',  'GATO Framework',                 'Global Automated Trade Organization — a proposed international governance architecture to manage AI and automation at planetary scale, analogous to WTO for trade but designed for the post-labor era.',         'analytical',  'draft',    0],
    ['FW-PRIME', 'PRIME Framework',                'A rubric for evaluating post-labor policy proposals across five dimensions: Practicality, Rights, Implementation, Monitoring, and Equity. Provides structured assessment that goes beyond single-axis analysis.',  'evaluative',  'complete', 5],
    ['FW-LVN',   'Latent Value Network',           'Framework for mapping, understanding, and surfacing the vast substrate of human value that markets have never learned to measure — care, social infrastructure, knowledge commons, ecological stewardship, and more.',  'analytical',  'draft',    6]
  ];

  for (const [code, title, summary, scope, completeness, layer_count] of frameworks_data) {
    await sql`INSERT INTO frameworks (code, title, summary, scope, completeness, layer_count)
              VALUES (${code}, ${title}, ${summary}, ${scope}, ${completeness}, ${layer_count})
              ON CONFLICT (code) DO NOTHING`;
  }

  // ── FRAMEWORK ELEMENTS — Pyramid of Prosperity ──
  const pros_fw = await sql`SELECT id FROM frameworks WHERE code = 'FW-PROS' LIMIT 1`;
  const pros_id = pros_fw[0]?.id;

  const prosperity_layers = [
    ['PROS-L1', 'Layer 1: Universals',                   'The unconditional floor — income and services every human receives simply by being alive. Not means-tested, not conditional on work. The foundation of post-labor prosperity.', 1, 'Income and services guaranteed to all', '{\'Universal Basic Income (UBI)\',\'Universal Healthcare (UHC)\',\'Universal Basic Services (housing, transit, education)\',\'Alaska Permanent Fund Dividend — $1,000+/year for all residents\'}'],
    ['PROS-L2', 'Layer 2: Collectively Owned Public Assets', 'Returns from assets owned in common by everyone as citizens or residents. The wealth of natural resources, public infrastructure, and sovereign investment funds distributed to all.',  2, 'Returns on public ownership distributed to all', '{\'Norway Government Pension Fund — largest sovereign wealth fund\',\'Alaska Permanent Fund\',\'Public resource royalties (oil, minerals, spectrum)\',\'Land value tax redistribution\'}'],
    ['PROS-L3', 'Layer 3: Collectively Owned Private Assets', 'Returns distributed to workers, communities, or cooperative members rather than concentrated among investors. The ownership economy — where those who do the work own the means.',  3, 'Cooperative and collective ownership income', '{\'Mondragon Corporation — 80,000 member cooperative\',\'Employee Stock Ownership Plans (ESOPs)\',\'Data cooperatives\',\'Housing cooperatives\',\'Platform cooperatives\'}'],
    ['PROS-L4', 'Layer 4: Individual Private Assets',        'Returns on assets owned personally — investments, intellectual property, entrepreneurial equity. Present in every economy; in post-labor, access is democratized through earlier layers.',      4, 'Personal capital returns', '{\'Index fund dividends\',\'Baby Bonds — universal children\'s investment accounts\',\'Home equity\',\'Royalty income\'}'],
    ['PROS-L5', 'Layer 5: Meaningful Work Income',           'Wages and compensation for the residual human work that remains after automation — but in a post-labor economy, this work is chosen for meaning, not economic compulsion. The top of the pyramid, not the base.',  5, 'Voluntary, meaning-driven labor income', '{\'Care professions (nursing, teaching, social work)\',\'Creative work (art, music, writing)\',\'Craft and artisanal production\',\'Research and intellectual work\'}']
  ];

  for (const [code, title, description, layer_number, element_role, examples_str] of prosperity_layers) {
    if (pros_id) {
      const examples = examples_str.replace(/^\{|\}$/g, '').split("','").map(s => s.replace(/^'|'$/g, ''));
      await sql`INSERT INTO framework_elements (framework_id, code, title, description, layer_number, element_role, sort_order)
                VALUES (${pros_id}, ${code}, ${title}, ${description}, ${layer_number}, ${element_role}, ${layer_number})
                ON CONFLICT (code) DO NOTHING`;
    }
  }

  // ── FRAMEWORK ELEMENTS — Pyramid of Power ──
  const pow_fw = await sql`SELECT id FROM frameworks WHERE code = 'FW-POW' LIMIT 1`;
  const pow_id = pow_fw[0]?.id;

  const power_layers = [
    ['POW-L1', 'Layer 1: Immutable Civic Bedrock',   'The tamper-proof foundation — identity, property records, legal rights, and citizenship documented on systems no single actor can corrupt or erase. Democratic power begins with certainty about who exists and what is theirs.', 1, 'Incorruptible identity and property foundation'],
    ['POW-L2', 'Layer 2: Open Payment Rails',         'Universal, interoperable, affordable financial infrastructure. When anyone can transact with anyone, outside the control of private intermediaries, economic participation becomes a right not a privilege.', 2, 'Universal financial access and interoperability'],
    ['POW-L3', 'Layer 3: Radical Transparency',       'Making the exercise of power visible — open procurement, auditable algorithms, transparent budgets, accessible data. Citizens cannot govern what they cannot see. Transparency is not sufficient for power, but it is necessary.', 3, 'Visibility into how power is actually exercised'],
    ['POW-L4', 'Layer 4: Direct Democracy',           'Mechanisms for citizens to participate directly in decisions that affect them — not just electing representatives but setting priorities, allocating budgets, and shaping policy in real time.', 4, 'Direct citizen participation in consequential decisions'],
    ['POW-L5', 'Layer 5: Meta-Governance',            'The rules for changing the rules — constitutional design for the post-labor era. Who can change the payment rails? Who governs the AI systems? Meta-governance closes the loop between power and accountability.', 5, 'Governance of governance systems themselves']
  ];

  for (const [code, title, description, layer_number, element_role] of power_layers) {
    if (pow_id) {
      await sql`INSERT INTO framework_elements (framework_id, code, title, description, layer_number, element_role, sort_order)
                VALUES (${pow_id}, ${code}, ${title}, ${description}, ${layer_number}, ${element_role}, ${layer_number})
                ON CONFLICT (code) DO NOTHING`;
    }
  }

  // ── FRAMEWORK ELEMENTS — PRIME ──
  const prime_fw = await sql`SELECT id FROM frameworks WHERE code = 'FW-PRIME' LIMIT 1`;
  const prime_id = prime_fw[0]?.id;

  const prime_dimensions = [
    ['PRIME-P', 'Practicality',    'Can this actually be implemented? Does it account for political feasibility, administrative capacity, behavioral economics, and path dependencies?',                         1, 'Feasibility and real-world implementation assessment'],
    ['PRIME-R', 'Rights',          'Does this proposal respect and expand fundamental rights? Does it create new rights or responsibilities? Who is left out?',                                               2, 'Rights impacts and human dignity assessment'],
    ['PRIME-I', 'Implementation',  'What institutions, processes, and capabilities are required? What is the transition path? What fails first?',                                                             3, 'Implementation path and institutional requirements'],
    ['PRIME-M', 'Monitoring',      'How will we know if this works? What are the leading indicators, lagging indicators, and failure modes? What data must be collected?',                                    4, 'Measurement, evaluation, and feedback loop design'],
    ['PRIME-E', 'Equity',          'Who benefits, and by how much? Who bears costs? Does this narrow or widen gaps across race, gender, geography, age, and class? Does it address intersectional harms?',  5, 'Distributional impact and justice assessment']
  ];

  for (const [code, title, description, layer_number, element_role] of prime_dimensions) {
    if (prime_id) {
      await sql`INSERT INTO framework_elements (framework_id, code, title, description, layer_number, element_role, sort_order)
                VALUES (${prime_id}, ${code}, ${title}, ${description}, ${layer_number}, ${element_role}, ${layer_number})
                ON CONFLICT (code) DO NOTHING`;
    }
  }

  // ── FRAMEWORK ELEMENTS — LVN ──
  const lvn_fw = await sql`SELECT id FROM frameworks WHERE code = 'FW-LVN' LIMIT 1`;
  const lvn_id = lvn_fw[0]?.id;

  const lvn_categories = [
    ['LVN-C1', 'Care Value',                'Childrearing, elder care, disability support, emotional labor, and the work of sustaining human beings through vulnerability.',                                                          1, 'Human biological and emotional sustenance'],
    ['LVN-C2', 'Knowledge Commons',          'Open source software, Wikipedia, academic preprints, informal teaching, and every act of sharing knowledge beyond market transactions.',                                               2, 'Shared knowledge infrastructure'],
    ['LVN-C3', 'Social Infrastructure',      'Trust networks, community organizing, conflict mediation, social norms maintenance, and the invisible work of keeping communities functional.',                                       3, 'Social cohesion and community maintenance'],
    ['LVN-C4', 'Ecological Stewardship',     'Land tending, biodiversity maintenance, watershed protection, climate resilience work, and the management of commons under threat.',                                                  4, 'Ecological health and commons stewardship'],
    ['LVN-C5', 'Creative Culture',           'Art, music, storytelling, ritual, and cultural production that builds collective meaning, identity, and the shared imaginative life of communities.',                                 5, 'Meaning-making and cultural reproduction'],
    ['LVN-C6', 'Civic Participation',        'Voting, volunteering, local governance, watchdog journalism, whistleblowing, protest, and every other act of democratic self-governance beyond formal employment.',                   6, 'Democratic and civic value creation']
  ];

  for (const [code, title, description, layer_number, element_role] of lvn_categories) {
    if (lvn_id) {
      await sql`INSERT INTO framework_elements (framework_id, code, title, description, layer_number, element_role, sort_order)
                VALUES (${lvn_id}, ${code}, ${title}, ${description}, ${layer_number}, ${element_role}, ${layer_number})
                ON CONFLICT (code) DO NOTHING`;
    }
  }

  // ── CORE CONCEPTS ──
  const concepts_data = [
    // Phenomena — things that exist
    ['CON-L0',   'L/0 (Labor Zero)',            'The thesis that obligatory human labor is ending. The "/" evokes division by zero — an operation that breaks mathematics, just as zero labor breaks conventional economics. Not about banning work, but ending coercion.',                      'phenomenon', 'economic',      'David Shapiro / PLE Movement', 'established', 'supported',  true],
    ['CON-LAB',  'Laborism',                    'The invisible ideology that work is morally necessary — that people should work regardless of whether their work is needed. Spans left (dignity of work) and right (no free lunch). The primary cultural obstacle to post-labor economics.',   'phenomenon', 'philosophical', 'Cultural criticism',           'established', 'consensus',  true],
    ['CON-TAUM', 'Technological Unemployment',  'Job losses caused by technological advancement that outpaces new role creation. Distinguished from cyclical unemployment by its structural, permanent character. The empirical driver behind PLE.',                                            'phenomenon', 'economic',      'John Maynard Keynes (1930)',   'established', 'consensus',  true],
    ['CON-PREC', 'Precariat',                   'A growing social class defined by precarious work, temporary contracts, and lack of the employment benefits that defined mid-20th century labor. The transitional condition between full employment and post-labor.',                          'phenomenon', 'social',        'Guy Standing',                 'established', 'supported',  true],
    ['CON-CARE', 'Care Economy',                'The vast, unpaid economy of care work — childcare, eldercare, sick care, emotional labor — performed primarily by women. Invisible to GDP, foundational to everything GDP does measure.',                                                    'phenomenon', 'economic',      'Nancy Folbre, feminist economics', 'established', 'supported', true],
    ['CON-LVAL', 'Latent Value',                'Economic and social value that exists and is real but is not measured, priced, or compensated by formal markets. The substrate of human flourishing that economies fail to account for.',                                                    'phenomenon', 'economic',      'PLE / LVN framework',          'developing',  'contested',  true],
    ['CON-WLTH', 'Wealth Concentration',        'The accelerating concentration of capital ownership in fewer hands as returns to capital outpace returns to labor (r > g). The distributional crisis that post-labor economics must solve.',                                                 'phenomenon', 'economic',      'Thomas Piketty',               'established', 'consensus',  true],
    ['CON-ALGP', 'Algorithmic Power',           'The emerging form of power exercised through control of AI systems, data, and algorithmic infrastructure. Must replace and extend traditional labor power (strikes, collective bargaining) in the post-labor era.',                          'phenomenon', 'political',     'PLE Movement',                 'developing',  'contested',  true],

    // Mechanisms — causal processes
    ['CON-MKTF', 'Market Pricing Mechanism',    'The process by which prices emerge from decentralized exchange, allocating resources and signaling information. Powerful for private, scarce, tradeable goods; systematically fails for public goods, commons, and non-commodifiable value.', 'mechanism',  'economic',      'Hayek, Smith',                 'canonical',   'consensus',  false],
    ['CON-COOP', 'Cooperative Ownership',       'A form of enterprise where those who do the work (workers) or use the services (consumers) own and govern the organization. Distributes returns to labor and community rather than external capital.',                                        'mechanism',  'economic',      'Rochdale Principles (1844)',   'canonical',   'consensus',  true],
    ['CON-DAO',  'Decentralized Autonomous Organization', 'A governance and ownership structure implemented in code — rules enforced by smart contracts rather than legal institutions. An emerging mechanism for commons governance and collective ownership at scale.', 'mechanism', 'technical', 'Ethereum community',          'developing',  'contested',  true],
    ['CON-CBDC', 'Central Bank Digital Currency', 'A digital form of sovereign currency issued by a central bank. Has potential to implement open payment rails directly, bypassing private banking infrastructure.',                                                              'mechanism',  'technical',     'Central banking research',     'developing',  'contested',  false],
    ['CON-LVT',  'Land Value Tax',              'A tax on the unimproved value of land (not structures), discouraging speculation while funding public goods. Proposed by Henry George; aligns incentives for productive land use and community investment.',                                 'mechanism',  'economic',      'Henry George (1879)',          'established', 'contested',  true],
    ['CON-DTAX', 'Data Dividend / Data Tax',    'Mechanisms to compensate individuals for the value of their data contributions to AI systems, or to tax extractive data collection to fund public goods. A form of latent value recognition for the digital economy.',                      'mechanism',  'economic',      'Jaron Lanier / Andrew Yang',  'developing',  'contested',  true],
    ['CON-TBKE', 'Timebank / Labor Hour Exchange', 'Community exchange systems where time is the currency — one hour of any service equals one credit. Surfaces and compensates latent value without markets, while building social infrastructure.',                                      'mechanism',  'social',        'Edgar Cahn / Time Dollars',   'developing',  'supported',  true],

    // Proposals — normative claims about what should be done
    ['CON-UBI',  'Universal Basic Income',      'An unconditional, regular cash payment to every adult citizen, regardless of work status, income, or behavior. The most discussed post-labor income proposal. Addresses Prosperity Layer 1.',                                                 'proposal',   'economic',      'Thomas Paine / Milton Friedman / many', 'canonical', 'contested', true],
    ['CON-UHC',  'Universal Healthcare',        'Healthcare as a universal right, funded collectively and available to all regardless of ability to pay or employment status. Part of Prosperity Layer 1 universals. Decouples healthcare from labor market participation.',                  'proposal',   'economic',      'Beveridge Report (1942)',      'canonical',   'supported',  true],
    ['CON-SWF',  'Sovereign Wealth Fund',       'A state-owned investment fund that returns dividends to citizens. Prosperity Layer 2 mechanism. Transforms common ownership of natural resources or public investments into universal income streams.',                                       'proposal',   'economic',      'Kuwait Investment Authority (1953)', 'established', 'supported', true],
    ['CON-RTAX', 'Robot Tax / Automation Tax',  'A tax on the deployment of automation to fund transition programs, UBI, or sovereign wealth funds. Theoretically aligns incentives by making the entity that displaces workers contribute to their support.',                               'proposal',   'economic',      'Bill Gates / IMF researchers', 'developing',  'contested',  true],
    ['CON-PRTB', 'Participatory Budgeting',     'A democratic process where community members directly decide how to allocate a portion of a public budget. Power Layer 4 mechanism. Proven in Porto Alegre (1989) and hundreds of cities since.',                                           'proposal',   'political',     'Porto Alegre, Brazil (1989)',  'established', 'supported',  true],
    ['CON-LIQ',  'Liquid Democracy',            'A hybrid of direct and representative democracy — citizens can vote directly or delegate their votes to trusted proxies who can further re-delegate. Power Layer 4 mechanism. More adaptive than fixed representation.',                    'proposal',   'political',     'Computer science / Delegative democracy', 'developing', 'contested', true],
    ['CON-BBND', 'Baby Bonds',                  'Universal endowment given to every newborn, invested and accessible at adulthood. Creates a universal foundation of private capital (Prosperity Layer 4) regardless of family wealth.',                                                     'proposal',   'economic',      'William Darity / Darrick Hamilton', 'developing', 'contested', true],

    // Critiques — challenges to existing ideas
    ['CON-ANTL', 'Anti-Laborism',               'The normative claim that laborism — the ideology that work is morally necessary — is wrong, harmful, and should be dismantled. The ideological foundation of the PLE movement.',                                                             'critique',   'philosophical', 'PLE Movement',                 'developing',  'contested',  true],
    ['CON-PCAP', 'Post-Capitalism',             'The claim that capitalism — with its structural dependence on wage labor and capital accumulation — cannot survive the post-labor transition and must be transformed, not simply reformed.',                                                 'critique',   'economic',      'Paul Mason / various',        'developing',  'contested',  false],
    ['CON-DGRO', 'Degrowth',                    'The proposal that wealthy economies should deliberately shrink rather than endlessly grow, prioritizing wellbeing over GDP. A critique of both capitalism and laborism that intersects with PLE without fully aligning.',                    'critique',   'ecological',    'Serge Latouche / Herman Daly', 'developing',  'contested',  false],

    // Syntheses — concepts that bridge traditions
    ['CON-LVNX', 'Latent Value Network',        'A synthetic framework for mapping, understanding, and surfacing the vast substrate of human value that markets fail to measure — care, knowledge commons, social infrastructure, ecological stewardship, creative culture, and civic participation.', 'synthesis', 'economic', 'Travis Sillio / Claude / PLE', 'embryonic', 'speculative', true],
    ['CON-SOEC', 'Solidarity Economy',          'An economic ecosystem grounded in cooperation, mutual aid, democratic governance, and social purpose — rather than competition, individualism, and profit. Includes cooperatives, credit unions, timebanks, mutual aid networks.',            'synthesis', 'economic',      'Latin American social movements', 'established', 'supported', true],
    ['CON-DNUT', 'Doughnut Economics',          'Kate Raworth\'s framework that replaces GDP growth as the goal with a "safe and just space for humanity" — above a social foundation, within ecological ceilings. Complements PLE by providing the ecological and wellbeing frame.',          'synthesis', 'ecological',    'Kate Raworth (2017)',          'established', 'supported',  false],
    ['CON-PLAT', 'Platform Cooperativism',      'The application of cooperative ownership models to digital platforms — apps, marketplaces, and networks owned by their workers and users rather than external investors. Combines digital scale with cooperative governance.',                'synthesis', 'technical',     'Trebor Scholz / Nathan Schneider', 'developing', 'supported', true]
  ];

  for (const [code, title, summary, concept_type, domain, origin_tradition, maturity, confidence, is_core_ple] of concepts_data) {
    await sql`INSERT INTO concepts (code, title, summary, concept_type, domain, origin_tradition, maturity, confidence, is_core_ple)
              VALUES (${code}, ${title}, ${summary}, ${concept_type}, ${domain}, ${origin_tradition}, ${maturity}, ${confidence}, ${is_core_ple})
              ON CONFLICT (code) DO NOTHING`;
  }

  // ── TENSIONS ──
  const tensions_data = [
    ['TEN-001', 'UBI Conditionality vs. Unconditional Dignity', 
     'If UBI becomes the foundation of income, will society develop informal expectations that recipients should contribute to the Latent Value Network — effectively re-conditioning what was supposed to be unconditional? This undermines the rights-basis of UBI.',
     'normative', 'fundamental'],
    ['TEN-002', 'Automation Speed vs. Institutional Adaptation Capacity',
     'Automation may displace workers faster than institutions can adapt — creating a gap where old systems have broken down but new systems are not yet operational. This is the most dangerous transition risk.',
     'empirical', 'fundamental'],
    ['TEN-003', 'Data Dividends vs. Surveillance Architecture',
     'Compensating people for data contribution requires measuring what they contribute — which requires surveillance of intimate behaviors. Any LVN or data dividend mechanism risks creating a measurement apparatus that is more dangerous than the problem it solves.',
     'normative', 'fundamental'],
    ['TEN-004', 'Collective Ownership vs. Individual Liberty',
     'Expanding cooperatives, commons, and collective governance inevitably constrains individual property rights and economic autonomy. How much collective governance is compatible with a free society?',
     'normative', 'significant'],
    ['TEN-005', 'Ecological Value vs. Human Network Framing',
     'The LVN uses a "network" metaphor that implies human agency and relationship. But ecological value (clean air, biodiversity) is produced by nature, not human actors. Does including it stretch the concept beyond coherence?',
     'empirical', 'significant'],
    ['TEN-006', 'Global Solutions vs. Nation-State Sovereignty',
     'Post-labor economics requires global coordination (GATO, cross-border wealth redistribution, AI governance) that nation-states are constitutionally and politically unable to deliver. The scale of the problem exceeds the authority of existing institutions.',
     'political', 'fundamental'],
    ['TEN-007', 'Laborism as Identity vs. Liberation from Obligation',
     'Many people find genuine meaning and identity in their work. Dismantling laborism as an ideology risks delegitimizing authentic vocational identity, not just coerced labor. How do we liberate without erasing?',
     'normative', 'significant'],
    ['TEN-008', 'Robot Tax Revenue vs. Innovation Incentives',
     'Taxing automation raises revenue for transition programs but may slow the automation that (eventually) creates post-labor abundance. The optimal timing and rate is deeply contested.',
     'empirical', 'significant']
  ];

  for (const [code, title, description, tension_type, severity] of tensions_data) {
    await sql`INSERT INTO tensions (code, title, description, tension_type, severity)
              VALUES (${code}, ${title}, ${description}, ${tension_type}, ${severity})
              ON CONFLICT (code) DO NOTHING`;
  }

  // ── EVIDENCE SOURCES ──
  const evidence_data = [
    ['EV-001', 'Alaska Permanent Fund Dividend',         'Annual dividend paid to all Alaska residents from oil revenues invested in the Alaska Permanent Fund. ~$1,000-2,000/year since 1982. The most successful real-world model of Prosperity Layer 2.',     'case_study', 'longitudinal', 'Alaska, USA',          '1982–present'],
    ['EV-002', 'Finland UBI Experiment (2017-2018)',      'Government-run randomized controlled trial giving 2,000 unemployed Finns €560/month unconditionally for 2 years. Found improved wellbeing, trust, and slight employment increases vs. control group.', 'case_study', 'longitudinal', 'Finland',              '2017-2018'],
    ['EV-003', 'Mondragon Corporation',                  'A federation of 80+ worker cooperatives employing ~80,000 people in the Basque Country. The most scaled cooperative enterprise in the world. Demonstrates Prosperity Layer 3 at industrial scale.',        'case_study', 'longitudinal', 'Basque Country, Spain', '1956–present'],
    ['EV-004', 'Kenya GiveDirectly Cash Transfer Study', 'Long-running randomized controlled trial of unconditional cash transfers in rural Kenya. Found sustained positive effects on consumption, assets, and psychological wellbeing with no evidence of harmful spending.', 'research', 'longitudinal', 'Kenya', '2011–present'],
    ['EV-005', 'Porto Alegre Participatory Budgeting',   'Pioneering implementation of participatory budgeting in Porto Alegre, Brazil from 1989. Citizens directly allocated portions of the city budget. Dramatically improved infrastructure in poorer neighborhoods.', 'case_study', 'longitudinal', 'Porto Alegre, Brazil', '1989–2004'],
    ['EV-006', 'Stockton SEED Guaranteed Income Pilot', 'Stockton, California provided $500/month to 125 low-income residents for 24 months. Found full-time employment increased, mental health improved, and recipients invested in education and family.',           'case_study', 'pilot', 'Stockton, California',   '2019-2021'],
    ['EV-007', 'Wikipedia Knowledge Commons',            'Wikipedia represents the largest knowledge commons in history — millions of volunteer contributors maintaining 60+ million articles in 300+ languages. Demonstrates that non-market contribution can sustain public goods at massive scale.', 'case_study', 'longitudinal', 'Global', '2001–present'],
    ['EV-008', 'India UPI Payment Rail',                 'India\'s Unified Payments Interface processed $1.7 trillion in transactions in 2023 — open, interoperable, real-time payment infrastructure that brought financial access to hundreds of millions of previously excluded people.', 'case_study', 'longitudinal', 'India', '2016–present'],
    ['EV-009', 'Piketty r > g Analysis',                 'Thomas Piketty\'s analysis in Capital in the 21st Century (2013) demonstrating that returns on capital (r) historically exceed economic growth (g), leading to increasing wealth concentration unless corrected by policy.', 'research', 'meta_analysis', 'Global (historical)', '1700–2012']
  ];

  for (const [code, title, description, evidence_type, quality, location, time_period] of evidence_data) {
    await sql`INSERT INTO evidence_sources (code, title, description, evidence_type, quality, location, time_period)
              VALUES (${code}, ${title}, ${description}, ${evidence_type}, ${quality}, ${location}, ${time_period})
              ON CONFLICT (code) DO NOTHING`;
  }

  // ── INTELLECTUAL SOURCES ──
  const intel_sources = [
    ['IS-001', 'Kate Raworth',      'Ecological / Feminist Economics', '{\'Doughnut Economics (2017)\'}',   'draws_on',   'Provides ecological ceiling and social foundation framework that complements PLE\'s income architecture'],
    ['IS-002', 'Nancy Folbre',      'Feminist Economics',              '{\'The Invisible Heart (2001)\',\'Who Pays for the Kids?\'}', 'draws_on', 'Foundational analysis of the care economy and unpaid labor — direct intellectual ancestor of LVN'],
    ['IS-003', 'Elinor Ostrom',     'Institutional Economics',         '{\'Governing the Commons (1990)\'}', 'draws_on',   'Nobel-winning work on commons governance provides the institutional design vocabulary for Prosperity Layer 2-3'],
    ['IS-004', 'Guy Standing',      'Labour Economics',                '{\'The Precariat (2011)\',\'A Precariat Charter (2014)\'}', 'draws_on', 'Analysis of the precariat as a new class provides sociological grounding for the transition period'],
    ['IS-005', 'Thomas Piketty',    'Economic History',                '{\'Capital in the 21st Century (2013)\'}', 'draws_on', 'Empirical analysis of wealth concentration and r > g dynamic provides the distributional problem PLE addresses'],
    ['IS-006', 'Milton Friedman',   'Neoliberal Economics',            '{\'Capitalism and Freedom (1962)\'}', 'draws_on',   'Friedman\'s negative income tax proposal is an early, right-leaning precursor to UBI — demonstrates cross-spectrum appeal'],
    ['IS-007', 'Karl Marx',         'Political Economy',               '{\'Capital (1867)\',\'Grundrisse\'}', 'responds_to', 'Labor theory of value and alienation analysis are foundational — PLE accepts the critique of labor under capitalism while proposing liberation rather than worker control'],
    ['IS-008', 'Friedrich Hayek',   'Austrian Economics',              '{\'The Use of Knowledge in Society (1945)\',\'Road to Serfdom\'}', 'responds_to', 'Price mechanism and epistemic humility arguments inform PLE\'s respect for market mechanisms while critiquing their systematic gaps'],
    ['IS-009', 'Ivan Illich',       'Social Criticism',                '{\'Tools for Conviviality (1973)\',\'Shadow Work (1981)\'}', 'draws_on', 'Illich\'s concept of shadow work (unpaid labor that supports industrial production) is a direct precursor to LVN'],
    ['IS-010', 'Marcel Mauss',      'Anthropology',                    '{\'The Gift (1925)\'}', 'draws_on', 'Gift economy analysis provides the non-market exchange framework underlying LVN and solidarity economy thinking'],
    ['IS-011', 'Jaron Lanier',      'Digital Economy',                 '{\'Who Owns the Future? (2013)\'}', 'draws_on', 'Data valuation and micropayment proposals are early LVN-adjacent thinking for the digital domain'],
    ['IS-012', 'Trebor Scholz',     'Platform Studies',                '{\'Platform Cooperativism (2016)\'}', 'draws_on', 'Platform cooperativism framework provides institutional design for digital-era collective ownership (Prosperity Layer 3)']
  ];

  for (const [code, name, tradition, key_works_str, relationship_to_ple, notes] of intel_sources) {
    const key_works = key_works_str.replace(/^\{|\}$/g, '').split("','").map(s => s.replace(/^'|'$/g, ''));
    await sql`INSERT INTO intellectual_sources (code, name, tradition, key_works, relationship_to_ple, notes)
              VALUES (${code}, ${name}, ${tradition}, ${key_works}, ${relationship_to_ple}, ${notes})
              ON CONFLICT (code) DO NOTHING`;
  }

  // ── ACTOR TYPES ──
  const actor_types_data = [
    ['ACT-IND',  'Individual Person',         'The person navigating post-labor life — a rights-holder, potential contributor to LVN, consumer, investor, and citizen.', false, 'Primary beneficiary of post-labor systems; contributor to care, knowledge commons, and civic life'],
    ['ACT-HH',   'Household',                 'The unit of care, reproduction, and mutual support. Often invisible to economic analysis as a production unit despite being foundational.', false, 'Recognized as a primary site of latent value production in post-labor frameworks'],
    ['ACT-COOP', 'Cooperative',               'Worker/consumer/community-owned enterprise. Distributes returns to members rather than external capital.', true, 'Core organizational form of Prosperity Layer 3; scales cooperative ownership'],
    ['ACT-CORP', 'Corporation',               'Capital-owning, profit-maximizing firm. The dominant organizational form of industrial capitalism.', true, 'Must transform or be supplemented; responsible for automation; potential subject of robot taxation'],
    ['ACT-STATE', 'Nation-State Government',  'National or regional government with coercive power, tax authority, and policy capacity.', true, 'Primary implementation vehicle for UBI, SWFs, open payment rails, and participatory democracy'],
    ['ACT-INTL', 'International Institution', 'Supranational body (WTO, IMF, EU, UN) with limited sovereignty and coordination function.', true, 'Must be redesigned or supplemented for GATO-scale AI and automation governance'],
    ['ACT-AI',   'AI System',                 'An automated agent performing cognitive, productive, or coordination functions previously performed by humans.', true, 'The primary economic actor of the post-labor economy; governance of AI systems is the central political challenge'],
    ['ACT-CMN',  'Commons',                   'A collectively governed resource — open source codebase, watershed, fishery, knowledge base, community land trust.', true, 'The organizational form for Prosperity Layer 2 public assets and LVN infrastructure']
  ];

  for (const [code, title, description, is_collective, post_labor_role] of actor_types_data) {
    await sql`INSERT INTO actor_types (code, title, description, is_collective, post_labor_role)
              VALUES (${code}, ${title}, ${description}, ${is_collective}, ${post_labor_role})
              ON CONFLICT (code) DO NOTHING`;
  }

  console.log('✅ v2.0 PLE metamodel seeded');
}

async function seedArchitecture() {
  // Check if already seeded
  const existing = await sql`SELECT COUNT(*) as count FROM architecture_elements`;
  if (existing[0]?.count > 0) return;

  // Seed goals
  const goals = [
    ['goal', 'GOAL-001', 'Universal Basic Income', 'Establish economic security through unconditional basic income for all citizens', 'active'],
    ['goal', 'GOAL-002', 'Data Ownership Rights', 'Ensure individuals own and control their personal data with fair compensation', 'active'],
    ['goal', 'GOAL-003', 'Automation Taxation', 'Implement fair taxation on automated labor to fund social programs', 'active'],
    ['goal', 'GOAL-004', 'Worker Transition Support', 'Provide comprehensive support for workers displaced by automation', 'active'],
    ['goal', 'GOAL-005', 'Democratic Economic Governance', 'Enable democratic participation in economic policy decisions', 'active'],
    ['goal', 'GOAL-006', 'Evidence-Based Policy', 'Ground all proposals in rigorous research and empirical evidence', 'active'],
    ['goal', 'GOAL-007', 'Public Awareness', 'Build broad public understanding of post-labor economics concepts', 'active'],
    ['goal', 'GOAL-008', 'Coalition Building', 'Unite diverse stakeholders around shared prosperity goals', 'active'],
    ['goal', 'GOAL-009', 'Institutional Reform', 'Transform institutions to support post-labor economic models', 'active']
  ];

  for (const [type, code, title, desc, status] of goals) {
    await sql`INSERT INTO architecture_elements (element_type, code, title, description, status) 
              VALUES (${type}, ${code}, ${title}, ${desc}, ${status}) ON CONFLICT (code) DO NOTHING`;
  }

  // Seed strategies
  const strategies = [
    ['strategy', 'STRAT-001', 'Research & Analysis', 'Conduct and synthesize research on post-labor economics', 'active'],
    ['strategy', 'STRAT-002', 'Public Education', 'Educate the public through content, events, and media', 'active'],
    ['strategy', 'STRAT-003', 'Policy Development', 'Develop concrete policy proposals and frameworks', 'active'],
    ['strategy', 'STRAT-004', 'Community Building', 'Build engaged communities of practitioners and advocates', 'active'],
    ['strategy', 'STRAT-005', 'Pilot Programs', 'Design and support pilot implementations', 'active'],
    ['strategy', 'STRAT-006', 'Stakeholder Engagement', 'Engage policymakers, businesses, and civil society', 'active']
  ];

  for (const [type, code, title, desc, status] of strategies) {
    await sql`INSERT INTO architecture_elements (element_type, code, title, description, status) 
              VALUES (${type}, ${code}, ${title}, ${desc}, ${status}) ON CONFLICT (code) DO NOTHING`;
  }

  // Seed capabilities
  const capabilities = [
    ['capability', 'CAP-001', 'Policy Analysis', 'Analyze existing and proposed economic policies', 'active'],
    ['capability', 'CAP-002', 'Research Synthesis', 'Synthesize academic research into actionable insights', 'active'],
    ['capability', 'CAP-003', 'Advocacy & Outreach', 'Advocate for post-labor policies to decision makers', 'active'],
    ['capability', 'CAP-004', 'Content Production', 'Create articles, videos, podcasts, and educational materials', 'active'],
    ['capability', 'CAP-005', 'Community Facilitation', 'Facilitate discussions and working groups', 'active'],
    ['capability', 'CAP-006', 'Event Management', 'Organize webinars, conferences, and community events', 'active'],
    ['capability', 'CAP-007', 'Data Analysis', 'Analyze economic data and model scenarios', 'active'],
    ['capability', 'CAP-008', 'Partnership Development', 'Build partnerships with aligned organizations', 'active']
  ];

  for (const [type, code, title, desc, status] of capabilities) {
    await sql`INSERT INTO architecture_elements (element_type, code, title, description, status) 
              VALUES (${type}, ${code}, ${title}, ${desc}, ${status}) ON CONFLICT (code) DO NOTHING`;
  }

  // Seed principles
  const principles = [
    ['principle', 'PRIN-001', 'Human Dignity First', 'All policies must prioritize human dignity and wellbeing', 'active'],
    ['principle', 'PRIN-002', 'Evidence-Based Approach', 'Decisions grounded in research and empirical evidence', 'active'],
    ['principle', 'PRIN-003', 'Inclusive Participation', 'Ensure diverse voices in all decision-making processes', 'active'],
    ['principle', 'PRIN-004', 'Transparency', 'Operate with full transparency in governance and finances', 'active'],
    ['principle', 'PRIN-005', 'Open Source First', 'Prefer open source tools and open knowledge sharing', 'active'],
    ['principle', 'PRIN-006', 'Pragmatic Idealism', 'Balance ambitious vision with practical implementation', 'active'],
    ['principle', 'PRIN-007', 'Federated Governance', 'Distribute power across community working groups', 'active'],
    ['principle', 'PRIN-008', 'Continuous Learning', 'Embrace iteration and learning from failures', 'active'],
    ['principle', 'PRIN-009', 'Solidarity Economy', 'Model the economic principles we advocate', 'active'],
    ['principle', 'PRIN-010', 'Long-term Thinking', 'Plan for generational impact, not quick wins', 'active']
  ];

  for (const [type, code, title, desc, status] of principles) {
    await sql`INSERT INTO architecture_elements (element_type, code, title, description, status) 
              VALUES (${type}, ${code}, ${title}, ${desc}, ${status}) ON CONFLICT (code) DO NOTHING`;
  }
}

/**
 * Get database query function (with auto-init)
 */
export async function getDb() {
  await ensureDatabase();
  return sql;
}

/**
 * Helper to hash tokens
 */
export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get current user from request
 */
export async function getCurrentUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  const token = authHeader.slice(7);
  const tokenHash = await hashToken(token);
  const db = await getDb();
  
  const sessions = await db`
    SELECT u.id, u.email, u.display_name, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = true
  `;
  
  return sessions.length > 0 ? sessions[0] : null;
}

/**
 * Log activity
 */
export async function logActivity(userId, action, entityType, entityId, details = {}) {
  try {
    const db = await getDb();
    const detailsJson = JSON.stringify(details);
    await db`INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) 
             VALUES (${userId}, ${action}, ${entityType}, ${entityId}, ${detailsJson})`;
  } catch (e) {
    console.error('Failed to log activity:', e);
  }
}

/**
 * JSON response helper
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export { sql };
