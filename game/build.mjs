// Сборка: бандл JS + копирование HTML/CSS в dist и в assets Android-приложения
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const out = ['dist', '../android/app/src/main/assets/www'];
await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife',
  target: ['chrome80'], outfile: 'dist/game.js', legalComments: 'none',
});
for (const d of out) {
  mkdirSync(d, { recursive: true });
  for (const f of ['index.html', 'style.css']) copyFileSync(f, `${d}/${f}`);
  if (d !== 'dist') copyFileSync('dist/game.js', `${d}/game.js`);
}
console.log('OK', existsSync('dist/game.js'));
