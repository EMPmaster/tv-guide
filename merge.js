const fs = require('fs');
const path = require('path');

const XML_DIR = path.join(__dirname, 'xml');
const OUTPUT_FILE = path.join(__dirname, 'merged_guide.xml');

function merge() {
  console.log('[Merge] Starting merge process...');
  
  if (!fs.existsSync(XML_DIR)) {
      console.log('[Merge] No xml directory found. Nothing to merge.');
      return;
  }

  let combinedContent = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Merged Master Scraper">\n`;
  
  const files = fs.readdirSync(XML_DIR).filter(f => f.endsWith('.xml'));
  
  if (files.length === 0) {
      console.log('[Merge] No XML files found in xml/ directory.');
      return;
  }

  files.forEach(file => {
    console.log(`[Merge] Reading ${file}...`);
    let content = fs.readFileSync(path.join(XML_DIR, file), 'utf-8');
    
    // Strip out XML declarations and <tv> tags so we only get the inner <channel> and <programme> blocks
    content = content.replace(/<\?xml.*?\?>/g, '')
                     .replace(/<tv.*?>/g, '')
                     .replace(/<\/tv>/g, '')
                     .trim();
                     
    combinedContent += content + '\n';
  });

  combinedContent += '</tv>';
  fs.writeFileSync(OUTPUT_FILE, combinedContent, 'utf-8');
  console.log(`[Merge] Successfully merged ${files.length} files into ${OUTPUT_FILE}`);
}

merge();
