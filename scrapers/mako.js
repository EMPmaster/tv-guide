const fs = require('fs');
const path = require('path');

const MAKO_API_URL = 'https://www.mako.co.il/AjaxPage?jspName=EPGResponse.jsp';

// Automatically create the /xml/ folder if it doesn't exist
const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'mako.xml'); 

const keshetDatabase = {
  "המירוץ למיליון": { type: "Series" },
  "ארץ נהדרת": { type: "Series" },
  "מאסטר שף": { type: "Series" },
  "הכוכב הבא": { type: "Series" },
  "סברי מרנן": { type: "Series" },
  "עובדה": { type: "News" }
};
const newsKeywords = ['חדשות', 'מבזק', 'מהדורה', 'שש עם', 'חמש עם', 'הבוקר', 'תוכנית חיסכון', 'פגוש את העיתונות', 'אולפן שישי', 'דוח מצב', 'שבע עם'];

function getXMLTVTime(epochMs) {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

async function buildGuide() {
  try {
    console.log(`[Mako] Fetching native JSON data...`);
    const response = await fetch(MAKO_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.mako.co.il/'
      }
    });

    const jsonData = await response.json();
    const programs = jsonData.programs;

    if (!programs || !Array.isArray(programs)) {
        console.error(`[Mako Error] Native API blocked or invalid format. Skipping file creation.`);
        return;
    }

    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Mako Modular Scraper">\n`;
    perfectXml += `  <channel id="Keshet 12">\n    <display-name>Keshet 12</display-name>\n  </channel>\n`;

    for (const item of programs) {
      const start = getXMLTVTime(item.StartTimeUTC);
      const stop = getXMLTVTime(item.StartTimeUTC + item.DurationMs);
      const dateParts = item.StartTime.split(' ')[0].split('/');
      const airDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      let rawTitle = item.ProgramName || 'Unknown';
      let showTitle = rawTitle;
      let episodeName = '';

      const dashRegex = /\s*[-–]\s*/;
      if (dashRegex.test(rawTitle)) {
        let parts = rawTitle.split(dashRegex);
        showTitle = parts[0].trim();
        episodeName = parts.slice(1).join(' - ').trim();
      }

      let description = item.EventDescription ? item.EventDescription.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      let category = 'Series';
      let foundInDb = false;

      for (const [knownShow, data] of Object.entries(keshetDatabase)) {
        if (showTitle.includes(knownShow)) { category = data.type; foundInDb = true; break; }
      }

      if (!foundInDb) {
        let isNews = newsKeywords.some(keyword => showTitle.includes(keyword));
        if (isNews) category = 'News';
        else if (showTitle.includes('סרט')) category = 'Movie';
      }

      let iconTag = '';
      if (item.Picture && !item.Picture.includes('placeHolder')) {
         iconTag = `    <icon src="${item.Picture}" />\n`;
      } else if (item.newsLogo) {
         iconTag = `    <icon src="${item.newsLogo}" />\n`;
      }

      perfectXml += `  <programme start="${start}" stop="${stop}" channel="Keshet 12">\n`;
      perfectXml += `    <title lang="he">${showTitle}</title>\n`;
      if (episodeName) perfectXml += `    <sub-title lang="he">${episodeName}</sub-title>\n`;
      if (description) perfectXml += `    <desc lang="he">${description}</desc>\n`;
      perfectXml += `    <category lang="en">${category}</category>\n`;
      if (category !== 'Movie') perfectXml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
      perfectXml += iconTag;
      perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[Mako] Success! Saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error(`[Mako Error] Native fetch threw an error:`, error.message);
  }
}

buildGuide();
