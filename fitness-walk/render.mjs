// 用無頭 Chromium 逐格渲染 index.html，再用 ffmpeg 合成 MP4 (含程式合成音效)
// 用法: node render.mjs [寬] [高] [fps] [只渲染這些秒數(逗號分隔，測試用)]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [W = 540, H = 960, FPS = 30] = process.argv.slice(2, 5).map(Number);
const only = process.argv[5]?.split(',').map(Number);
const DURATION = 10, WORKERS = 4;
const out = path.join(here, 'out');
const frames = path.join(out, 'frames');
if (!only) rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const url = `file://${here}/index.html?capture=1&w=${W}&h=${H}`;
const jobs = only ? only.map((t, i) => ({ i, t })) : Array.from({ length: DURATION * FPS }, (_, i) => ({ i, t: i / FPS }));

async function worker(id) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error', e.message));
  page.on('console', m => m.type() === 'error' && console.error(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.renderAt);
  if (id === 0 && !only) {
    const wav = await page.evaluate(() => window.renderAudioWav());
    writeFileSync(path.join(out, 'audio.wav'), Buffer.from(wav, 'base64'));
  }
  while (jobs.length) {
    const { i, t } = jobs.shift();
    const t0 = Date.now();
    const png = await page.evaluate(t => { window.renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, t);
    writeFileSync(path.join(frames, `${String(i).padStart(4, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`frame ${i} t=${t.toFixed(2)} ${(Date.now() - t0)}ms`);
  }
}
await Promise.all(Array.from({ length: only ? 1 : WORKERS }, (_, k) => worker(k)));
await browser.close();

if (!only) {
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, '%04d.png'), '-i', path.join(out, 'audio.wav'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    path.join(out, 'fitness-walk.mp4')], { stdio: 'inherit' });
  console.log('done ->', path.join(out, 'fitness-walk.mp4'));
}
