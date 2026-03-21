// scrapers/skynews.js
const cheerio = require('cheerio');

module.exports = {
  // Define the channel ID and name for the XMLTV file
  channelId: 'skynews',
  channelName: 'Sky News',
  
  // The function your master script will call to get the EPG data
  scrape: async function() {
    const url = 'https://www.tvguide.co.uk/channel/sky-news';
    console.log(`[EPG] Fetching schedule for Sky News from ${url}...`);

    try {
      // 1. Fetch the raw HTML
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await response.text();

      // 2. Load the HTML into Cheerio for easy DOM parsing
      const $ = cheerio.load(html);
      let programs = [];

      // 3. Loop through every scheduled show on the page
      $('.js-schedule').each((index, element) => {
        // Extract the exact ISO start time (e.g., 2026-03-21T06:00:00.000Z)
        const startTimeISO = $(element).attr('data-date');
        
        // Find the title inside the <a> tag
        const title = $(element).find('a.font-semibold').text().trim();
        
        // Find the full description (ignoring the mobile-only truncated one)
        const description = $(element).find('.hidden.md\\:block').text().trim();
        
        // Grab the show's thumbnail image
        const image = $(element).find('img').attr('src');

        if (startTimeISO && title) {
          programs.push({
            title: title,
            description: description || 'No description available.',
            image: image || '',
            // Convert the ISO string to a standard Javascript Date Object/Timestamp
            start: new Date(startTimeISO).getTime(), 
          });
        }
      });

      // 4. Calculate 'stop' times
      // XMLTV needs a stop time. We calculate this by looking at the start time of the next show.
      for (let i = 0; i < programs.length; i++) {
        if (i < programs.length - 1) {
          // The stop time is exactly when the next program starts
          programs[i].stop = programs[i + 1].start;
        } else {
          // For the very last show on the page, we default to a 30-minute duration
          programs[i].stop = programs[i].start + (30 * 60 * 1000); 
        }
      }

      console.log(`[EPG] Successfully scraped ${programs.length} shows for Sky News!`);
      return programs;

    } catch (error) {
      console.error(`[EPG Error] Failed to scrape Sky News: ${error.message}`);
      return [];
    }
  }
};
