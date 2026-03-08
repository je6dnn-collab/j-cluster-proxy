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
let debugLog = [];

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
  debugLog.unshift(`[${timestamp}] ${msg}`);
  if (debugLog.length > 50) debugLog.pop();
}

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
  else if (/FT4/i
