const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const KAN_BASE_API = 'https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?channelId=4444&currentPageId=1517';

// --- CLEANER FOLDER ARCHITECTURE ---
const XML_DIR = path.join(__dirname, '../xml');
const IMAGES_DIR = path.join(__dirname, '../images/kan');
const DIR_ORIGINAL = path.join(IMAGES_DIR, 'original');
const DIR_LANDSCAPE = path.join(IMAGES_DIR, 'landscape');

// We point Plex to the clean, borderless landscape images
const IMAGES_BASE_URL = 'https://raw.githubusercontent.com/EMPmaster/tv-guide/main/images/kan/landscape';

[XML_DIR, IMAGES_DIR, DIR_ORIGINAL, DIR_LANDSCAPE].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const OUTPUT_FILE = path.join(XML_DIR, 'kan.xml'); 
const newsKeywords = ['חדשות', 'מבזק', 'מהדורה', 'משדר מיוחד', 'הלילה', 'הבוקר', 'שבע עם', 'שש עם', 'חמש עם'];
const activeImageHashes = new Set();

// Fixes HTML gibberish like &#x27; from Kan's website
function decodeHtml(html) {
    if (!html) return '';
    return html
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

// Safely escapes characters specifically for XML
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

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

async function processImage(url) {
    if (!url) return null;
    
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}.jpg`;
    activeImageHashes.add(filename);

    const origPath = path.join(DIR_ORIGINAL, filename);
    const pathLandscape = path.join(DIR_LANDSCAPE, filename);

    if (!fs.existsSync(origPath)) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            fs.writeFileSync(origPath, buffer);
            
            // Just shrink it to 800px wide. No black borders. Plex will crop it naturally.
            await sharp(buffer)
                .resize(800, null, { withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(pathLandscape);

            console.log(`[Kan 11] Downloaded & Processed: ${filename}`);
        } catch (err) {
            console.error(`[Kan 11] Failed to process image ${url} - ${err.message}`);
            return null;
        }
    }
    
    return `${IMAGES_BASE_URL}/${filename}`;
}

function cleanupOrphans() {
    console.log(`[Kan 11] Running Zero-Bloat Orphan Cleanup...`);
    let deletedCount = 0;

    [DIR_ORIGINAL, DIR_LANDSCAPE].forEach(dir => {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.jpg') && !activeImageHashes.has(file)) {
                    fs.unlinkSync(path.join(dir, file));
                    deletedCount++;
                }
            });
        }
    });
    console.log(`[Kan 11] Cleanup complete. Deleted ${deletedCount} orphaned files.`);
}

async function buildGuide() {
  try {
    const uniquePrograms = new Map();

    for (let i = 0; i < 3; i++) {
        let targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + i);
        
        let dd = String(targetDate.getDate()).padStart(2, '0');
        let mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        let yyyy = targetDate.getFullYear();
        let fetchUrl = `${KAN_BASE_API}&day=${dd}-${mm}-${yyyy}`;
        
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
                
                // Decode HTML gibberish FIRST, then safely strip tags
                let decodedTitle = decodeHtml(titleMatch[1].trim());
                let decodedDesc = descMatch ? decodeHtml(descMatch[1].trim()).replace(/<[^>]*>?/gm, '') : '';
                
                let img = imgMatch ? imgMatch[1] : '';
                if (img) {
                    img = img.split('?')[0];
                    if (!img.startsWith('http')) img = 'https://www.kan.org.il' + img;
                    img = img.replace('https://mobapi.kan.org.il', 'https://www.kan.org.il');
                }

                if (!uniquePrograms.has(startUtc)) {
                    uniquePrograms.set(startUtc, { start: startUtc, title: decodedTitle, desc: decodedDesc, rawIcon: img });
                }
            }
        });
    }

    const programs = Array.from(uniquePrograms.values()).sort((a, b) => {
        return formatXMLTV(a.start).localeCompare(formatXMLTV(b.start));
    });
    
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

        let episodeNumXml = `<episode-num system="original-air-date">${airDate}</episode-num>`;
        let cleanTitle = item.title;

        let seasonMatch = item.title.match(/עונה\s*(\d+)/);
        let episodeMatch = item.title.match(/פרק\s*(\d+)/);

        if (seasonMatch || episodeMatch) {
            let s = seasonMatch ? seasonMatch[1] : "1";
            let e = episodeMatch ? episodeMatch[1] : "";
            if (e) {
                episodeNumXml = `<episode-num system="onscreen">S${s}E${e}</episode-num>`;
                cleanTitle = item.title.split(/[-–:]/)[0].trim();
            }
        }

        const finalIconUrl = await processImage(item.rawIcon);

        // Escape everything just before injecting into XML to guarantee Plex doesn't crash
        const xmlTitle = escapeXml(cleanTitle);
        const xmlSubTitle = escapeXml(item.title);
        const xmlDesc = escapeXml(item.desc);

        perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Kan 11">\n`;
        perfectXml += `    <title lang="he">${xmlTitle}</title>\n`;
        if (cleanTitle !== item.title) perfectXml += `    <sub-title lang="he">${xmlSubTitle}</sub-title>\n`;
        if (item.desc) perfectXml += `    <desc lang="he">${xmlDesc}</desc>\n`;
        perfectXml += `    <category lang="en">${category}</category>\n`;
        if (category !== 'Movie') perfectXml += `    ${episodeNumXml}\n`;
        if (finalIconUrl) perfectXml += `    <icon src="${finalIconUrl}" />\n`;
        perfectXml += `  </programme>\n`;
    }

    perfectXml += `</tv>`;
    fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
    cleanupOrphans();

  } catch (error) {
    console.error(`[Kan 11 Error]`, error.message);
  }
}

buildGuide();
