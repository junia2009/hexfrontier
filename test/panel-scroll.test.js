// 画面いっぱいのパネルが、ちゃんと流れるか(.panel-scroll)。
//
// **実機で詰んだ。** 盤まわりの画面を `rules-panel` の器で作ったのに、
// 中身を `.panel-scroll` で包まずに直に置いた。この器は
//
//     .rules-panel { max-height: 86dvh; overflow: hidden; }
//     .rules-panel > .panel-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
//
// という組みで、**流れるのは中の .panel-scroll だけ**。包みが無いと
// 入りきらないぶんは切り落とされ、いちばん下に置いた「← ゲーム設定へ」ごと
// 画面の外に出る ── 戻れない。
//
// **スクリーンショットでは気づけなかった。** 手元の 390×844 では最後まで
// 見えていて、実機(ブラウザの枠のぶん縦が短い)で初めて出た。だから絵では
// なく**組み立て**を見張る ── この器を使うなら包みも要る、という約束。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HTML = read('index.html');

// 中身を書いている側は main.js か render/ のどれか。**1か所に決め打ちしない**
// ── はじめ main.js だけ見ていて、rules-content.js で包んでいる
// あそびかたの画面を「包まれていない」と誤報した
const SOURCES = [
  ['src/main.js', read('src/main.js')],
  ...readdirSync(new URL('../src/render/', import.meta.url))
    .filter((f) => f.endsWith('.js'))
    .map((f) => [`src/render/${f}`, read(`src/render/${f}`)]),
];

// **包みは「class に書かれている」ことで見る。** ただの 'panel-scroll' を
// 探すと、巻き位置を覚える `querySelector('.panel-scroll')` まで拾って
// しまい、**包みを外しても落ちないテスト**になる(壊して確かめて気づいた)
const HAS_WRAP = /class="[^"]*\bpanel-scroll\b/;

// `<div ... class="... rules-panel ...">` から対応する </div> まで
function blockAt(html, from) {
  let depth = 0;
  for (let i = from; i < html.length; i += 1) {
    if (html.startsWith('<div', i)) depth += 1;
    else if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return html.slice(from, i + 6);
    }
  }
  return html.slice(from);
}

function rulesPanels() {
  const out = [];
  for (const m of HTML.matchAll(/<div[^>]*class="[^"]*\brules-panel\b[^"]*"[^>]*>/g)) {
    out.push({
      id: m[0].match(/id="([^"]+)"/)?.[1] ?? null,
      tag: m[0],
      body: blockAt(HTML, m.index),
    });
  }
  return out;
}

// その id を埋めている**関数の本体だけ**を切り出す。
//
// **窓を「前から N 文字」で取ってはいけない。** はじめ 2500 文字で
// 取っていたら関数をはみ出して隣の関数の panel-scroll を拾い、
// **わざと包みを外しても落ちないテスト**になっていた(壊して確かめて
// 気づいた。書いただけでは効いているか分からない)。
function bodyAt(src, idx) {
  const s = src.lastIndexOf('function ', idx);
  if (s < 0) return src.slice(idx, idx + 400);
  // **引数の `{` を本体と間違えない。** `function f(a, { b = 1 } = {}) {` は
  // 引数の側に波かっこがあり、素直に最初の `{` から数えると
  // 「本体は空」になる ── 実際そうなって、たどれているつもりで
  // 何もたどっていなかった。まず引数の `)` を閉じてから本体を探す
  let i = src.indexOf('(', s);
  for (let d = 0; i < src.length; i += 1) {
    if (src[i] === '(') d += 1;
    else if (src[i] === ')') { d -= 1; if (d === 0) break; }
  }
  i = src.indexOf('{', i);
  for (let d = 0; i < src.length; i += 1) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(s, i + 1); }
  }
  return src.slice(s);
}

function writerOf(id) {
  for (const [name, src] of SOURCES) {
    const at = src.indexOf(`getElementById('${id}')`);
    if (at >= 0) return { name, text: bodyAt(src, at) };
  }
  return null;
}

// その雛形の中身ぜんぶ。**呼び先を1段たどる** ── 雛形を別の関数が
// 返していることがある(あそびかたは rules-content.js、戦績は records.js)
function resolved(text) {
  const parts = [text];
  for (const m of text.matchAll(/\b([a-z]\w*Html)\s*\(/g)) {
    for (const [, src] of SOURCES) {
      const at = src.search(new RegExp(`function ${m[1]}\\b`));
      if (at >= 0) parts.push(bodyAt(src, at + 10));
    }
  }
  return parts.join('\n');
}

// 見ている器ぜんぶの、包みの出どころ(静的な markup か、書いている側か)
function panelsWithSource() {
  return rulesPanels().map((p) => {
    const src = HAS_WRAP.test(p.body)
      ? { name: 'index.html', text: p.body }
      : writerOf(p.id);
    return { ...p, src, text: src ? resolved(src.text) : '' };
  });
}

test('パネル: rules-panel の器は、必ず .panel-scroll を持つ', () => {
  const panels = panelsWithSource();
  assert.ok(panels.length >= 5, `器を ${panels.length} 個しか見つけられていない(探し方が壊れている)`);
  for (const p of panels) {
    assert.ok(p.src, `#${p.id ?? p.tag} を埋めるコードが見つからない`);
    assert.ok(HAS_WRAP.test(p.text),
      `#${p.id} が .panel-scroll で包まれていない(${p.src.name})`
      + ' ── 画面に入りきらないと下に届かなくなる');
  }
});

test('パネル: 戻り口は流れる中身の外に置く', () => {
  // **見出しと戻り口はパネルに直接置く。** 一緒に流してしまうと、
  // 下まで巻かないと戻れない ── 詰みはしないが、同じ不便になる
  for (const p of panelsWithSource()) {
    assert.match(p.text, /rules-close|rules-tabs|<h3>/,
      `#${p.id} に、流れない見出しか戻り口が無い`);
  }
});

test('パネル: 器の決めごとが CSS 側で崩れていない', () => {
  // ここが変わると上の約束の前提が消える。**変えるなら気づけるように**
  const css = HTML.replace(/\s+/g, ' ');
  assert.match(css, /\.rules-panel \{[^}]*overflow: hidden/,
    'rules-panel が切り落とさなくなった(なら panel-scroll は要らないかもしれない)');
  assert.match(css, /\.rules-panel > \.panel-scroll \{[^}]*overflow-y: auto/,
    'panel-scroll が流れなくなった');
  assert.match(css, /\.rules-panel > \.panel-scroll \{[^}]*min-height: 0/,
    'min-height: 0 が消えた ── フレックスの子が縮めず、パネルごと伸びる');
});
