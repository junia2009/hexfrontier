// テストの「強さ」を測る。故障を機械的に注入して、何割で落ちるかを数える。
//
//   npm run mutate              50件(既定)
//   node scripts/mutate.mjs 20  件数を指定
//   node scripts/mutate.mjs 20 --seed=7     選び方を変える
//   node scripts/mutate.mjs --file=src/rules/board.js  1ファイルに絞る
//
// なぜ到達率だけでは足りないか:
//   到達率(テストが何行を読むか)はテストの**上限**であって、強さではない。
//   読まれてはいるが何も確かめていない行は、到達率では緑に見える。
//   実際 `board-click.js` はテストを11本足した直後でも、上限の判定
//   (2つまで溜める)を壊しても誰も落ちなかった。
//   目で読んで見つけられるものではないので、機械に壊させる。
//
// 注入するのは比較と論理のひっくり返しだけ。文字列やコメントの中を壊すと
// 「テストの問題ではない壊れかた」になるので、引用符を含む行は避ける。
//
// 見逃し(生存)は、そのまま穴とは限らない。4種類に分かれる:
//   - 守られていない隙間  → テストを足す価値がある
//   - 演出・描画・姿勢    → 目で見る領域。縛る価値が薄い
//   - CPU の重みづけ      → 値を固定すると調整できなくなる
//   - 等価変異            → 振る舞いが変わらない。どんなテストでも捕まえられない
// 出力の一覧は、この仕分けを人がやるための材料。

import { execSync } from 'node:child_process';
import {
  existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (p) => relative(ROOT, p).split('\\').join('/');

// **`npm test` をそのまま使ってはいけない。**
// sw.js のキャッシュ名には全配信物の中身のハッシュが入っているので、
// src/ の1文字を変えるだけで test/sw-precache.test.js が必ず落ちる。
// それを「捕獲」と数えると**何を壊しても100%**になる(実際に一度そうなった)。
// 測っているのがテストの強さではなく「ファイルが変わった」という事実になる。
const SKIP_TESTS = ['sw-precache'];
const testCmd = () => {
  const files = readdirSync(join(ROOT, 'test'))
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !SKIP_TESTS.some((s) => f.includes(s)))
    .map((f) => `test/${f}`);
  return `node --test ${files.join(' ')}`;
};

// 置き換えの型。左を右にする
const OPS = [
  [' === ', ' !== '], [' !== ', ' === '],
  [' >= ', ' > '], [' <= ', ' < '], [' > ', ' >= '], [' < ', ' <= '],
  [' && ', ' || '], [' || ', ' && '],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const srcOf = () => {
  const src = {};
  for (const p of walk(join(ROOT, 'src'))) src[p] = readFileSync(p, 'utf8');
  return src;
};

const depsOf = (src, body, path) => {
  const out = new Set();
  for (const m of body.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)) {
    const t = m[1] || m[2];
    if (!t.startsWith('.')) continue;
    const n = join(dirname(path), t);
    if (src[n]) out.add(n);
  }
  return out;
};

// テストから辿れるファイルだけを対象にする。辿れないファイルは何を壊しても
// 落ちないに決まっていて、測る意味がない(それは到達率の話になる)
function reachable(src) {
  const reach = new Set();
  const stack = [];
  for (const f of readdirSync(join(ROOT, 'test'))) {
    if (!f.endsWith('.js')) continue;
    const p = join(ROOT, 'test', f);
    stack.push(...depsOf(src, readFileSync(p, 'utf8'), p));
  }
  while (stack.length) {
    const p = stack.pop();
    if (reach.has(p)) continue;
    reach.add(p);
    stack.push(...[...depsOf(src, src[p], p)].filter((d) => !reach.has(d)));
  }
  return reach;
}

// 注入できる場所を数える。1行に対象の演算子が1つだけあるときに限る
// (2つ以上あると、どれを壊したのかが曖昧になる)
function sites(src, files) {
  const out = [];
  for (const p of files) {
    src[p].split('\n').forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (/['"`]/.test(line)) return;
      for (const [from, to] of OPS) {
        if (line.split(from).length - 1 === 1) out.push({ p, i, from, to });
      }
    });
  }
  return out;
}

// --- 注入して1回テストする。**何があっても必ず書き戻す** ---
// 途中で止めると壊れたファイルが残り、それを「自分の変更」と勘違いして
// コミットしかねない(実際、停止フックが3回それを拾った)。
//
// **シグナルハンドラでは復元できない。** この工程は最初から最後まで同期で、
// execSync の中で止まっている時間がほとんどなので、event loop が回らず
// SIGINT / SIGTERM が配送されない(handler を書いても呼ばれないまま
// 次の注入へ進む)。kill -9 なら猶予すら無い。
//
// なので、**壊す前に控えをディスクに書く**。次に起動したとき控えが
// 残っていたら、何をする前にまずそれを書き戻す。これなら強制終了でも、
// 電源が落ちても、次の1回で必ず元に戻る。
const PENDING = fileURLToPath(new URL('../.mutate-pending.json', import.meta.url));

