const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

http.createServer(function (req, res) {
  let url = req.url.split('?')[0];
  try { url = decodeURIComponent(url); } catch (e) { res.writeHead(400); res.end(); return; }
  if (url === '/' || url === '') url = '/index.html';
  const resolved = path.resolve(ROOT, '.' + url);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end(); return;
  }
  fs.stat(resolved, function (err, stat) {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    fs.createReadStream(resolved).pipe(res);
  });
}).listen(3000, '0.0.0.0', function () { console.log('ok'); });