// netlify/functions/db-proxy.js 

// Keeps secure user_id injection in the body

const fs = require('fs');
const path = require('path');

const tryLoadLocalSecrets = () => {
  try {
    const p = path.join(__dirname, 'supabase.secrets.json');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const j = JSON.parse(raw);
      return {
        url: j.SUPABASE_URL || j.url || null,
        key: j.SUPABASE_KEY || j.key || null
      };
    }
  } catch (e) {}
  return { url: null, key: null };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated - no token provided' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    let authenticatedUserId;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      authenticatedUserId = payload.sub;
    } catch (e) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    if (!authenticatedUserId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No user ID in token' })
      };
    }

    const { method, endpoint, body } = JSON.parse(event.body || '{}');

    // FIX: Do NOT rewrite or add filters to the endpoint.
    const safeEndpoint = endpoint;

    // Keep secure user_id injection in the body only
    let safeBody = body;
    if (body && (method === 'POST' || method === 'PATCH')) {
      safeBody = { ...body, user_id: authenticatedUserId };
    }

    // Load secrets
    let SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL_PUBLIC || null;
    let SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;

    if (!SUPABASE_URL) SUPABASE_URL = process.env.SUPABASE_URL_VALUE || null;
    if (!SUPABASE_KEY) SUPABASE_KEY = process.env.SUPABASE_KEY_VALUE || null;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      const local = tryLoadLocalSecrets();
      SUPABASE_URL = SUPABASE_URL || local.url;
      SUPABASE_KEY = SUPABASE_KEY || local.key;
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'server_configuration_missing',
          message: 'Supabase configuration missing.'
        })
      };
    }

    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}`;

    const res = await fetch(url, {
      method: method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: safeBody ? JSON.stringify(safeBody) : undefined
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'function_error', message: error.message })
    };
  }
};
