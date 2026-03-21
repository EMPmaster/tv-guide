// scrapers/skynews.js
const dayjs = require('dayjs');

module.exports = {
  site: 'sky.com', // The internal ID your framework will use to run this script
  days: 7, // Sky's API provides up to 7 days of future scheduling
  url: function ({ date, channel }) {
    // Sky's official API expects the date as YYYYMMDD and the internal Service ID (sid)
    return `https://awk.epgsky.com/hawk/linear/schedule/${date.format('YYYYMMDD')}/${channel.site_id}`;
  },
  parser: function ({ content }) {
    let programs = [];
    
    // Safety check in case the API is down or returns nothing
    if (!content) return programs;
    
    const parsed = JSON.parse(content);

    // Navigate the JSON to find the events array
    if (!parsed.schedule || !parsed.schedule[0] || !parsed.schedule[0].events) {
      return programs;
    }

    const events = parsed.schedule[0].events;

    events.forEach(item => {
      programs.push({
        title: item.t || item.title, // 't' is usually the title in Sky's JSON
        description: item.sy || '', // 'sy' is the synopsis/description
        // 'st' is the start time in Unix seconds. We convert it to ISO format for XMLTV.
        start: dayjs.unix(item.st).toJSON(),
        // 'd' is the duration in seconds. We add it to the start time to get the stop time.
        stop: dayjs.unix(item.st).add(item.d, 'second').toJSON()
      });
    });

    return programs;
  }
};
