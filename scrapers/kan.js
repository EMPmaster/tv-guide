const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const KAN_BASE_API = 'https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?channelId=4444&currentPageId=1517';

// Folders and URLs
const XML_DIR = path.join(__dirname, '../xml');
const IMAGES_DIR = path.join(__dirname, '../images/kan');
const IMAGES_BASE_URL = 'https://raw.githubusercontent.com/EMPmaster/tv-guide/main/images/kan';

if (!fs.existsSync(XML_DIR)) fs.mkdirSync(XML_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const OUTPUT_FILE = path.join(XML_DIR, 'kan.xml'); 
const newsKeywords = ['חדשות', 'מבזק', 'מהדורה', 'משדר מיוחד', 'הלילה', 'הבוקר', 'שבע עם', 'שש עם', 'חמש עם'];

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

function cleanupOldImages() {
    const files = fs.readdirSync(IMAGES_DIR);
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
        const filePath = path.join(IMAGES_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > SEVEN_DAYS) {
            fs.unlinkSync(filePath);
            console.log(`[Kan 11] Deleted old image: ${file}`);
        }
    });
}

async function processImage(url) {
    if (!url) return null;
    
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}.jpg`;
    const filePath = path.join(IMAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            await sharp(buffer)
                .resize(400, null, { withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(filePath);
                
            console.log(`[Kan 11] Downloaded & Resized: ${filename}`);
        } catch (err) {
            console.error(`[Kan 11] Failed to process image ${url} - ${err.message}`);
            return null;
        }
    }
    
    return `${IMAGES_BASE_URL}/${filename}`;
}

async function buildGuide() {
  try {
    console.log(`[Kan 11] Cleaning old images...`);
    cleanupOldImages();

    const uniquePrograms = new Map();

    // Loop 3 times (Today, Tomorrow, Day After)
    for (let i = 0; i < 3; i++) {
        let targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);
        
        // THE FIX: Format DD-MM-YYYY for the API
        let dd = String(targetDate.getDate()).padStart(2, '0');
        let mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        let yyyy = targetDate.getFullYear();
        let fetchUrl = `${KAN_BASE_API}&day=${dd}-${mm}-${yyyy}`;

        console.log(`[Kan 11] Fetching schedule for ${dd}-${mm}-${yyyy}...`);
        
        const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const html = await response.text();
        const blocks = html.split('class="results-item').slice(1);

        blocks.forEach(block => {
            const timeMatch = block.match(/data-date-utc="([^"]+)"/);
            const titleMatch = block.match(/class="program-title">([^<]+)<\/h3>/);
            const descMatch = block.match(/class="program-description">([\s\S]*?)<\/div>/);
            const imgMatch = block.match(/src="([^"]+)"/);

            if (timeMatch && titleMatch) {
                let startUtc = timeMatch[1];
                let title = titleMatch[1].trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                let desc = descMatch ? descMatch[1].trim().replace(/<[^>]*>?/gm, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
                
                let img = imgMatch ? imgMatch[1] : '';
                if (img) {
                    img = img.split('?')[0];
                    if (!img.startsWith('http')) img = 'https://www.kan.org.il' + img;
                    img = img.replace('https://mobapi.kan.org.il', 'https://www.kan.org.il');
                }

                if (!uniquePrograms.has(startUtc)) {
                    uniquePrograms.set(startUtc, { start: startUtc, title: title, desc: desc, rawIcon: img });
                }
            }
        });
    }

    const programs = Array.from(uniquePrograms.values()).sort((a, b) => {
        return formatXMLTV(a.start).localeCompare(formatXMLTV(b.start));
    });

    console.log(`[Kan 11] Processing ${programs.length} total programs across 3 days...`);
    
    let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Kan 11 Scraper">\n`;
    perfectXml += `  <channel id="Kan 11">\n    <display-name>Kan 11</display-name>\n  </channel>\n`;

    for (let i = 0; i < programs.length; i++) {
        const item = programs[i];
        const nextItem = programs[i + 1];
        
        const startXml = formatXMLTV(item.start);
        const stopXml = nextItem ? formatXMLTV(nextItem.start) : formatXMLTV(item.start.replace(/(\d+):/, (match, p1) => (parseInt(p1)+1) + ":"));
        const airDate = item.start.split(' ')[0].split('.').reverse().map(n => n.padStart(2, '0')).join('-');

        let category = 'Series';
        let isNews = newsKeywords.some(keyword => item.title.includes(keyword));
        if (isNews) category = 'News';
        else if (item.title.includes('סרט')) category = 'Movie';

        const finalIconUrl = await processImage(item.rawIcon);

        perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Kan 11">\n`;
        perfectXml += `    <title lang="he">${item.title}</title>\n`;
        if (item.desc) perfectXml += `    <desc lang="he">${item.desc}</desc>\n`;
        perfectXml += `    <category lang="en">${category}</category>\n`;
        if (category !== 'Movie') perfectXml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
        if (finalIconUrl) perfectXml += `    <icon src="${finalIconUrl}" />\n`;
        perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    console.log(`[Kan 11] Success! Saved ${programs.length} programs to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error(`[Kan 11 Error]`, error.message);
  }
}

buildGuide();
