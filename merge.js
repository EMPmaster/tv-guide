const fs = require('fs');
const path = require('path');

const XML_FOLDER = './xml/';
const FINAL_FILE = './merged.xml';

function merge() {
  if (!fs.existsSync(XML_FOLDER)) {
    console.error('[Merge] ❌ xml/ folder not found. Run scrapers first!');
    process.exit(1);
  }

  const files = fs.readdirSync(XML_FOLDER).filter(f => f.endsWith('.xml'));
  if (files.length === 0) {
    console.error('[Merge] ❌ No XML files found in xml/ folder.');
    process.exit(1);
  }

  let combined = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Multi-Source EPG">\n`;

  files.forEach(file => {
    console.log(`[Merge] Adding ${file}...`);
    let content = fs.readFileSync(path.join(XML_FOLDER, file), 'utf-8');
    content = content.replace(/<\?xml.*?\?>/g, '').replace(/<tv[^>]*>/g, '').replace(/<\/tv>/g, '').trim();
    combined += content + '\n';
  });

  combined += `</tv>`;
  fs.writeFileSync(FINAL_FILE, combined, 'utf-8');
  console.log(`[Merge] ✅ Done! Saved to ${FINAL_FILE} (${files.length} source(s) merged)`);
}

merge();
