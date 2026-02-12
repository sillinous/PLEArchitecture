import { getDb, hashToken, logActivity, jsonResponse } from './lib/db.mjs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export default async (req, context) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const sql = await getDb();
    
    if (req.method === 'POST') {
      const body = await req.json();
      
      if (action === 'register') {
        return await handleRegister(sql, body);
      } else if (action === 'login') {
        return await handleLogin(sql, body);
      } else if (action === 'logout') {
        return await handleLogout(sql, req);
      }
    } else if (req.method === 'GET' && action === 'me') {
      return await handleGetCurrentUser(sql, req);
    }
    
    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Auth error:', error);
    // Include error details in response for debugging
    return jsonResponse({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    }, 500);
  }
};

async function handleRegister(sql, { email, password, displayName }) {
  if (!email || !password || !displayName) {
    return jsonResponse({ error: 'Email, password, and display name are required' }, 400);
  }
  
  if (password.length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  }
  
  const existing = await sql('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.length > 0) {
    return jsonResponse({ error: 'Email already registered' }, 409);
  }
  
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  
  await sql(
    `INSERT INTO users (id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)`,
    [userId, email.toLowerCase(), passwordHash, displayName, 'member']
  );
  
  const session = await createSession(sql, userId);
  await logActivity(userId, 'user_registered', 'user', userId);
  
  return jsonResponse({
    success: true,
    user: { id: userId, email: email.toLowerCase(), displayName, role: 'member' },
    token: session.token
  }, 201);
}

async function handleLogin(sql, { email, password }) {
  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required' }, 400);
  }
  
  const users = await sql(
    'SELECT id, email, password_hash, display_name, role, is_active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  
  if (users.length === 0) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }
  
  const user = users[0];
  
  if (!user.is_active) {
    return jsonResponse({ error: 'Account is deactivated' }, 403);
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }
  
  await sql('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
  
  const session = await createSession(sql, user.id);
  await logActivity(user.id, 'user_login', 'user', user.id);
  
  return jsonResponse({
    success: true,
    user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    token: session.token
  });
}

async function handleLogout(sql, req) {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const tokenHash = await hashToken(token);
    await sql('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }
  return jsonResponse({ success: true });
}

async function handleGetCurrentUser(sql, req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }
  
  const token = authHeader.slice(7);
  const tokenHash = await hashToken(token);
  
  const sessions = await sql(`
    SELECT u.id, u.email, u.display_name, u.role, u.avatar_url, u.bio, u.created_at
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = true
  `, [tokenHash]);
  
  if (sessions.length === 0) {
    return jsonResponse({ error: 'Session expired or invalid' }, 401);
  }
  
  const user = sessions[0];
  return jsonResponse({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      createdAt: user.created_at
    }
  });
}

async function createSession(sql, userId) {
  const token = uuidv4() + '-' + uuidv4();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  await sql(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );
  
  return { token, expiresAt };
}

export const config = { path: '/api/auth' };
