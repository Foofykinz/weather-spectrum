// Historic tornado events with radar replay pages (/events/<slug>).
//
// Every fact here comes from the National Weather Service source linked with
// it; nothing is written from memory. The warning timeline comes from the
// NWS products themselves (scripts/build-events.mjs -> event-data.json).
// The replay uses the real archived NEXRAD scans (Level II) from the radar
// named here, ending at `end` (UTC).

import EVENT_DATA from './event-data.json';

export const EVENTS = [
  {
    slug: 'moore-tornado-2013',
    place: 'Moore, Oklahoma',
    short: 'Moore Tornado',
    date: '2013-05-20',
    dateText: 'May 20, 2013',
    rating: 'EF5',
    radar: 'TLX',
    end: '2013-05-20T20:35Z',
    view: { lat: 35.31, lon: -97.48, zoom: 10 },
    tz: 'America/Chicago',
    summary:
      'On the afternoon of May 20, 2013, a tornado touched down on the west side of Newcastle at 2:56 PM CDT and moved through south Oklahoma City and Moore before lifting near Lake Stanley Draper about 40 minutes later. The National Weather Service in Norman rated it EF5 along a path of about 14 miles. It killed 24 people and injured 212.',
    facts: [
      ['Rating', 'EF5'],
      ['On the ground', '2:56 to 3:35 PM CDT (about 40 minutes)'],
      ['Path length', 'About 14 miles'],
      ['Maximum width', '1.1 miles (1,900 yards)'],
      ['Deaths', '24'],
      ['Injuries', '212'],
      ['Path', 'West side of Newcastle to near Lake Stanley Draper'],
      ['NWS office', 'Norman, Oklahoma'],
    ],
    sources: [{ label: 'NWS Norman: The May 20, 2013 Newcastle-Moore tornado', url: 'https://www.weather.gov/oun/events-20130520' }],
  },
  {
    slug: 'joplin-tornado-2011',
    place: 'Joplin, Missouri',
    short: 'Joplin Tornado',
    date: '2011-05-22',
    dateText: 'May 22, 2011',
    rating: 'EF5',
    radar: 'SGF',
    end: '2011-05-22T23:00Z',
    view: { lat: 37.07, lon: -94.5, zoom: 10 },
    tz: 'America/Chicago',
    summary:
      'On Sunday, May 22, 2011, a multiple-vortex tornado touched down at 5:34 PM CDT just southwest of Joplin, Missouri, and moved east through the city, strengthening to EF5 with estimated winds over 200 mph before weakening southeast of Joplin. The National Weather Service in Springfield had issued a tornado warning at 5:17 PM, 17 minutes before touchdown. The NWS reports 158 people killed and more than 1,000 injured.',
    facts: [
      ['Rating', 'EF5 (estimated winds over 200 mph)'],
      ['Touchdown', '5:34 PM CDT, southwest of Joplin'],
      ['Dissipated', 'About 6:12 PM CDT, southeast of Joplin (estimated)'],
      ['Tornado warning', '5:17 PM CDT, 17 minutes before touchdown'],
      ['Path length', 'About 22.1 miles'],
      ['Maximum width', 'Up to 1 mile'],
      ['Deaths', '158'],
      ['Injuries', 'More than 1,000'],
      ['NWS office', 'Springfield, Missouri'],
    ],
    sources: [
      { label: 'NWS: Remembering the Joplin tornado', url: 'https://www.weather.gov/news/052212-joplin' },
      { label: 'NWS graphic: Joplin Tornado Path of Destruction (touchdown, warning and dissipation times)' },
      { label: 'NWS Central Region service assessment: Joplin, Missouri, tornado', url: 'https://www.weather.gov/media/publications/assessments/Joplin_tornado.pdf' },
    ],
  },
].map((e) => ({ ...e, warnings: EVENT_DATA[e.slug]?.warnings || [] }));

export const eventPath = (e) => `/events/${e.slug}`;
export const eventTitle = (e) => `${e.short} Radar Loop (${e.dateText})`;
