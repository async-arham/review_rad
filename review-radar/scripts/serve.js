/** Dependency-free local dev server for Review Radar. Gemini API needs `vercel dev`. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT) || 5500;
http.createServer((req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route.startsWith('/api/')) { res.writeHead(501, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Gemini needs Vercel. Run vercel dev or deploy to Vercel.' })); }
    const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end('Forbidden'); }
    if (file.includes(`${path.sep}scripts${path.sep}`) || file.includes(`${path.sep}data${path.sep}`) || path.basename(file).startsWith('.')) { res.writeHead(403); return res.end('Forbidden'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    });
  } catch { res.writeHead(400); res.end('Bad request'); }
}).on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is busy. Try: PORT=5600 npm start` : e.message); process.exit(1); })
  .listen(port, () => console.log(`Review Radar running at http://localhost:${port}`));
