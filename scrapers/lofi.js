const fs = require('fs');
const path = require('path');

const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'lofi.xml'); 

const LOFI_LOGO = "https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Lofi_girl_logo.jpg/500px-Lofi_girl_logo.jpg";

function getXMLTVTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

function buildGuide() {
  console.log(`[Lofi] Generating continuous EPG...`);
  
  let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Lofi Generator">\n`;
  perfectXml += `  <channel id="LofiGirl">\n    <display-name>Lofi Girl Radio</display-name>\n  </channel>\n`;

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));

  for (let i = 0; i < 42; i++) { 
     let blockStart = new Date(startOfDay.getTime() + (i * 4 * 60 * 60 * 1000));
     let blockEnd = new Date(blockStart.getTime() + (4 * 60 * 60 * 1000));

     const start = getXMLTVTime(blockStart);
     const stop = getXMLTVTime(blockEnd);

     perfectXml += `  <programme start="${start}" stop="${stop}" channel="LofiGirl">\n`;
     perfectXml += `    <title lang="en">Lofi Girl Radio</title>\n`;
     perfectXml += `    <sub-title lang="en">🎵 Live from YouTube</sub-title>\n`;
     perfectXml += `    <desc lang="en">A 24/7 continuous stream of lo-fi hip hop beats. Perfect for studying, working, or relaxing.</desc>\n`;
     perfectXml += `    <category lang="en">Music</category>\n`;
     perfectXml += `    <icon src="${LOFI_LOGO}" />\n`;
     perfectXml += `    <episode-num system="xmltv_ns">0.${i}.0/1</episode-num>\n`;
     perfectXml += `  </programme>\n`;
  }

  perfectXml += `</tv>`;
  fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
  console.log(`[Lofi] Success! Saved to ${OUTPUT_FILE}`);
}

buildGuide();
