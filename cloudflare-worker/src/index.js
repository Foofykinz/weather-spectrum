export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Endpoint: /send-notification
    if (url.pathname === '/send-notification') {
      try {
        const body = await request.json();
        const { title, message, url: notificationUrl, segments } = body;

        // Validate required fields
        if (!title || !message) {
          return new Response(
            JSON.stringify({ error: 'Title and message are required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Send notification via OneSignal
        const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${env.ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: env.ONESIGNAL_APP_ID,
            headings: { en: title },
            contents: { en: message },
            url: notificationUrl || 'https://theweatherspectrum.com',
            included_segments: segments || ['Subscribed Users'],
          }),
        });

        const result = await oneSignalResponse.json();

        return new Response(JSON.stringify(result), {
          status: oneSignalResponse.ok ? 200 : 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            } 
          }
        );
      }
    }

    return new Response('Not found', { status: 404 });
  },
};