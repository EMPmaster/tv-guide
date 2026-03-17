const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const KAN_BASE_API = 'https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule?channelId=4444&currentPageId=1517';

// --- CLEAN FOLDER ARCHITECTURE ---
const XML_DIR = path.join(__dirname, '../xml');
const IMAGES_DIR = path.join(__dirname, '../images/kan');
const DIR_LANDSCAPE = path.join(IMAGES_DIR, 'landscape');

const IMAGES_BASE_URL = 'https://raw.githubusercontent.com/EMPmaster/tv-guide/main/images/kan/landscape';

[XML_DIR, IMAGES_DIR, DIR_LANDSCAPE].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const OUTPUT_FILE = path.join(XML_DIR, 'kan.xml'); 
const newsKeywords = ['חדשות', 'מבזק', 'מהדורה', 'משדר מיוחד', 'הלילה', 'הבוקר', 'שבע עם', 'שש עם', 'חמש עם'];
const activeImageHashes = new Set();

// Fixes HTML gibberish like &#x27; from Kan's website
function decodeHtml(html) {
    if (!html) return '';
    return html.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// Escapes special characters strictly for XML injection
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
    return `${dateParts[2]}${dateParts[1].padStart(2, '0')}${dateParts[0].padStart(2, '0')}${timeParts[0].padStart(2, '0')}${timeParts[1].padStart(2, '0')}${timeParts[2].padStart(2, '0')} +0000`;
}

// --- THE BULLETPROOF TITLE PARSER ---
function parseShowMetadata(rawTitle, category) {
    let showTitle = rawTitle;
    let episodeName = "";
    let seasonNum = "";
    let episodeNum = "";

    if (category !== 'Series') return { showTitle, episodeName, seasonNum, episodeNum };

    // Find Explicit Season (עונה 3)
    const sMatch = rawTitle.match(/עונה\s*(\d+)/);
    if (sMatch) seasonNum = sMatch[1];

    // Find Explicit Episode (פרק 2) or Implicit ( - 6)
    const eMatch = rawTitle.match(/פרק\s*(\d+)/);
    if (eMatch) {
        episodeNum = eMatch[1];
    } else {
        const numMatch = rawTitle.match(/[-–:]\s*(\d+)[\.\s]*$/) || rawTitle.match(/[-–:]\s*(\d+)\./);
        if (numMatch) episodeNum = numMatch[1];
    }

    // Split Show Name from Subtitle
    const separatorIndex = rawTitle.search(/[-–:]/);
    if (separatorIndex !== -1) {
        showTitle = rawTitle.substring(0, separatorIndex).trim();
        episodeName = rawTitle.substring(separatorIndex + 1).trim();
    }

    // Strip dangling season numbers from Show Name (e.g. "טהרן 2" -> "טהרן")
    const implicitSeasonMatch = showTitle.match(/^(.+?)\s+(\d+)$/);
    if (implicitSeasonMatch) {
        showTitle = implicitSeasonMatch[1].trim();
        if (!seasonNum) seasonNum = implicitSeasonMatch[2]; // Captures the '2' as the season!
    }

    // Default to Season 1 if an episode exists
    if (episodeNum && !seasonNum) seasonNum = "1";

    return { showTitle, episodeName, seasonNum, episodeNum };
}

async function processImage(url) {
    if (!url) return null;
    
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}.jpg`;
    activeImageHashes.add(filename); // Mark as VIP

    const pathLandscape = path.join(DIR_LANDSCAPE, filename);

    if (!fs.existsSync(pathLandscape)) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Clean, borderless landscape resizing (Plex handles the cropping naturally)
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

// Deletes un-used images
function cleanupOrphans() {
    console.log(`[Kan 11] Running Zero-Bloat Orphan Cleanup...`);
    let deletedCount = 0;
    if (fs.existsSync(DIR_LANDSCAPE)) {
        const files = fs.readdirSync(DIR_LANDSCAPE);
        files.forEach(file => {
            if (file.endsWith('.jpg') && !activeImageHashes.has(file)) {
                fs.unlinkSync(path.join(DIR_LANDSCAPE, file));
                deletedCount++;
            }
        });
    }
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
                let decodedTitle = decodeHtml(titleMatch[1].trim());
                let decodedDesc = descMatch ? decodeHtml(descMatch[1].trim()).replace(/<[^>]*>?/gm, '') : '';
                
                let img = imgMatch ? imgMatch[1] : '';
                if (img) {
                    img = img.split('?')[0];
                    if (!img.startsWith('http')) img = 'https://www.kan.org.il' + img;
                    img = img.replace('https://mobapi.kan.org.il', 'https://www.kan.org.il');
                }

                if (!uniquePrograms.has(startUtc)) {
                    uniquePrograms.set(startUtc, { start: startUtc, rawTitle: decodedTitle, desc: decodedDesc, rawIcon: img });
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
        let isNews = newsKeywords.some(keyword => item.rawTitle.includes(keyword));
        if (isNews) category = 'News';
        else if (item.rawTitle.includes('סרט')) category = 'Movie';

        // MAGIC HAPPENS HERE
        const { showTitle, episodeName, seasonNum, episodeNum } = parseShowMetadata(item.rawTitle, category);

        const finalIconUrl = await processImage(item.rawIcon);

        perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Kan 11">\n`;
        perfectXml += `    <title lang="he">${escapeXml(showTitle)}</title>\n`;
        
        // Put the episode name (e.g. "עונה 3 - פרק 2") as the subtitle
        if (episodeName) perfectXml += `    <sub-title lang="he">${escapeXml(episodeName)}</sub-title>\n`;
        
        if (item.desc) perfectXml += `    <desc lang="he">${escapeXml(item.desc)}</desc>\n`;
        perfectXml += `    <category lang="en">${category}</category>\n`;
        
        // Smart Episode Numbering
        if (category !== 'Movie') {
            if (episodeNum) {
                perfectXml += `    <episode-num system="onscreen">S${seasonNum}E${episodeNum}</episode-num>\n`;
            } else {
                perfectXml += `    <episode-num system="original-air-date">${airDate}</episode-num>\n`;
            }
        }
        
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
