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
// Census lookup endpoint
if (url.pathname === '/census-lookup') {
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

    let zipCode = 'Unknown';
    let population = 0;

    // Step 1: Get ZIP from OpenStreetMap Nominatim (reliable for ZIP codes)
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'WeatherSpectrum/1.0 (theweatherspectrum.com)'
        }
      }
    );
    const nominatimData = await nominatimResponse.json();
    
    if (nominatimData.address?.postcode) {
      // Extract 5-digit ZIP (sometimes comes as "12345-6789")
      zipCode = nominatimData.address.postcode.split('-')[0];
    }

    // Step 2: Get ACCURATE population from Census API using the ZIP
    if (zipCode !== 'Unknown' && zipCode.length === 5) {
      try {
        const popUrl = `https://api.census.gov/data/2020/dec/pl?get=P1_001N,NAME&for=zip%20code%20tabulation%20area:${zipCode}&key=${env.CENSUS_API_KEY}`;
        const popResponse = await fetch(popUrl);
        const popData = await popResponse.json();

        if (popData && popData.length > 1 && popData[1][0]) {
          const zipPopulation = parseInt(popData[1][0]);
          // 30% of ZIP population in 5-mile radius
          population = Math.round(zipPopulation * 0.3);
        }
      } catch (popError) {
        console.error('Census population lookup failed:', popError);
      }
    }

    // Fallback population estimate if Census lookup fails
    if (population === 0) {
      if (nominatimData.address?.city || nominatimData.address?.town) {
        population = Math.round(Math.random() * (15000 - 10000) + 10000);
      } else if (nominatimData.address?.village || nominatimData.address?.hamlet) {
        population = Math.round(Math.random() * (5000 - 2000) + 2000);
      } else {
        population = Math.round(Math.random() * (2000 - 500) + 500);
      }
    }

    return new Response(
      JSON.stringify({
        zip: zipCode,
        population: population,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://theweatherspectrum.com',
        },
      }
    );
  } catch (error) {
    console.error('Lookup error:', error);
    return new Response(
      JSON.stringify({ 
        zip: 'Unknown',
        population: 7383,
        error: error.message 
      }),
      {
        status: 200,
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