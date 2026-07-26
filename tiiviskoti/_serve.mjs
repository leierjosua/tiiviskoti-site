import {createServer} from 'http';
import {readFile} from 'fs';
createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  readFile('.' + p, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); }
    else { res.writeHead(200, {'Content-Type': 'text/html'}); res.end(d); }
  });
}).listen(8799, () => console.log('up on 8799'));
