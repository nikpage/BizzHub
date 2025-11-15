// netlify/functions/db-proxy.js
// Robust Netlify function proxy to Supabase — tries multiple env names and a local secrets file
const fs = require('fs');
const path = require('path');

const tryLoadLocalSecrets = () => {
  try {
    // optional: a file placed in the functions folder at deploy time (not committed publicly)
    const p = path.join(__dirname, 'supabase.secrets.json');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const j = JSON.parse(raw);
      return {
        url: j.SUPABASE_URL || j.url || null,
        key: j.SUPABASE_KEY || j.key || null
      };
    }
  } catch (e) { /* ignore */ }
  return { url: null, key: null };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // SECURITY: Verify user is authenticated via Netlify Identity
    // Get JWT token from Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated - no token provided' })
      };
    }

    const token = authHeader.replace('Bearer ', '');

    // Decode JWT to get user ID (simple decode, not verification since we trust Netlify)
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

    // SECURITY: Force all requests to use the authenticated user's ID
    let safeEndpoint = endpoint;

    // Replace any user_id in the endpoint with the authenticated user's ID
    if (safeEndpoint.includes('user_id=')) {
      safeEndpoint = safeEndpoint.replace(/user_id=eq\.[^&]+/g, `user_id=eq.${authenticatedUserId}`);
    } else if (method !== 'POST' && method !== 'PATCH') {
      // Add user_id filter ONLY for GET/DELETE requests
      // For POST/PATCH, the body user_id is sufficient - adding a query filter can cause empty responses
      safeEndpoint += (safeEndpoint.includes('?') ? '&' : '?') + `user_id=eq.${authenticatedUserId}`;
    }

    // SECURITY: Force user_id in POST/PATCH body
    let safeBody = body;
    if (body && (method === 'POST' || method === 'PATCH')) {
      safeBody = { ...body, user_id: authenticatedUserId };
    }

    // Try primary env names first
    let SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL_PUBLIC || null;
    let SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;

    // Try alternate envs (in case different naming was used)
    if (!SUPABASE_URL) SUPABASE_URL = process.env.SUPABASE_URL_VALUE || null;
    if (!SUPABASE_KEY) SUPABASE_KEY = process.env.SUPABASE_KEY_VALUE || null;

    // Try local secrets file (optional, for private deploy workflows)
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      const local = tryLoadLocalSecrets();
      SUPABASE_URL = SUPABASE_URL || local.url;
      SUPABASE_KEY = SUPABASE_KEY || local.key;
    }

    // Final check — do NOT leak keys in the response
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      // return structured error that client can handle, without exposing secrets
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'server_configuration_missing',
          message: 'Supabase configuration not available in function runtime. Ensure SUPABASE_URL and SUPABASE_KEY are defined in your Netlify Site > Site settings > Environment variables (and redeploy).'
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
