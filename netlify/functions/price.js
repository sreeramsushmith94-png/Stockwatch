const https = require('https');

exports.handler = async function(event) {
  const { ticker, exchange } = event.queryStringParameters || {};
  if (!ticker || !exchange) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ticker or exchange' }) };
  }

  let yt = ticker.toUpperCase();
  if (exchange === 'NSE') yt = `${yt}.NS`;
  else if (exchange === 'BSE') yt = `${yt}.BO`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yt}?interval=1d&range=1y&includePrePost=false`;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });

    const r = data?.chart?.result?.[0];
    if (!r) return { statusCode: 404, body: JSON.stringify({ error: 'No data found' }) };

    const meta = r.meta;
    const closes = r.indicators?.quote?.[0]?.close || [];
    const timestamps = r.timestamp || [];
    const ltp = meta.regularMarketPrice || meta.previousClose;
    if (!ltp) return { statusCode: 404, body: JSON.stringify({ error: 'No price found' }) };

    const prev = meta.previousClose;
    const pct = (old, cur) => (old && cur && old !== 0) ? ((cur - old) / old * 100) : null;
    const d1 = prev ? pct(prev, ltp) : null;

    const getClose = daysAgo => {
      const target = Date.now() - daysAgo * 86400000;
      let best = null, bestDiff = Infinity;
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] == null) continue;
        const diff = Math.abs(timestamps[i] * 1000 - target);
        if (diff < bestDiff) { bestDiff = diff; best = closes[i]; }
      }
      return best;
    };

    const result = {
      ltp, d1,
      d1w: pct(getClose(7), ltp),
      d1m: pct(getClose(30), ltp),
      d6m: pct(getClose(180), ltp),
      d1y: pct(getClose(365), ltp),
      currency: ['NSE','BSE'].includes(exchange) ? 'INR' : 'USD'
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
