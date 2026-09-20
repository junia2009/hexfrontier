// 島の掲示板の貼り紙(src/minigame/notice-fit.js)。
//
// **紙が板に食い込まないこと**を見張る。ここが崩れると、板と紙が同じ深さに
// 並んで画面がちらつく(z ファイティング)── 端末の奥行きのビット数で
// 出たり出なかったりするので、**手元では見えない**。実際、手元(24ビット)は
// 平気で実機だけで出た。だから目ではなく数で押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLAP_FAR, FLAP_MAX, FLAP_SEC, HEAD_BOTTOM, HEAD_TOP, PANEL_D, PANEL_FRONT, PANEL_Z,
  PAPER, PAPER_H, PAPER_Z, POST_TOP, flapAngle, paperClearance, paperMinZ,
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
// 実機でちらついた。紙の上端は留め具なのでめくれても動かない ── つまり
// この隙間は「ときどき」ではなく**いつも**その距離でいることになる。
test('掲示板: 紙はどんなときも留め板から離れている', () => {
  const rest = paperClearance(0);
  assert.ok(rest >= 0.008,
    `止まっているときの隙間が近すぎる(${rest.toFixed(4)}。世界で ${(rest * WORLD).toFixed(5)})`);
  // 3周ぶん、そばでも遠くでも、1コマずつ見る
  for (const near of [true, false]) {
    for (let i = 0; i < PAPER; i += 1) {
      for (let n = 0; n <= 360; n += 1) {
        const t = (n / 360) * FLAP_SEC * 3;
        const a = flapAngle(t, i, near);
        const gap = paperClearance(a);
        assert.ok(gap >= 0.008,
          `${near ? 'そば' : '遠く'} ${i}枚目 t=${t.toFixed(2)} 角=${a.toFixed(3)} 隙間=${gap.toFixed(5)}`);
      }
    }
  }
});

// **紙は手前にしかめくれない。** 留め具は上の辺なので、奥へ回すと下半分が
// 板の中へ入っていく。前は sin で両側(±0.3)に振っていて、実測で紙の下端が
// z = -0.019(留め板の裏 -0.0045 よりさらに奥)まで潜っていた。
test('掲示板: 紙は手前にしかめくれない', () => {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < PAPER; i += 1) {
    for (let n = 0; n <= 720; n += 1) {
      const a = flapAngle((n / 720) * FLAP_SEC * 2, i, true);
      assert.ok(a <= 1e-12, `奥へめくれている(角=${a})`);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
  }
  // 片側いっぱいまでは振れる(振れないなら、ただ止まっているのと同じ)
  assert.ok(lo <= -FLAP_MAX * 0.98, `めくれが浅すぎる(いちばん深くて ${lo.toFixed(3)})`);
  assert.ok(hi >= -1e-3, '板にぴたりと戻る瞬間が無い');
});

test('掲示板: 離れているときは、ほとんど動かない', () => {
  let far = 0;
  let near = 0;
  for (let n = 0; n <= 720; n += 1) {
    const t = (n / 720) * FLAP_SEC * 2;
    far = Math.min(far, flapAngle(t, 0, false));
    near = Math.min(near, flapAngle(t, 0, true));
  }
  assert.ok(Math.abs(far) < Math.abs(near) * 0.5, '遠くでも同じだけ揺れている');
  assert.ok(Math.abs(far / near - FLAP_FAR) < 1e-9);
});

// 奥へ回したらどうなるか、を計算そのもので押さえておく ──
// 「手前だけ」の見張り(上のテスト)が何を防いでいるのかが、これで分かる
test('掲示板: 奥へ回すと板に食い込む(だから片側だけにしている)', () => {
  assert.equal(paperMinZ(0), PAPER_Z);
  assert.equal(paperMinZ(-FLAP_MAX), PAPER_Z, '手前へめくると、いちばん奥は留め具のまま');
  const 奥へ = paperMinZ(0.3);
  assert.ok(奥へ < PANEL_FRONT, '前提: 昔の振り幅(0.3)だと板より奥へ入る');
  assert.ok(Math.abs(奥へ - (PAPER_Z - PAPER_H * Math.sin(0.3))) < 1e-12);
  assert.ok(paperClearance(0.3) < 0, '食い込みが負で出ない');
});
