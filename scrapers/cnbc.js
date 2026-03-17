const fs = require('fs');
const path = require('path');

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
    console.log(`[CNBC] Fetching data and posters...`);
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

    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="CNBC Scraper v2">\n`;
    perfectXml += `  <channel id="CNBC">\n    <display-name>CNBC</display-name>\n  </channel>\n`;

    for (const item of programs) {
      const start = getXMLTVTime(item.startTime * 1000);
      const stop = getXMLTVTime(item.endTime * 1000);
      let showTitle = item.title || 'CNBC';
      let description = item.description ? item.description.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      
      // POSTER LOGIC:
      // We use the episodeGuid to pull from the Gracenote image database.
      // This is what most professional EPG providers do.
      let iconTag = '';
      if (item.episodeGuid) {
          // We extract the base ID (usually the part after EP)
          const imageId = item.episodeGuid.replace('EP', '');
          // This URL is a common mirror for high-res US TV posters
          const posterUrl = `https://zap2it.tmsimg.com/assets/p${parseInt(imageId)}_b_v8_ad.jpg`;
          iconTag = `    <icon src="${posterUrl}" />\n`;
      }

      perfectXml += `  <programme start="${start}" stop="${stop}" channel="CNBC">\n`;
      perfectXml += `    <title lang="en">${showTitle}</title>\n`;
      if (description) perfectXml += `    <desc lang="en">${description}</desc>\n`;
      perfectXml += `    <category lang="en">News</category>\n`;
      perfectXml += iconTag;
      perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[CNBC] Success with images!`);

  } catch (error) {
    console.error(`[CNBC Error]`, error.message);
  }
}

buildGuide();
