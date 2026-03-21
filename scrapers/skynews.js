// scrapers/skynews.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const sharp = require('sharp'); // Remember, sharp is already in your package.json!

// --- CLEAN FOLDER ARCHITECTURE ---
const XML_DIR = path.join(__dirname, '../xml');
const IMAGES_DIR = path.join(__dirname, '../images/skynews');
const DIR_ORIGINAL = path.join(IMAGES_DIR, 'original');
const DIR_LANDSCAPE = path.join(IMAGES_DIR, 'landscape');

// The base URL where your images are publicly served from GitHub
const IMAGES_BASE_URL = 'https://raw.githubusercontent.com/EMPmaster/tv-guide/main/images/skynews/landscape';

[XML_DIR, IMAGES_DIR, DIR_ORIGINAL, DIR_LANDSCAPE].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const OUTPUT_FILE = path.join(XML_DIR, 'skynews.xml'); 
const activeImageHashes = new Set();

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

// Converts ISO format (2026-03-21T06:00:00.000Z) to XMLTV format (20260321060000 +0000)
function formatXMLTVDate(isoString) {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

// --- IMAGE PROCESSING (Original & Landscape) ---
async function processImage(url) {
    if (!url) return null;
    
    // Create a unique hash for the image filename
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}.jpg`;
    activeImageHashes.add(filename); // Mark as VIP (Do not delete)

    const pathOriginal = path.join(DIR_ORIGINAL, filename);
    const pathLandscape = path.join(DIR_LANDSCAPE, filename);

    // Only download and process if we don't already have it
    if (!fs.existsSync(pathLandscape) || !fs.existsSync(pathOriginal)) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // 1. Save Original
            if (!fs.existsSync(pathOriginal)) {
                fs.writeFileSync(pathOriginal, buffer);
            }

            // 2. Save Resized Landscape
            if (!fs.existsSync(pathLandscape)) {
                await sharp(buffer)
                    .resize(800, null, { withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(pathLandscape);
            }

            console.log(`[Sky News] Downloaded & Processed: ${filename}`);
        } catch (err) {
            console.error(`[Sky News Error] Failed to process image ${url} - ${err.message}`);
            return null;
        }
    }
    return `${IMAGES_BASE_URL}/${filename}`;
}

// Deletes un-used images from both original and landscape folders
function cleanupOrphans() {
    console.log(`[Sky News] Running Zero-Bloat Orphan Cleanup...`);
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
    console.log(`[Sky News] Cleanup complete. Deleted ${deletedCount} orphaned files.`);
}

// --- THE MAIN SCRAPER ---
async function buildGuide() {
    console.log(`[Sky News] Fetching 3-Day schedule from TVGuide.co.uk...`);
    try {
        let uniquePrograms = new Map();

        // Loop for 3 days (0 = Today, 1 = Tomorrow, 2 = Day After)
        for (let i = 0; i < 3; i++) {
            let targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + i);
            
            let yyyy = targetDate.getFullYear();
            let mm = String(targetDate.getMonth() + 1).padStart(2, '0');
            let dd = String(targetDate.getDate()).padStart(2, '0');
            
            // Format: ?date=2026-03-21
            let fetchUrl = `https://www.tvguide.co.uk/channel/sky-news?date=${yyyy}-${mm}-${dd}`;
            
            const response = await fetch(fetchUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const html = await response.text();
            const $ = cheerio.load(html);

            // Scrape the DOM
            $('.js-schedule').each((index, element) => {
                const startTimeISO = $(element).attr('data-date');
                const title = $(element).find('a.font-semibold').text().trim();
                const description = $(element).find('.hidden.md\\:block').text().trim();
                const image = $(element).find('img').attr('src');

                if (startTimeISO && title) {
                    // Use a Map to ensure we don't duplicate shows that cross the midnight boundary
                    uniquePrograms.set(startTimeISO, {
                        title: title,
                        desc: description || 'No description available.',
                        rawIcon: image || '',
                        startIso: startTimeISO
                    });
                }
            });
        }

        // Convert Map to an Array and Sort chronologically
        let programs = Array.from(uniquePrograms.values()).sort((a, b) => {
            return new Date(a.startIso) - new Date(b.startIso);
        });

        console.log(`[Sky News] Successfully scraped ${programs.length} total shows.`);

        // --- BUILD XML ---
        let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Sky News Scraper">\n`;
        perfectXml += `  <channel id="Sky News">\n    <display-name>Sky News</display-name>\n    <icon src="https://static-cdn.jtvnw.net/jtv_user_pictures/ed4284f7-da47-4ad3-9f0c-b091d28212b1-profile_banner-480.png" />\n  </channel>\n`;

        for (let i = 0; i < programs.length; i++) {
            const item = programs[i];
            const startXml = formatXMLTVDate(item.startIso);
            
            // Calculate stop time by looking at the next show across the full 3-day array
            let stopXml;
            if (i < programs.length - 1) {
                stopXml = formatXMLTVDate(programs[i + 1].startIso);
            } else {
                // For the very last show of Day 3, default to 30 mins
                const lastDate = new Date(item.startIso);
                lastDate.setMinutes(lastDate.getMinutes() + 30);
                stopXml = formatXMLTVDate(lastDate.toISOString());
            }

            // Process the image through Sharp!
            const finalIconUrl = await processImage(item.rawIcon);

            perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Sky News">\n`;
            perfectXml += `    <title lang="en">${escapeXml(item.title)}</title>\n`;
            perfectXml += `    <desc lang="en">${escapeXml(item.desc)}</desc>\n`;
            perfectXml += `    <category lang="en">News</category>\n`;
            if (finalIconUrl) {
                perfectXml += `    <icon src="${escapeXml(finalIconUrl)}" />\n`;
            }
            perfectXml += `  </programme>\n`;
        }

        perfectXml += `</tv>`;
        
        fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
        console.log(`[Sky News] Successfully generated ${OUTPUT_FILE}`);
        
        // Run cleanup to delete any old images from 4 days ago
        cleanupOrphans();

    } catch (error) {
        console.error(`[Sky News Fatal Error]`, error.message);
    }
}

buildGuide();
