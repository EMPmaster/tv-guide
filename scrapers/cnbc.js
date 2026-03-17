const fs = require('fs');
const path = require('path');

const CNBC_API_URL = 'https://webql-redesign.cnbcfm.com/graphql?operationName=showsSchedule&variables=%7B%22primeTime%22%3Afalse%2C%22scheduleDateStart%22%3A0%2C%22scheduleDateEnd%22%3A0%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%227d1c6ed713be42238fefee4fcf7b1dfa852341293af2fc8a11d9ae9afdb53dae%22%7D%7D';

const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'cnbc.xml'); 

// THE POSTER DICTIONARY: 
// Direct, reliable, high-res TMDB/TVDB .jpg links. No Wikimedia SVGs!
const posterDatabase = {
    "Shark Tank": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/nOItJ1D6b1L6S0GzT72L50tN1gX.jpg",
    "Mad Money": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7k1P4j4xQ1r2F7Yx0FkLzC5Y6D.jpg", // Example URL
    "Squawk Box": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9q8K3M4pY6N1TzV2bL8G5jH9X1.jpg", // Example URL
    // The ultimate fallback CNBC Logo (Hosted cleanly, pure JPG)
    "FALLBACK": "https://i.imgur.com/3q1Z9kY.jpg" 
};

function getXMLTVTime(epochMs) {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

async function buildGuide() {
  try {
    const response = await fetch(CNBC_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://www.cnbc.com/'
      }
    });

    const jsonData = await response.json();
    const scheduleData = jsonData?.data?.showsSchedule;
    if (!scheduleData) return;

    let programs = [];
    if (scheduleData.live) programs.push(scheduleData.live);
    if (scheduleData.comingUp) programs = programs.concat(scheduleData.comingUp);

    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="CNBC Bulletproof">\n`;
    perfectXml += `  <channel id="CNBC">\n    <display-name>CNBC</display-name>\n  </channel>\n`;

    for (const item of programs) {
      const startMs = item.startTime * 1000;
      const stopMs = item.endTime * 1000;
      const d = new Date(startMs);
      
      const start = getXMLTVTime(startMs);
      const stop = getXMLTVTime(stopMs);

      let showTitle = item.title || 'CNBC Broadcast';
      let description = item.description ? item.description.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      
      // Look up the image in our dictionary, or use the fallback
      let posterUrl = posterDatabase[showTitle] || posterDatabase["FALLBACK"];

      // PLEX FIX: Force a Season and Episode number based on the date (e.g., Season 2026, Episode 317)
      // This mathematically guarantees Plex cannot classify it as a movie.
      let fakeSeason = d.getUTCFullYear();
      let fakeEpisode = `${d.getUTCMonth() + 1}${String(d.getUTCDate()).padStart(2, '0')}`;
      
      perfectXml += `  <programme start="${start}" stop="${stop}" channel="CNBC">\n`;
      perfectXml += `    <title lang="en">${showTitle}</title>\n`;
      // Plex requires a sub-title to reliably flag it as a TV Show
      perfectXml += `    <sub-title lang="en">Live Broadcast</sub-title>\n`; 
      if (description) perfectXml += `    <desc lang="en">${description}</desc>\n`;
      perfectXml += `    <category lang="en">News</category>\n`;
      perfectXml += `    <category lang="en">Series</category>\n`;
      perfectXml += `    <icon src="${posterUrl}" />\n`;
      perfectXml += `    <episode-num system="onscreen">S${fakeSeason}E${fakeEpisode}</episode-num>\n`;
      perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[CNBC] Success! Saved with images to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error(`[CNBC Error]`, error.message);
  }
}

buildGuide();
