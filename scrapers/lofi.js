const fs = require('fs');
const path = require('path');

const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'lofi.xml'); 

// The classic Lofi Girl artwork
const LOFI_LOGO = "https://storage.googleapis.com/bitly-image-upload/Ip4f8VcIU3M";

function getXMLTVTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

function buildGuide() {
  console.log(`[Lofi] Generating continuous EPG...`);
  
  let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Lofi Generator">\n`;
  // Make sure the channel id matches what you use in your proxy/DVR!
  perfectXml += `  <channel id="LofiGirl">\n    <display-name>Lofi Girl Radio</display-name>\n  </channel>\n`;

  const now = new Date();
  // Start at midnight UTC today
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  // Generate 14 blocks of 12 hours each (7 days of schedule)
  for (let i = 0; i < 14; i++) { 
     let blockStart = new Date(startOfDay.getTime() + (i * 12 * 60 * 60 * 1000));
     let blockEnd = new Date(blockStart.getTime() + (12 * 60 * 60 * 1000));

     const start = getXMLTVTime(blockStart);
     const stop = getXMLTVTime(blockEnd);

     perfectXml += `  <programme start="${start}" stop="${stop}" channel="LofiGirl">\n`;
     perfectXml += `    <title lang="en">lofi hip hop radio - beats to relax/study to</title>\n`;
     perfectXml += `    <desc lang="en">A 24/7 continuous stream of lo-fi hip hop beats. Perfect for studying, working, or relaxing.</desc>\n`;
     perfectXml += `    <category lang="en">Music</category>\n`;
     perfectXml += `    <icon src="${LOFI_LOGO}" />\n`;
     perfectXml += `  </programme>\n`;
  }

  perfectXml += `</tv>`;
  fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
  console.log(`[Lofi] Success! Saved to ${OUTPUT_FILE}`);
}

buildGuide();
