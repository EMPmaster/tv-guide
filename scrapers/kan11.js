const fs = require('fs');
const path = require('path');

const KAN_API_URL = 'https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?channelId=4444&currentPageId=1517';

const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)){
    fs.mkdirSync(XML_DIR, { recursive: true });
}
const OUTPUT_FILE = path.join(XML_DIR, 'kan.xml'); 

function formatXMLTV(dateStr) {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('.');
    const timeParts = parts[1].split(':');
    
    const day = dateParts[0].padStart(2, '0');
    const month = dateParts[1].padStart(2, '0');
    const year = dateParts[2];
    const hh = timeParts[0].padStart(2, '0');
    const mm = timeParts[1].padStart(2, '0');
    const ss = timeParts[2].padStart(2, '0');
    
    return `${year}${month}${day}${hh}${mm}${ss} +0000`;
}

async function buildGuide() {
  try {
    console.log(`[Kan 11] Fetching HTML schedule...`);
    const response = await fetch(KAN_API_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Safari/537.36' }
    });

    const html = await response.text();
    
    const blocks = html.split('class="results-item').slice(1);
    const programs = [];

    blocks.forEach(block => {
        const timeMatch = block.match(/data-date-utc="([^"]+)"/);
        const titleMatch = block.match(/class="program-title">([^<]+)<\/h3>/);
        const descMatch = block.match(/class="program-description">([\s\S]*?)<\/div>/);
        const imgMatch = block.match(/src="([^"]+)"/);

        if (timeMatch && titleMatch) {
            let startUtc = timeMatch[1];
            let title = titleMatch[1].trim();
            let desc = descMatch ? descMatch[1].trim().replace(/<[^>]*>?/gm, '') : '';
            
            // --- THE IMAGE CAR WASH ---
            let img = imgMatch ? imgMatch[1] : '';
            if (img) {
                // 1. Strip the resizing query so it ends cleanly in .jpg
                img = img.split('?')[0];
                
                // 2. Force it off the restricted mobapi domain and onto the public www domain
                img = img.replace('https://mobapi.kan.org.il', 'https://www.kan.org.il');
                
                // 3. Fix relative paths
                if (!img.startsWith('http')) {
                    img = 'https://www.kan.org.il' + img;
                }
                
                // 4. Safely URL-encode any Hebrew characters so Plex doesn't crash
                img = encodeURI(decodeURI(img));
            }

            programs.push({
                start: startUtc,
                title: title,
                desc: desc,
                icon: img
            });
        }
    });

    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Kan 11 Scraper">\n`;
    perfectXml += `  <channel id="Kan 11">\n    <display-name>Kan 11</display-name>\n  </channel>\n`;

    for (let i = 0; i < programs.length; i++) {
        const item = programs[i];
        const nextItem = programs[i + 1];
        
        const startXml = formatXMLTV(item.start);
        const stopXml = nextItem ? formatXMLTV(nextItem.start) : formatXMLTV(item.start.replace(/(\d+):/, (match, p1) => (parseInt(p1)+1) + ":"));

        const airDate = item.start.split(' ')[0].split('.').reverse().map(n => n.padStart(2, '0')).join('-');

        perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Kan 11">\n`;
        perfectXml += `    <title lang="he">${item.title}</title>\n`;
        if (item.desc) perfectXml += `    <desc lang="he">${item.desc}</desc>\n`;
        perfectXml += `    <category lang="en">Series</category>\n`;
        perfectXml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
        if (item.icon) perfectXml += `    <icon src="${item.icon}" />\n`;
        perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[Kan 11] Success! Saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error(`[Kan 11 Error]`, error.message);
  }
}

buildGuide();
