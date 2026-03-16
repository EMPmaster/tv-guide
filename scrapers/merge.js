const fs = require('fs');
const path = require('path');

const scraperFolder = './scrapers/';
const finalFile = './custom_guide.xml';

function merge() {
  let combinedContent = '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n';
  
  const files = fs.readdirSync(scraperFolder).filter(f => f.endsWith('.xml'));
  
  files.forEach(file => {
    let content = fs.readFileSync(path.join(scraperFolder, file), 'utf-8');
    // Remove the <?xml...?> and <tv> tags from individual files so they fit in the master
    content = content.replace(/<\?xml.*\?>/g, '').replace(/<tv.*>/g, '').replace(/<\/tv>/g, '');
    combinedContent += content;
  });

  combinedContent += '</tv>';
  fs.writeFileSync(finalFile, combinedContent);
  console.log("Merged all guides into custom_guide.xml");
}

merge();
