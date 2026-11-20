// 渲染靜態圖：node still.mjs back,walk,upper [w] [h]
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const names = (process.argv[2] || 'back').split(',');
const W = +(process.argv[3] || 900), H = +(process.argv[4] || 1600);
mkdirSync('out', {recursive: true});
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: W, height: H}});
page.on('pageerror', (e) => console.error('page error', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(m.text().slice(0, 300)));
await page.goto(`file://${path.resolve('dist/index.html')}?capture=1&w=${W}&h=${H}`);
await page.waitForFunction(() => window.ready, null, {timeout: 120000});
for (const n of names) {
  const t0 = Date.now();
  await page.evaluate((n) => window.shot(n), n);
  await page.locator('#c').screenshot({path: `out/${n}.png`});
  if (process.env.MASK) { await page.evaluate((n) => window.shot(n, true), n); await page.locator('#c').screenshot({path: `out/${n}-bg.png`}); }
  console.log(n, Date.now() - t0, 'ms');
}
await browser.close();
