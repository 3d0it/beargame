import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'web');
const PORT = Number.parseInt(process.env.PORT || '4173', 10);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  const candidate = decoded === '/' ? '/index.html' : decoded;
  const resolved = normalize(candidate).replace(/^(\.\.[/\\])+/, '');
  return join(ROOT, resolved);
}

function send404(res) {
  res.statusCode = 404;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

const server = createServer(async (req, res) => {
  try {
    const filePath = safePath(req.url || '/');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) return send404(res);

    const contentType = CONTENT_TYPES[extname(filePath)] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    createReadStream(filePath).pipe(res);
  } catch {
    send404(res);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Static server listening on http://127.0.0.1:${PORT}`);
});
