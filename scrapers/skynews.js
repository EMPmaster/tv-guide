// scrapers/skynews.js
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// --- FOLDER ARCHITECTURE ---
const XML_DIR = path.join(__dirname, '../xml');
if (!fs.existsSync(XML_DIR)) {
    fs.mkdirSync(XML_DIR, { recursive: true });
}

const OUTPUT_FILE = path.join(XML_DIR, 'skynews.xml');

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

async function buildGuide() {
    console.log(`[Sky News] Fetching schedule from TVGuide.co.uk...`);
    try {
        const url = 'https://www.tvguide.co.uk/channel/sky-news';
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        let programs = [];

        // 1. Scrape the DOM
        $('.js-schedule').each((index, element) => {
            const startTimeISO = $(element).attr('data-date');
            const title = $(element).find('a.font-semibold').text().trim();
            const description = $(element).find('.hidden.md\\:block').text().trim();
            const image = $(element).find('img').attr('src');

            if (startTimeISO && title) {
                programs.push({
                    title: title,
                    desc: description || 'No description available.',
                    image: image || '',
                    startIso: startTimeISO
                });
            }
        });

        console.log(`[Sky News] Successfully scraped ${programs.length} shows.`);

        // 2. Build the XML
        let perfectXml = `<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="Sky News Scraper">\n`;
        perfectXml += `  <channel id="Sky News">\n    <display-name>Sky News</display-name>\n    <icon src="https://static-cdn.jtvnw.net/jtv_user_pictures/ed4284f7-da47-4ad3-9f0c-b091d28212b1-profile_banner-480.png" />\n  </channel>\n`;

        for (let i = 0; i < programs.length; i++) {
            const item = programs[i];
            const startXml = formatXMLTVDate(item.startIso);
            
            // Calculate stop time by looking at the next show
            let stopXml;
            if (i < programs.length - 1) {
                stopXml = formatXMLTVDate(programs[i + 1].startIso);
            } else {
                // For the very last show, just add 30 minutes to the start time
                const lastDate = new Date(item.startIso);
                lastDate.setMinutes(lastDate.getMinutes() + 30);
                stopXml = formatXMLTVDate(lastDate.toISOString());
            }

            perfectXml += `  <programme start="${startXml}" stop="${stopXml}" channel="Sky News">\n`;
            perfectXml += `    <title lang="en">${escapeXml(item.title)}</title>\n`;
            perfectXml += `    <desc lang="en">${escapeXml(item.desc)}</desc>\n`;
            perfectXml += `    <category lang="en">News</category>\n`;
            if (item.image) {
                perfectXml += `    <icon src="${escapeXml(item.image)}" />\n`;
            }
            perfectXml += `  </programme>\n`;
        }

        perfectXml += `</tv>`;
        
        // 3. Save the file
        fs.writeFileSync(OUTPUT_FILE, perfectXml, 'utf-8');
        console.log(`[Sky News] Successfully generated ${OUTPUT_FILE}`);

    } catch (error) {
        console.error(`[Sky News Error]`, error.message);
    }
}

buildGuide();
