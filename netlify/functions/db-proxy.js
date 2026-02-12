// Netlify function proxy to Supabase
export async function handler(event, context) {
  try {
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    const token = authHeader.replace('Bearer ', '');
    const body = JSON.parse(event.body || '{}');
    const { method, endpoint, body: payload } = body;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Supabase config missing' }) };
    }

    // Force user_id filter if included in endpoint
    let safeEndpoint = endpoint;
    if (safeEndpoint.includes('user_id=')) {
      safeEndpoint = safeEndpoint.replace(/user_id=eq\.[^&]+/g, `user_id=eq.${token}`);
    } else {
      safeEndpoint += (safeEndpoint.includes('?') ? '&' : '?') + `user_id=eq.${token}`;
    }

    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}`, {
      method: method || 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: payload && (method === 'POST' || method === 'PATCH') ? JSON.stringify({ ...payload, user_id: token }) : undefined
    });

    const data = await res.text();
    return { statusCode: res.status, body: data };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'function_error', message: err.message }) };
  }
}
