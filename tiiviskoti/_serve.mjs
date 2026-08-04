import {createServer} from 'http';
import {readFile} from 'fs';
import {extname} from 'path';

/* _shared.js on ES-moduuli ja importoi pricing.mjs:n, joten selain vaatii
   oikean JavaScript-MIME-tyypin. Aiemmin kaikki tarjoiltiin text/html:nä,
   mikä estäisi moduulin latautumisen kokonaan. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  readFile('.' + p, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); }
    else { res.writeHead(200, {'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream'}); res.end(d); }
  });
}).listen(8799, () => console.log('up on 8799'));
