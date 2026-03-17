const fs = require('fs');
const path = require('path');

// The exact GraphQL query URL you found
const CNBC_API_URL = 'https://webql-redesign.cnbcfm.com/graphql?operationName=showsSchedule&variables=%7B%22primeTime%22%3Afalse%2C%22scheduleDateStart%22%3A0%2C%22scheduleDateEnd%22%3A0%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%227d1c6ed713be42238fefee4fcf7b1dfa852341293af2fc8a11d9ae9afdb53dae%22%7D%7D';

const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'cnbc.xml'); 

function getXMLTVTime(epochMs) {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

async function buildGuide() {
  try {
    console.log(`[CNBC] Fetching native GraphQL data...`);
    const response = await fetch(CNBC_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.cnbc.com/'
      }
    });

    const jsonData = await response.json();
    
    // CNBC splits the data into "live" (current) and "comingUp" (future)
    const scheduleData = jsonData?.data?.showsSchedule;
    if (!scheduleData) {
        console.error(`[CNBC Error] API blocked or invalid format. Skipping.`);
        return;
    }

    // Combine the currently live show and the upcoming shows into one array
    let programs = [];
    if (scheduleData.live) programs.push(scheduleData.live);
    if (scheduleData.comingUp && Array.isArray(scheduleData.comingUp)) {
        programs = programs.concat(scheduleData.comingUp);
    }

    // Build the XML fragment for CNBC
    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="CNBC Modular Scraper">\n`;
    perfectXml += `  <channel id="CNBC">\n    <display-name>CNBC</display-name>\n  </channel>\n`;

    for (const item of programs) {
      // CNBC uses Seconds (10 digits), so we multiply by 1000 to get Milliseconds
      const startMs = item.startTime * 1000;
      const stopMs = item.endTime * 1000;
      
      const start = getXMLTVTime(startMs);
      const stop = getXMLTVTime(stopMs);

      // Generate a YYYY-MM-DD air date for the DVR
      const d = new Date(startMs);
      const pad = (n) => String(n).padStart(2, '0');
      const airDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

      let showTitle = item.title || 'CNBC Programming';
      let description = item.description ? item.description.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      
      // Categorize based on their internal displayGenre
      let category = 'News'; 
      if (item.displayGenre === 'Reality') {
          category = 'Series'; // Put things like Shark Tank into Series
      }

      perfectXml += `  <programme start="${start}" stop="${stop}" channel="CNBC">\n`;
      perfectXml += `    <title lang="en">${showTitle}</title>\n`;
      if (description) perfectXml += `    <desc lang="en">${description}</desc>\n`;
      perfectXml += `    <category lang="en">${category}</category>\n`;
      perfectXml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
      perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[CNBC] Success! Saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error(`[CNBC Error] Fetch threw an error:`, error.message);
  }
}

buildGuide();
