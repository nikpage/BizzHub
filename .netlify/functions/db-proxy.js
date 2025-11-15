// netlify/functions/db-proxy.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Helper to load local Supabase secrets for testing
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
  } catch (e) { /* ignore */ }
  return { url: null, key: null };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // SECURITY: Verify user is authenticated via Netlify Identity JWT
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

    // JWT DECODING (Security Critical)
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

    // Get parameters from client-side POST body
    const { endpoint, method, body } = JSON.parse(event.body);

    if (!endpoint || !method) {
        return { statusCode: 400, body: 'Missing endpoint or method in request body.' };
    }

    // SANITIZATION AND USER SCOPING
    const safeEndpoint = endpoint.split('?')[0]; // only allow table name

    // Get Supabase config
    let SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;

    if (process.env.NODE_ENV !== 'production') {
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
          message: 'Supabase configuration not available in function runtime.'
        })
      };
    }

    // CRITICAL: Construct the full URL, including user ID enforcement.
    let fullUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}`;

    // For all operations, enforce the user ID in the query string.
    const queryDelimiter = fullUrl.includes('?') ? '&' : '?';

    // Add explicit user ID filter
    fullUrl += `${queryDelimiter}user_id=eq.${authenticatedUserId}`;

    // Preserve existing query parameters from the client (e.g., &select=*)
    if (endpoint.includes('?')) {
      const existingQuery = endpoint.split('?')[1].split('&').filter(p => !p.startsWith('user_id=')).join('&');
      if(existingQuery) fullUrl += `&${existingQuery}`;
    }


    const res = await fetch(fullUrl, {
      method: method, // Use the intended Supabase method (GET, POST, PATCH, DELETE)
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' // For POST/PATCH/PUT/DELETE
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: data
    };
  } catch (error) {
    console.error('Proxy Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
