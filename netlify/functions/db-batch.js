// functions/db-batch.js
// Batch multiple Supabase requests into one function call (Cloudflare Pages version)

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // SECURITY: Verify authentication
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    let authenticatedUserId;

    try {
      // JWT DECODING (Web Standard replacement for Buffer)
      // Base64Url to Base64
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      // Decode
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

    // Get Supabase config from Env
    const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(JSON.stringify({ error: 'server_configuration_missing' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const bodyText = await request.text();
    const { requests } = JSON.parse(bodyText || '{}');

    if (!Array.isArray(requests)) {
      return new Response(JSON.stringify({ error: 'requests must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Execute all requests in parallel
    const results = await Promise.all(
      requests.map(async (req) => {
        const { key, endpoint } = req;

        // SECURITY: Force user_id filter
        let safeEndpoint = endpoint;
        if (safeEndpoint.includes('user_id=')) {
          safeEndpoint = safeEndpoint.replace(/user_id=eq\.[^&]+/g, `user_id=eq.${authenticatedUserId}`);
        } else {
          safeEndpoint += (safeEndpoint.includes('?') ? '&' : '?') + `user_id=eq.${authenticatedUserId}`;
        }

        const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${safeEndpoint}`;

        try {
          const res = await fetch(url, {
            method: 'GET',
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
        // Business should be a single object, not array
        response[result.key] = result.key === 'business' ? result.data[0] : result.data;
      }
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'function_error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
