const fs = require('fs');

const MAKO_API_URL = 'https://www.mako.co.il/AjaxPage?jspName=EPGResponse.jsp';
const ROKUIL_URL = 'https://raw.githubusercontent.com/RokuIL/Live-From-Israel/master/EPG/WGP/guide.xml';
const OUTPUT_FILE = './xml/mako.xml';
const CHANNEL_ID = 'Keshet 12';

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

function categorize(showTitle) {
  for (const [knownShow, data] of Object.entries(keshetDatabase)) {
    if (showTitle.includes(knownShow)) return data.type;
  }
  if (newsKeywords.some(kw => showTitle.includes(kw))) return 'News';
  if (showTitle.includes('סרט')) return 'Movie';
  return 'Series';
}

function ensureXmlFolder() {
  if (!fs.existsSync('./xml')) fs.mkdirSync('./xml');
}

async function buildMako() {
  ensureXmlFolder();
  try {
    console.log('[Mako] Fetching native JSON...');
    const response = await fetch(MAKO_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.mako.co.il/'
      }
    });
    const jsonData = await response.json();
    const programs = jsonData.programs;
    if (!programs || !Array.isArray(programs)) throw new Error('No programs array in response');

    let xml = `  <channel id="${CHANNEL_ID}">\n    <display-name>${CHANNEL_ID}</display-name>\n  </channel>\n`;

    for (const item of programs) {
      const start = getXMLTVTime(item.StartTimeUTC);
      const stop  = getXMLTVTime(item.StartTimeUTC + item.DurationMs);
      const dateParts = item.StartTime.split(' ')[0].split('/');
      const airDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      let rawTitle = item.ProgramName || 'Unknown';
      let showTitle = rawTitle, episodeName = '';
      const dashRegex = /\s*[-–]\s*/;
      if (dashRegex.test(rawTitle)) {
        const parts = rawTitle.split(dashRegex);
        showTitle = parts[0].trim();
        episodeName = parts.slice(1).join(' - ').trim();
      }

      const description = item.EventDescription
        ? item.EventDescription.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '';
      const category = categorize(showTitle);

      let iconTag = '';
      if (item.Picture && !item.Picture.includes('placeHolder')) iconTag = `    <icon src="${item.Picture}" />\n`;
      else if (item.newsLogo) iconTag = `    <icon src="${item.newsLogo}" />\n`;

      xml += `  <programme start="${start}" stop="${stop}" channel="${CHANNEL_ID}">\n`;
      xml += `    <title lang="he">${showTitle}</title>\n`;
      if (episodeName) xml += `    <sub-title lang="he">${episodeName}</sub-title>\n`;
      if (description) xml += `    <desc lang="he">${description}</desc>\n`;
      xml += `    <category lang="en">${category}</category>\n`;
      if (category !== 'Movie') xml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
      xml += iconTag;
      xml += `  </programme>\n`;
    }

    fs.writeFileSync(OUTPUT_FILE, xml, 'utf-8');
    console.log(`[Mako] ✅ Saved ${programs.length} programs to ${OUTPUT_FILE}`);

  } catch (err) {
    console.warn(`[Mako] ⚠️ Native failed (${err.message}). Falling back to RokuIL...`);
    await buildMakoFallback();
  }
}

async function buildMakoFallback() {
  const response = await fetch(ROKUIL_URL);
  const rawXml = await response.text();
  const programmeRegex = /<programme[^>]*channel="Keshet 12"[^>]*>([\s\S]*?)<\/programme>/g;

  let xml = `  <channel id="${CHANNEL_ID}">\n    <display-name>${CHANNEL_ID}</display-name>\n  </channel>\n`;
  let match, count = 0;

  while ((match = programmeRegex.exec(rawXml)) !== null) {
    const rawContent = match[1];
    const attributes = match[0].match(/<programme([^>]+)>/)[1];
    const startMatch = attributes.match(/start="(\d{4})(\d{2})(\d{2})/);
    const year = startMatch ? startMatch[1] : '2026';
    const month = startMatch ? startMatch[2] : '01';
    const day = startMatch ? startMatch[3] : '01';

    const titleMatch = rawContent.match(/<title[^>]*>(.*?)<\/title>/);
    const descMatch  = rawContent.match(/<desc[^>]*>(.*?)<\/desc>/);
    let rawTitle = titleMatch ? titleMatch[1] : 'Unknown';
    const description = descMatch ? descMatch[1] : '';
    let showTitle = rawTitle, episodeName = '';

    if (rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      showTitle = parts[0].trim();
      episodeName = parts.slice(1).join(' - ').trim();
    }

    const category = categorize(showTitle);
    xml += `  <programme${attributes}>\n    <title lang="he">${showTitle}</title>\n`;
    if (episodeName) xml += `    <sub-title lang="he">${episodeName}</sub-title>\n`;
    if (description) xml += `    <desc lang="he">${description}</desc>\n`;
    xml += `    <category lang="en">${category}</category>\n`;
    if (category !== 'Movie') xml += `    <episode-num system="original-air-date">${year}-${month}-${day}</episode-num>\n`;
    xml += `  </programme>\n`;
    count++;
  }

  fs.writeFileSync(OUTPUT_FILE, xml, 'utf-8');
  console.log(`[Mako] ✅ Fallback saved ${count} programs to ${OUTPUT_FILE}`);
}

buildMako();
