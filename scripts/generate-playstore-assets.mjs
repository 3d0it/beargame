import { mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { stat } from 'node:fs/promises';
import { chromium } from 'playwright';

const WEB_ROOT = join(process.cwd(), 'web');
const OUT_DIR = join(process.cwd(), 'assets', 'playstore');

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
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0] || '/');
  const candidate = decoded === '/' ? '/index.html' : decoded;
  const resolved = normalize(candidate).replace(/^(\.\.[/\\])+/, '');
  return join(WEB_ROOT, resolved);
}

function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const filePath = safePath(req.url || '/');
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const contentType = CONTENT_TYPES[extname(filePath)] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('content-type', contentType);
      createReadStream(filePath).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Cannot determine static server address'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => {
              if (err) closeReject(err);
              else closeResolve();
            });
          })
      });
    });
  });
}

async function capturePhoneScreenshots(page, baseUrl) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#startMatchBtn');
  await page.screenshot({
    path: join(OUT_DIR, 'phone-screenshot-01-start.png')
  });

  await page.click('#startMatchBtn');
  await page.waitForFunction(() => {
    const gameScreen = document.querySelector('#gameScreen');
    return gameScreen && !gameScreen.classList.contains('is-hidden');
  });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: join(OUT_DIR, 'phone-screenshot-02-game.png')
  });
}

async function captureFeatureGraphic(page, baseUrl) {
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(
    `
<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        font-family: "Palatino Linotype", "Book Antiqua", "Times New Roman", serif;
      }
      body {
        background:
          radial-gradient(circle at 15% 20%, rgba(255, 247, 229, 0.6), transparent 45%),
          radial-gradient(circle at 85% 80%, rgba(190, 151, 92, 0.2), transparent 45%),
          linear-gradient(160deg, #f6ecd7, #e5d5bb);
        color: #2d241b;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .banner {
        width: 980px;
        height: 456px;
        border: 3px solid rgba(74, 53, 33, 0.45);
        border-radius: 24px;
        background:
          linear-gradient(178deg, rgba(248, 237, 213, 0.95), rgba(231, 213, 180, 0.92));
        box-shadow: 0 14px 28px rgba(43, 30, 18, 0.15);
        display: grid;
        grid-template-columns: 250px 1fr;
        gap: 28px;
        align-items: center;
        padding: 34px 42px;
      }
      .icon {
        width: 220px;
        height: 220px;
      }
      .title {
        margin: 0;
        font-size: 62px;
        line-height: 1.02;
      }
      .subtitle {
        margin: 14px 0 0;
        font-size: 28px;
        color: #56483b;
      }
    </style>
  </head>
  <body>
    <section class="banner">
      <img class="icon" src="${baseUrl}/icon-512.svg" alt="" />
      <div>
        <h1 class="title">Gioco dell'Orso</h1>
        <p class="subtitle">Strategia alpina tra orso e cacciatori</p>
      </div>
    </section>
  </body>
</html>
`,
    { waitUntil: 'load' }
  );

  await page.screenshot({
    path: join(OUT_DIR, 'feature-graphic-1024x500.png')
  });
}

async function captureHiResIcon(page, baseUrl) {
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(
    `
<!doctype html>
<html>
  <body style="margin:0;background:#f6ecd7;">
    <img src="${baseUrl}/icon-512.svg" width="512" height="512" alt="" />
  </body>
</html>
`,
    { waitUntil: 'load' }
  );

  await page.screenshot({
    path: join(OUT_DIR, 'icon-512.png')
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startStaticServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();

  try {
    await capturePhoneScreenshots(page, server.baseUrl);
    await captureFeatureGraphic(page, server.baseUrl);
    await captureHiResIcon(page, server.baseUrl);
    console.log(`Play Store assets generated in: ${OUT_DIR}`);
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
