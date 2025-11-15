// netlify/functions/db-batch.js
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
    // SECURITY: Verify authentication
    const authHeader = event.headers?.authorization || event.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' })
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

    const requests = JSON.parse(event.body);

    const results = await Promise.all(
      Object.keys(requests).map(async (key) => {
        let fullEndpoint = requests[key];
        let safeEndpoint = fullEndpoint.split('?')[0]; // only allow table name

        // CRITICAL: Enforce user scoping on the query string.
        let queryParams = fullEndpoint.includes('?') ? fullEndpoint.split('?')[1] : '';

        // Remove existing user_id if present to replace it with the authenticated ID
        queryParams = queryParams.split('&').filter(p => !p.startsWith('user_id=')).join('&');

        let fullQuery = `user_id=eq.${authenticatedUserId}`;
        if (queryParams) fullQuery += `&${queryParams}`;

        const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}?${fullQuery}`;

        try {
          const res = await fetch(url, {
            method: 'GET', // Batch requests are always GET
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          });

          const data = await res.json();
          return { key, data, status: res.status };
        } catch (error) {
          return { key, error: error.message, status: 500 };
        }
      })
    );

    // Convert array to object keyed by request key
    const response = {};
    results.forEach(result => {
      if (result.status === 200) {
        // The business profile should be a single object, not an array
        response[result.key] = (result.key === 'business' && Array.isArray(result.data)) ? result.data[0] : result.data;
      } else {
         console.warn(`Batch request for key ${result.key} failed with status ${result.status}`);
         response[result.key] = null;
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Batch Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
