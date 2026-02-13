// Netlify function proxy to Supabase
export async function handler(event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    const token = authHeader.replace('Bearer ', '');

    // JWT DECODING: Extract user ID from token payload
    let authenticatedUserId;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      authenticatedUserId = payload.sub;
    } catch (e) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    if (!authenticatedUserId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No user ID in token' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { method, endpoint, body: payload } = body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Supabase config missing' }) };
    }

    // SECURITY: Force user_id filter using decoded JWT sub claim
    let safeEndpoint = endpoint;
    if (safeEndpoint.includes('user_id=')) {
      safeEndpoint = safeEndpoint.replace(/user_id=eq\.[^&]+/g, `user_id=eq.${authenticatedUserId}`);
    } else {
      safeEndpoint += (safeEndpoint.includes('?') ? '&' : '?') + `user_id=eq.${authenticatedUserId}`;
    }

    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}`, {
      method: method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: payload && (method === 'POST' || method === 'PATCH') ? JSON.stringify({ ...payload, user_id: authenticatedUserId }) : undefined
    });

    const data = await res.text();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: data
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'function_error', message: err.message }) };
  }
}