function recover() {
  if (!existsSync(PENDING)) return;
  const { p, orig } = JSON.parse(readFileSync(PENDING, 'utf8'));
  writeFileSync(p, orig);
  rmSync(PENDING);
  console.error(`前回の中断ぶんを書き戻した: ${rel(p)}`);
}

const restore = () => {
  if (!existsSync(PENDING)) return;
  const { p, orig } = JSON.parse(readFileSync(PENDING, 'utf8'));
  writeFileSync(p, orig);
  rmSync(PENDING);
};

function survives(m, cmd) {
  const orig = readFileSync(m.p, 'utf8');
  const lines = orig.split('\n');
  lines[m.i] = lines[m.i].replace(m.from, m.to);
  // 壊す前に控えを置く。ここが先でないと、この直後に落ちたら戻せない
  writeFileSync(PENDING, JSON.stringify({ p: m.p, orig }));
  try {
    writeFileSync(m.p, lines.join('\n'));
    try {
      execSync(cmd, { cwd: ROOT, stdio: 'pipe', timeout: 300000 });
      return true; // テストが通ってしまった = 捕まえられなかった
    } catch {
      return false;
    }
  } finally {
    restore();
  }
}

// --- 対照実験: 捕獲率が本物かを毎回確かめる ---
// テストから辿れないファイルを壊す。ここが「捕獲」と出たら、
// 落ちている理由がテストの中身ではないということ(前科あり)。
function control(src, unreached, cmd) {
  const cand = sites(src, unreached).find(Boolean);
  if (!cand) return { ok: true, note: '辿れないファイルが無いので省略' };
  const ok = survives(cand, cmd);
  return { ok, note: `${rel(cand.p)}:${cand.i + 1} ${cand.from.trim()} → ${cand.to.trim()}` };
}

function main() {
  recover();
  const args = process.argv.slice(2);
  const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 50);
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const fileArg = args.find((a) => a.startsWith('--file='));
  let s = Number(seedArg?.slice(7) ?? 12345) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

  const src = srcOf();
  const reach = reachable(src);
  const all = Object.keys(src);
  let files = all.filter((p) => reach.has(p));
  if (fileArg) {
    const want = fileArg.slice(7);
    files = files.filter((p) => rel(p) === want || rel(p).endsWith('/' + want));
    if (!files.length) {
      console.error(`${want} はテストから辿れないか、存在しない`);
      process.exit(1);
    }
  }
  const cmd = testCmd();

  const unreached = all.filter((p) => !reach.has(p));
  console.error('対照実験(辿れない場所を壊す。ここが捕獲なら測定器が壊れている)…');
  const ctl = control(src, unreached, cmd);
  if (!ctl.ok) {
    console.error(`✗ 対照実験が捕獲になった — ${ctl.note}`);
    console.error('  テストの強さ以外の理由で落ちている。SKIP_TESTS を見直すこと。');
    process.exit(1);
  }
  console.error(`✓ 生存(期待どおり) — ${ctl.note}`);

  const pool = sites(src, files);
  console.error(`対象ファイル ${files.length} / 注入できる場所 ${pool.length}`);

  const picked = [];
  const used = new Set();
  while (picked.length < n && used.size < pool.length) {
    const k = Math.floor(rnd() * pool.length);
    if (used.has(k)) continue;
    used.add(k);
    picked.push(pool[k]);
  }

  const survivors = [];
  let caught = 0;
  for (const [i, m] of picked.entries()) {
    const alive = survives(m, cmd);
    if (alive) survivors.push(`${rel(m.p)}:${m.i + 1}  ${m.from.trim()} → ${m.to.trim()}`);
    else caught += 1;
    console.error(`${i + 1}/${picked.length} ${alive ? '生存' : '捕獲'}  ${rel(m.p)}:${m.i + 1}`);
  }

  const rate = ((caught / picked.length) * 100).toFixed(0);
  console.log(`\n=== 故障注入 ${picked.length}件 ===`);
  console.log(`捕まえた ${caught}件 / 見逃した ${survivors.length}件  → 捕獲率 ${rate}%`);
  if (survivors.length) {
    console.log('\n見逃したもの(穴・演出・CPUの好み・等価変異のどれかを1件ずつ仕分ける):');
    for (const x of survivors) console.log('  ' + x);
  }
}

main();
