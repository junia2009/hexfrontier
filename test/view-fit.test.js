// 構図を取り直すかどうかの判断。
// **端末を横から縦に戻すと画面がブルブル揺れてズレる**という報告の中身で、
// 原因は「高さが少し動くたびに構図を取り直していた」こと。
// 取り直しはカメラを置き直すので、呼ぶたびに寄り引きが起きる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPortrait, needsRefit, FIT_LIMITS } from '../src/view-fit.js';

// 端末の形(幅/高さ)
const 縦 = 390 / 844;   // 0.462
const 横 = 844 / 390;   // 2.164

test('構図: 縦と横を取り違えない', () => {
  assert.equal(isPortrait(縦, false), true, '縦持ちが縦構図にならない');
  assert.equal(isPortrait(横, true), false, '横持ちが横構図にならない');
});

test('構図: 境目に幅がある(くるくる回らない)', () => {
  // ここをまたぐと盤の見せ方が 90° 回る。境目ちょうどで少し揺れただけで
  // 回ってしまわないよう、入るときと出るときで線をずらしてある。
  const { TO_PORTRAIT, TO_LANDSCAPE } = FIT_LIMITS;
  assert.ok(TO_LANDSCAPE > TO_PORTRAIT, '境目に幅がない');
  // 幅のあいだでは、いまの構図をそのまま保つ
  const mid = (TO_PORTRAIT + TO_LANDSCAPE) / 2;
  assert.equal(isPortrait(mid, true), true, '縦構図のときは縦のまま');
  assert.equal(isPortrait(mid, false), false, '横構図のときは横のまま');
  // 境目のまわりで行ったり来たりしても、構図は変わらない
  let portrait = true;
  for (const a of [0.78, 0.82, 0.90, 0.84, 0.79, 0.93, 0.81]) {
    portrait = isPortrait(a, portrait);
    assert.equal(portrait, true, `比 ${a} で構図が裏返った`);
  }
});

test('構図: URL バーの出入りでは取り直さない', () => {
  // これが「ブルブル」の正体。実機では縦に戻したあと URL バーが出入りして
  // 高さが何度も変わる。そのたびに取り直すと、画面が脈打つ
  // (実測で、高さ 844↔788 の揺れでカメラ距離が 19.12↔17.85 と往復した)。
  const base = 390 / 844;
  for (const h of [800, 788, 812, 830, 844]) {
    const a = 390 / h;
    assert.equal(needsRefit(a, base, true), false,
      `高さ ${h} への揺れで取り直している(比 ${a.toFixed(3)})`);
  }
});

test('構図: ちゃんと回したときは取り直す', () => {
  assert.equal(needsRefit(横, 縦, true), true, '縦→横で取り直していない');
  assert.equal(needsRefit(縦, 横, false), true, '横→縦で取り直していない');
});

test('構図: 小さな変化が積み重なったら取り直す', () => {
  // 基準を「前回の resize」にすると、少しずつ変わる場合に永久に
  // 取り直さなくなる。基準は「最後に取り直したときの形」。
  const fit = 390 / 844;
  let a = fit;
  let refit = false;
  for (let i = 0; i < 12 && !refit; i++) {
    a *= 1.03;                       // 3% ずつ変えていく
    refit = needsRefit(a, fit, true);
  }
  assert.ok(refit, '少しずつ変えていっても取り直さない');
});

test('構図: 初回は必ず取り直す', () => {
  for (const v of [undefined, null, 0, NaN]) {
    assert.equal(needsRefit(縦, v, false), true, `基準 ${v} のとき取り直さない`);
  }
});

test('構図: おかしな値でも壊れない', () => {
  for (const v of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(typeof isPortrait(v, true), 'boolean', `isPortrait(${v})`);
    assert.equal(typeof needsRefit(v, 0.5, true), 'boolean', `needsRefit(${v})`);
  }
  // 形が取れないときは、いまの構図を保って取り直さない(勝手に動かさない)
  assert.equal(isPortrait(0, true), true);
  assert.equal(needsRefit(NaN, 0.5, true), false);
});
