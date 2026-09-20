// 島の掲示板の貼り紙(src/minigame/notice-fit.js)。
//
// **紙が板に食い込まないこと**を見張る。ここが崩れると、板と紙が同じ深さに
// 並んで画面がちらつく(z ファイティング)── 端末の奥行きのビット数で
// 出たり出なかったりするので、**手元では見えない**。実際、手元(24ビット)は
// 平気で実機だけで出た。だから目ではなく数で押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HEAD_BOTTOM, HEAD_TOP, PANEL_D, PANEL_FRONT, PANEL_Z, PAPER_Z, POST_TOP, paperClearance,
} from '../src/minigame/notice-fit.js';

// 掲示板は WALK_SCALE(0.5)で縮むので、世界の長さは半分になる
const WORLD = 0.5;

test('掲示板: 留め板の前面と紙の高さがつじつまが合っている', () => {
  assert.equal(PANEL_FRONT, PANEL_Z + PANEL_D / 2);
  assert.ok(PAPER_Z > PANEL_FRONT, '紙が留め板の中に埋まっている');
});

// **柱の天面を板の天面とそろえない。** そろえると「同じ高さの2枚の面」が
// できて、上から見たときにそこがちらつく ── 実測で隙間ぴったり 0、
// 重なりは 0.046×0.030 あった。紙とは別口の、2つめの z ファイティング。
test('掲示板: 柱の上端は、見出しの板の天面とそろえない', () => {
  assert.ok(POST_TOP < HEAD_TOP - 0.01,
    `柱の天面(${POST_TOP})が板の天面(${HEAD_TOP})と同じ高さにある`);
  // かといって板の下へ突き抜けると、柱が板を支えていないように見える
  assert.ok(POST_TOP > HEAD_BOTTOM + 0.02,
    `柱が見出しの板をつかんでいない(柱 ${POST_TOP} / 板の下端 ${HEAD_BOTTOM})`);
});

// **0.008(世界で 0.004)が下限。** 前は 0.0015(世界で 0.00075)しかなくて、
// 実機でちらついた。紙は動かさない(めくる演出はやめた)ので、この隙間は
// 「ときどき」ではなく**ずっと**その距離のまま ── 近すぎれば必ずちらつく。
test('掲示板: 紙は留め板から離れている', () => {
  const gap = paperClearance();
  assert.ok(gap >= 0.008,
    `隙間が近すぎる(${gap.toFixed(4)}。世界で ${(gap * WORLD).toFixed(5)})`);
  // 昔の置きかたを、そのまま失敗として書いておく(何を直したのかが残る)
  assert.ok(0.022 - PANEL_FRONT < 0.008, '前提: 昔の 0.022 は近すぎた');
});
