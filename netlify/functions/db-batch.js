// functions/db-batch.js
// Batch multiple Supabase requests into one function call (Netlify Functions version)

export async function handler(event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // SECURITY: Verify authentication
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    let authenticatedUserId;

    try {
      // JWT DECODING: Extract user ID from token payload
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

    // Get Supabase config from environment
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'server_configuration_missing' })
      };
    }

    const { requests } = JSON.parse(event.body || '{}');

    if (!Array.isArray(requests)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'requests must be an array' })
      };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'function_error', message: error.message })
    };
  }
}
