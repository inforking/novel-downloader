import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import archiver from 'archiver';
import iconv from 'iconv-lite';
import { GoogleGenAI } from '@google/genai';

import { tmt } from 'tencentcloud-sdk-nodejs-tmt'



// 替换原有的 translateText 函数
async function translateText(text: string): Promise<string> {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  const region = process.env.TENCENT_REGION || 'ap-guangzhou';

  if (!secretId || !secretKey) {
    return "Error: TENCENT_SECRET_ID or TENCENT_SECRET_KEY is not set.";
  }

  const clientConfig = {
    credential: {
      secretId: secretId,
      secretKey: secretKey,
    },
    region: region,
    profile: {
      httpProfile: {
        endpoint: "tmt.tencentcloudapi.com",
      },
    },
  };

  const client = new tmt.v20180321.Client(clientConfig);

  try {
    // 调用文本翻译接口（这里使用 TextTranslate，适合短文本）
    // 如果翻译长文本，建议使用 TextTranslateBatch
    const params = {
      SourceText: text,
      Source: 'zh',           // 源语言：中文
      Target: 'en',           // 目标语言：英文
      ProjectId: 0,           // 项目ID，默认为0
    };
    const response = await client.TextTranslate(params);
    return response.TargetText || text;
  } catch (e: any) {
    console.error("Tencent Translation error:", e);
    return `[Translation Error: ${e.message}]\n\n${text}`;
  }
}

async function fetchWithEncoding(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const buffer = await res.arrayBuffer();
  const buf = Buffer.from(buffer);
  
  // Try to detect charset from content
  let html = buf.toString('utf-8');
  const charsetMatch = html.match(/<meta[^>]*charset=["']?([^"'>\s]+)/i);
  let charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
  
  if (charset.includes('gbk') || charset.includes('gb2312')) {
    html = iconv.decode(buf, 'gbk');
  }
  
  return html;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.post('/api/download', async (req, res) => {
    const { indexUrl, linkSelector, contentSelector, limit, translate } = req.body;

    if (!indexUrl || !linkSelector || !contentSelector) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // 1. Fetch index
      const indexHtml = await fetchWithEncoding(indexUrl);
      const $ = cheerio.load(indexHtml);

      const indexPages = new Set<string>();
      indexPages.add(indexUrl);
      
      $('#indexselect option, .indexselect option').each((i, el) => {
        const val = $(el).attr('value');
        if (val) {
          try {
            indexPages.add(new URL(val, indexUrl).href);
          } catch (e) {}
        }
      });

      const allLinks = new Set<string>();
      const links: { title: string, url: string }[] = [];

      for (const pageUrl of indexPages) {
        try {
          const pageHtml = pageUrl === indexUrl ? indexHtml : await fetchWithEncoding(pageUrl);
          const $page = cheerio.load(pageHtml);
          
          $page(linkSelector).each((i, el) => {
            const href = $page(el).attr('href');
            const title = $page(el).text().trim() || `Chapter ${links.length + 1}`;
            if (href) {
              try {
                const absoluteUrl = new URL(href, pageUrl).href;
                if (!allLinks.has(absoluteUrl)) {
                  allLinks.add(absoluteUrl);
                  links.push({ title, url: absoluteUrl });
                }
              } catch (e) {}
            }
          });
        } catch (e) {
          console.error(`Failed to fetch index page ${pageUrl}`, e);
        }
      }

      if (links.length === 0) {
        return res.status(404).json({ error: 'No chapters found with the provided selector.' });
      }

      // Set up ZIP stream
      res.attachment('novel.zip');
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.end();
      });
      archive.pipe(res);

      const maxChapters = limit ? Math.min(links.length, parseInt(limit)) : Math.min(links.length, 100);
      const chaptersToFetch = links.slice(0, maxChapters);

      const batchSize = 5;
      for (let i = 0; i < chaptersToFetch.length; i += batchSize) {
        const batch = chaptersToFetch.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (link, index) => {
          const actualIndex = i + index;
          
          let currentUrl: string | null = link.url;
          let fullTextContent = '';
          let pageNum = 1;
          const maxPages = 10; // Safety limit per chapter
          
          try {
            while (currentUrl && pageNum <= maxPages) {
              const chapHtml = await fetchWithEncoding(currentUrl);
              const $chap = cheerio.load(chapHtml);
              
              let contentHtml = $chap(contentSelector).html() || '';
              let textContent = contentHtml
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]+>/g, '') // strip other tags
                .replace(/&nbsp;/g, ' ')
                .trim();

              if (!textContent && pageNum === 1) {
                textContent = "Content not found with the provided selector.";
              }

              fullTextContent += (pageNum > 1 ? '\n\n' : '') + textContent;

              // Check for next page link (e.g., "下一页" or "下页")
              let nextPageUrl = null;
              $chap('a').each((_, el) => {
                const text = $chap(el).text().trim();
                if (text.includes('下一页') || text.includes('下页')) {
                  const href = $chap(el).attr('href');
                  // Ensure it's a pagination of the current chapter (contains '_')
                  if (href && href.includes('_')) {
                    nextPageUrl = new URL(href, currentUrl!).href;
                  }
                }
              });

              currentUrl = nextPageUrl;
              pageNum++;
            }

            if (translate) {
              fullTextContent = await translateText(fullTextContent);
            }

            return { link, actualIndex, textContent: fullTextContent };
          } catch (e: any) {
            return { link, actualIndex, textContent: `Error downloading chapter: ${e.message}` };
          }
        }));

        for (const res of results) {
          let safeTitle = res.link.title.replace(/[/\\?%*:|"<>]/g, '-');
          if (translate) {
            safeTitle = await translateText(safeTitle);
            safeTitle = safeTitle.replace(/[/\\?%*:|"<>]/g, '-').trim();
          }
          const fileName = `${String(res.actualIndex + 1).padStart(3, '0')} - ${safeTitle}.txt`;
          
          let fileContent = res.textContent;
          if (translate) {
            fileContent = `${safeTitle}\n\n${res.textContent}`;
          } else {
            fileContent = `${res.link.title}\n\n${res.textContent}`;
          }
          
          archive.append(fileContent, { name: fileName });
        }
      }

      await archive.finalize();

    } catch (error: any) {
      console.error('Download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'An error occurred during download' });
      } else {
        res.end();
      }
    }
  });

  app.post('/api/translate-local', async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Missing or invalid files array' });
    }

    try {
      res.attachment('translated_novel.zip');
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.end();
      });
      archive.pipe(res);

      const batchSize = 5;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (file) => {
          try {
            const translatedName = await translateText(file.name.replace(/\.[^/.]+$/, ""));
            const translatedContent = await translateText(file.content);
            return {
              name: `${translatedName.replace(/[/\\?%*:|"<>]/g, '-').trim()}.txt`,
              content: `${translatedName}\n\n${translatedContent}`
            };
          } catch (e: any) {
            return {
              name: file.name,
              content: `[Translation Error: ${e.message}]\n\n${file.content}`
            };
          }
        }));

        for (const r of results) {
          archive.append(r.content, { name: r.name });
        }
        
        // Small delay to help with rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await archive.finalize();
    } catch (error: any) {
      console.error('Local translation error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'An error occurred during translation' });
      } else {
        res.end();
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
