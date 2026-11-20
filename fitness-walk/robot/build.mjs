// 打包成單一 HTML（three.js 內嵌），可離線開啟
import {build} from 'esbuild';
import {writeFileSync, mkdirSync} from 'node:fs';
const r = await build({entryPoints: ['main.js'], bundle: true, format: 'iife', write: false, minify: true, logLevel: 'error'});
mkdirSync('dist', {recursive: true});
writeFileSync('dist/index.html', `<!doctype html><meta charset="utf-8"><title>Robot Walk</title>
<style>html,body{margin:0;background:#f5efe7;display:flex;justify-content:center;align-items:center;height:100%}canvas{max-height:100vh;max-width:100vw}</style>
<canvas id="c"></canvas><script>${r.outputFiles[0].text}</script>`);
console.log('built dist/index.html', (r.outputFiles[0].text.length / 1024).toFixed(0), 'KB');
