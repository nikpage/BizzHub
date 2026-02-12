// functions/db-proxy.js
// Robust Cloudflare function proxy to Supabase

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // SECURITY: Verify user is authenticated via Netlify Identity (or compatible JWT)
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Not authenticated - no token provided' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    let authenticatedUserId;

    try {
      // JWT DECODING (Web Standard replacement for Buffer)
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      authenticatedUserId = payload.sub;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'No user ID in token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const bodyText = await request.text();
    const { method, endpoint, body } = JSON.parse(bodyText || '{}');

    // SECURITY: Force all requests to use the authenticated user's ID
    let safeEndpoint = endpoint;

    // Replace any user_id in the endpoint with the authenticated user's ID
    if (safeEndpoint.includes('user_id=')) {
      safeEndpoint = safeEndpoint.replace(/user_id=eq\.[^&]+/g, `user_id=eq.${authenticatedUserId}`);
    } else {
      // Add user_id filter if not present
      safeEndpoint += (safeEndpoint.includes('?') ? '&' : '?') + `user_id=eq.${authenticatedUserId}`;
    }

    // SECURITY: Force user_id in POST/PATCH body
    let safeBody = body;
    if (body && (method === 'POST' || method === 'PATCH')) {
      safeBody = { ...body, user_id: authenticatedUserId };
    }

    // Try primary env names first
    let SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL_PUBLIC || null;
    let SUPABASE_KEY = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || null;

    // Try alternate envs
    if (!SUPABASE_URL) SUPABASE_URL = env.SUPABASE_URL_VALUE || null;
    if (!SUPABASE_KEY) SUPABASE_KEY = env.SUPABASE_KEY_VALUE || null;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(JSON.stringify({
        error: 'server_configuration_missing',
        message: 'Supabase configuration not available in function runtime.'
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
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

    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'function_error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
