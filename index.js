const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS設定
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 周波数からバンドを判定
function freqToBand(freqKhz) {
  if (freqKhz >= 1800 && freqKhz <= 1913) return '1.9MHz';
  if (freqKhz >= 3500 && freqKhz <= 3687) return '3.5MHz';
  if (freqKhz >= 7000 && freqKhz <= 7200) return '7MHz';
  if (freqKhz >= 10100 && freqKhz <= 10150) return '10MHz';
  if (freqKhz >= 14000 && freqKhz <= 14350) return '14MHz';
  if (freqKhz >= 18068 && freqKhz <= 18168) return '18MHz';
  if (freqKhz >= 21000 && freqKhz <= 21450) return '21MHz';
  if (freqKhz >= 24890 && freqKhz <= 24990) return '24MHz';
  if (freqKhz >= 28000 && freqKhz <= 29700) return '28MHz';
  if (freqKhz >= 50000 && freqKhz <= 54000) return '50MHz';
  if (freqKhz >= 144000 && freqKhz <= 146000) return '144MHz';
  if (freqKhz >= 430000 && freqKhz <= 440000) return '430MHz';
  if (freqKhz >= 1200000 && freqKhz <= 1300000) return '1.2GHz';
  return 'Other';
}

// HTMLからスポットをパース
function parseQrvHtml(html) {
  const spots = [];
  const rowRegex = /<LineStart><!--(\d+)--><\/LineStart>(.*?)<LineEnd><!--\1--><\/LineEnd>/g;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[2];
    try {
      const dateMatch = rowHtml.match(/<Date>([^<]+)<\/Date>/i);
      const timeMatch = rowHtml.match(/<Time>([^<]+)<\/Time>/i);
      const freqMatch = rowHtml.match(/<Freq>([^<]+)<\/Freq>/i);
      const modeMatch = rowHtml.match(/<Mode>([^<]+)<\/Mode>/i);
      const qthMatch = rowHtml.match(/<Qth>([^<]*)<\/Qth>/i);
      const qthNameMatch = rowHtml.match(/<QthName>([^<]*)<\/QthName>/i);
      const commentsMatch = rowHtml.match(/<Comments>([^<]*)<\/Comments>/i);
      const callToMatch = rowHtml.match(/<CallSignTo><a[^>]*>\s*([^<]+)<\/a><\/CallSignTo>/i);
      const callFromMatch = rowHtml.match(/<CallSignFrom><a[^>]*>\s*([^<]+)<\/a><\/CallSignFrom>/i);

      if (callToMatch && freqMatch) {
        const dx = callToMatch[1].trim();
        const freqStr = freqMatch[1].replace(/,/g, '').trim();
        const freqKhz = parseFloat(freqStr);
        const band = freqToBand(freqKhz);

        spots.push({
          spotter: callFromMatch ? callFromMatch[1].trim() : '',
          dx: dx,
          frequency: freqStr,
          band: band,
          mode: modeMatch ? modeMatch[1].trim() : '',
          comment: commentsMatch ? commentsMatch[1].trim() : '',
          time: timeMatch ? timeMatch[1].trim() : '',
          date: dateMatch ? dateMatch[1].trim() : '',
          qth: qthMatch ? qthMatch[1].trim() : '',
          qthName: qthNameMatch ? qthNameMatch[1].trim() : '',
          entity: 'Japan',
          flag: '',
          source: 'j-cluster',
        });
      }
    } catch (e) {
      // パースエラーは無視
    }
  }
  return spots;
}

// メインAPI
app.get('/api/spots', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en;q=0.9',
    };

    // Step 1: トップページにアクセスしてViewStateとCookieを取得
    const topRes = await fetch('https://qrv.jp/', { headers });
    const topHtml = await topRes.text();
    const cookies = topRes.headers.get('set-cookie') || '';
    const sessionCookie = cookies.split(';')[0];

    const viewStateMatch = topHtml.match(/name="__VIEWSTATE"[^>]*value="([^"]+)"/);
    const eventValidationMatch = topHtml.match(/name="__EVENTVALIDATION"[^>]*value="([^"]+)"/);
    const viewStateGeneratorMatch = topHtml.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"/);

    if (!viewStateMatch) {
      throw new Error('Could not extract __VIEWSTATE');
    }

    // Step 2: POSTリクエストで最新100を選択
    const formData = new URLSearchParams();
    formData.append('__EVENTTARGET', 'ctl12');
    formData.append('__EVENTARGUMENT', '');
    formData.append('__VIEWSTATE', viewStateMatch[1]);
    formData.append('__VIEWSTATEGENERATOR', viewStateGeneratorMatch ? viewStateGeneratorMatch[1] : '');
    formData.append('__EVENTVALIDATION', eventValidationMatch ? eventValidationMatch[1] : '');

    const dataRes = await fetch('https://qrv.jp/', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': sessionCookie,
        'Referer': 'https://qrv.jp/',
      },
      body: formData.toString(),
    });

    const html = await dataRes.text();
    const spots = parseQrvHtml(html);

    res.json({
      spots: spots.slice(0, limit),
      count: spots.length,
      source: 'J-Cluster (qrv.jp)',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(500).json({
      spots: [],
      count: 0,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ヘルスチェック
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'J-Cluster Proxy' });
});

app.listen(PORT, () => {
  console.log(`J-Cluster Proxy running on port ${PORT}`);
});
