// 画面の回転で壊れたところの見張り。
// 実物の配置は Playwright でしか測れないが(E2E はリポジトリに入れない)、
// **壊れた原因そのものは静的に押さえられる**ので、ここで止める。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

// `.screen { ... }` の中身を取り出す
function ruleBody(css, selector) {
  const i = css.indexOf(`${selector} {`);
  assert.notEqual(i, -1, `${selector} が見つからない`);
  return css.slice(i, css.indexOf('}', i));
}

test('画面: 中央寄せは safe。はみ出したぶんに手が届かなくならない', () => {
  // **フレックスの中央寄せの罠。** 中身が画面より高いとき、ただの
  // center だと上下にはみ出したぶんがスクロールしても届かない場所へ行く。
  // 端末を横にすると選択パネルがこれに当たり、
  // **「ゲームを始める」ボタンに触れなくなっていた**(横 844x390 で実測)。
  // safe center は収まらないときだけ先頭寄せに切り替わる。
  const body = ruleBody(html, '.screen');
  assert.match(body, /align-items:\s*safe\s+center/, '.screen の縦中央寄せが safe でない');
  assert.match(body, /justify-content:\s*safe\s+center/, '.screen の横中央寄せが safe でない');
  // 先頭寄せに切り替わっても、スクロールできなければ届かない
  assert.match(body, /overflow-y:\s*auto/, '.screen がスクロールできない');
});

test('画面: モバイル判定は高さも見る', () => {
  // 幅だけで見ていたので、端末を横にすると 844px 幅になって条件から外れ、
  // スマホなのに机上向けの配置に切り替わっていた。縦に詰まった画面に
  // 縦長前提の配置が入るので収まらない(盤が 544x159 まで潰れていた)。
  const m = main.match(/matchMedia\((['"`])(.*?)\1\)/);
  assert.ok(m, 'モバイル判定の matchMedia が見つからない');
  const q = m[2];
  assert.match(q, /max-width/, '幅の条件がない');
  assert.match(q, /max-height/, '高さの条件がない(横向きのスマホを机上と誤判定する)');
});

test('画面: 2Dの盤は入れ物の大きさを見張る', () => {
  // 2D の描画ループは光るものが無ければ止まる(animLoop の hasPulse)。
  // resizeCanvas はそのループの中でしか呼ばれないので、
  // window の resize を取りこぼすとキャンバスの画素数だけ古いまま残り、
  // CSS に引き伸ばされて盤がゆがむ。端末の回転では、最終的な配置が
  // 決まる前に resize が飛ぶことがあり、dvh の変化では飛ばないこともある。
  // 3D は同じ理由で最初から ResizeObserver を使っている。
  assert.match(main, /new ResizeObserver\([\s\S]*?\.observe\(canvas\)/,
    '2D キャンバスに ResizeObserver が付いていない');
});

test('島の帯: iPhone の幅に収まる(ボタンの数・大きさ・札の長さ)', () => {
  // **実機で切れていた。** iPhone(393px)で「✕ 釣りをやめる」が画面の外へ
  // はみ出していた。実物の幅は Playwright でしか測れないが、はみ出した
  // 原因 ── ボタンの数・隙間・文字の札の長さ ── は静的に押さえられる。
  //
  // 下の見積もりは実測と突き合わせてある: 幅 375px のとき、右端は 365px
  // (この式がちょうど 365 を出す)。つまり式のほうを信じてよい。
  const i = html.indexOf('<div class="walk-top">');
  const bar = html.slice(i, html.indexOf('</div>', i));
  const icons = (bar.match(/<button/g) ?? []).length - 1;   // 文字の札1つを除く
  const body = ruleBody(html, '.walk-top');
  const btn = ruleBody(html, '.walk-top button');
  const gap = Number(body.match(/gap:\s*(\d+)px/)?.[1]);
  const pad = 10 * 2;                                        // 帯の左右の内側の余白
  // 文字の札の内側の余白(左右)。CSS から読む ── ここを詰めて収めたので、
  // 値を直書きすると、戻されたときに見積もりだけが古いまま通ってしまう
  const wide = Number(ruleBody(html, '.walk-top button.wide').match(/padding:\s*0\s+(\d+)px/)?.[1]);
  assert.ok(wide > 0, '文字の札の余白が読めない');
  assert.match(btn, /min-width:\s*44px/, 'アイコンのボタンが 44px を下回れる');
  assert.match(btn, /height:\s*44px/, 'アイコンのボタンの高さが 44px でない');

  // 上の帯に出る「✕ …」の札のうち、いちばん長いもの(釣り・弓・円卓で変わる)
  const labels = [...main.matchAll(/'(✕[^']*)'/g)].map((m) => [...m[1]].length);
  assert.ok(labels.length >= 3, '✕ の札が見つからない(取り出し方が古い)');
  const longest = Math.max(...labels);
  const row = icons * 44 + (icons + 1) * gap + pad + (longest * 13 + wide * 2);
  assert.ok(row <= 375, `上の帯が iPhone SE(375px)に収まらない: ${row}px `
    + `(アイコン ${icons}個・隙間 ${gap}px・いちばん長い札 ${longest}文字)`);
});
