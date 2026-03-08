const express = require('express');
const net = require('net');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

let cachedSpots = [];
let lastUpdate = null;
let connectionStatus = 'disconnected';

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

function parseSpotLine(line) {
  // 形式: DX de JA1XXX:  7074.0  JA2YYY  FT8  1234Z
  const match = line.match(/DX de\s+([A-Z0-9/]+):\s+(\d+\.?\d*)\s+([A-Z0-9/]+)\s+(.*?)\s+(\d{4})Z/i);
  if (!match) return null;
  
  const spotter = match[1].trim();
  const freqStr = match[2].trim();
  const dx = match[3].trim();
  const comment = match[4].trim();
  const time = match[5].substring(0,2) + ':' + match[5].substring(2,4);
  
  const freqKhz = parseFloat(freqStr);
  const band = freqToBand(freqKhz);
  
  let mode = '';
  if (/FT8/i.test(comment)) mode = 'FT8';
  else if (/FT4/i.test(comment)) mode = 'FT4';
  else if (/CW/i.test(comment)) mode = 'CW';
  else if (/SSB|USB|LSB/i.test(comment)) mode = 'SSB';
  else if (/RTTY/i.test(comment)) mode = 'RTTY';
  else if (/FM/i.test(comment)) mode = 'FM';
  else if (/AM/i.test(comment)) mode = 'AM';
  
  return {
    spotter, dx, frequency: freqStr, band, mode, comment, time,
    date: new Date().toISOString().split('T')[0],
    qth: '', qthName: '', entity: 'Japan', flag: '', source: 'j-cluster',
  };
}

function connectTelnet() {
  const client = new net.Socket();
  let buffer = '';
  let loginSent = false;
  
  connectionStatus = 'connecting';
  console.log('Connecting to J-Cluster Telnet...');
  
  client.connect(7300, 'dxc.j-cluster.com', () => {
    console.log('Connected to dxc.j-cluster.com:7300');
    connectionStatus = 'connected';
  });
  
  client.on('data', (data) => {
    buffer += data.toString();
    
    // ログインプロンプトが来たらコールサインを送信
    if (!loginSent && (buffer.includes('login:') || buffer.includes('call') || buffer.includes('>') || buffer.length > 50)) {
      setTimeout(() => {
        client.write('JA1ZLO\r\n');
        loginSent = true;
        console.log('Sent callsign: JA1ZLO');
      }, 500);
    }
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.includes('DX de')) {
        const spot = parseSpotLine(line);
        if (spot) {
          cachedSpots.unshift(spot);
          if (cachedSpots.length > 200) cachedSpots.pop();
          lastUpdate = new Date().toISOString();
        }
      }
    }
  });
  
  client.on('error', (err) => {
    console.error('Telnet error:', err.message);
    connectionStatus = 'error: ' + err.message;
  });
  
  client.on('close', () => {
    console.log('Connection closed, reconnecting in 10s...');
    connectionStatus = 'disconnected';
    setTimeout(connectTelnet, 10000);
  });
  
  client.on('timeout', () => {
    console.log('Connection timeout');
    client.destroy();
  });
  
  client.setTimeout(60000);
}

// 起動時に接続
connectTelnet();

app.get('/api/spots', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    spots: cachedSpots.slice(0, limit),
    count: cachedSpots.length,
    source: 'J-Cluster (Telnet)',
    connectionStatus,
    lastUpdate,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'J-Cluster Proxy (Telnet)',
    connectionStatus,
    spotsCount: cachedSpots.length,
    lastUpdate,
  });
});

app.listen(PORT, () => {
  console.log(`J-Cluster Proxy running on port ${PORT}`);
});
