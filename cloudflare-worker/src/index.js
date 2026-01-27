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
// Census lookup endpoint
if (url.pathname === '/census-lookup') {
  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': 'https://theweatherspectrum.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { lat, lon } = await request.json();

    // Step 1: Get ZIP from Census geocoding
    const geoResponse = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`
    );
    const geoData = await geoResponse.json();

    let zipCode = 'Unknown';
    let population = 0;

    if (geoData.result?.geographies?.['2020 Census Blocks']?.[0]) {
      const block = geoData.result.geographies['2020 Census Blocks'][0];
      zipCode = block.ZCTA5 || 'Unknown';

      // Step 2: Get population for ZIP
      if (zipCode !== 'Unknown') {
        const popResponse = await fetch(
          `https://api.census.gov/data/2020/dec/pl?get=P1_001N,NAME&for=zip%20code%20tabulation%20area:${zipCode}&key=${env.CENSUS_API_KEY}`
        );
        const popData = await popResponse.json();

        if (popData && popData.length > 1) {
          const zipPopulation = parseInt(popData[1][0]);
          // 30% of ZIP population in 5-mile radius
          population = Math.round(zipPopulation * 0.3);
        }
      }
    }

    return new Response(
      JSON.stringify({
        zip: zipCode,
        population: population || 7383,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://theweatherspectrum.com',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://theweatherspectrum.com',
        },
      }
    );
  }
}
    return new Response('Not found', { status: 404 });
  },
};