import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

async function run() {
  try {
    const res = await fetch('https://www.22biqu.com/biqu41440/2/', {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let html = iconv.decode(buf, 'gbk');
    const $ = cheerio.load(html);
    
    console.log("section-list eq(1) a count:", $('.section-list').eq(1).find('a').length);
    console.log("section-list:eq(1) a count:", $('.section-list:eq(1) a').length);
    console.log("indexselect count:", $('#indexselect').length);
    console.log("indexselect html:", $('#indexselect').html());
    
    // Let's see how many pages indexselect has
    const pages: string[] = [];
    $('#indexselect option').each((i, el) => {
      pages.push($(el).attr('value') || '');
    });
    console.log("Pages:", pages);
  } catch (e) {
    console.error(e);
  }
}
run();
