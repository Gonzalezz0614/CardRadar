const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/scout', async (req, res) => {
  const { query } = req.body;
  
  try {
    const results = await scrapeEbay(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function scrapeEbay(query) {
  const searchQuery = encodeURIComponent(query);
  
  // Get sold listings for market value
  const soldUrl = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}&LH_Sold=1&LH_Complete=1&_sacat=0`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const soldResponse = await axios.get(soldUrl, { headers });
  const $sold = cheerio.load(soldResponse.data);
  headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };
  const soldPrices = [];
  $sold('.s-item__price').each((i, el) => {
    const priceText = $sold(el).text().replace(/[^0-9.]/g, '');
    const price = parseFloat(priceText);
    if (price > 1) soldPrices.push(price);
  });

  if (soldPrices.length === 0) {
    throw new Error('No sold listings found for this card');
  }

  const marketValue = soldPrices.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(soldPrices.length, 10);

  // Get active listings
  const activeUrl = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}&LH_BIN=1&_sacat=0`;
  const activeResponse = await axios.get(activeUrl, { headers });
  const $active = cheerio.load(activeResponse.data);

  const listings = [];
  $active('.s-item').each((i, el) => {
    if (i === 0) return; // skip first ghost item
    const title = $active(el).find('.s-item__title').text();
    const priceText = $active(el).find('.s-item__price').text().replace(/[^0-9.]/g, '');
    const price = parseFloat(priceText);
    const link = $active(el).find('.s-item__link').attr('href');
    
    if (price > 1 && title && link) {
      const discount = Math.round((1 - price / marketValue) * 100);
      listings.push({ title, price, link, discount });
    }
  });

  listings.sort((a, b) => b.discount - a.discount);

  return {
    query,
    marketValue: Math.round(marketValue * 100) / 100,
    soldCount: soldPrices.length,
    listings: listings.slice(0, 20)
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CardRadar running on port ${PORT}`));
