// 看板の字(src/minigame/sign-art.js)。
//
// **canvas の縦横比が板と違うと、そのぶん字が伸びる。** 掲示板の見出しは
// 板が 0.52×0.13(4:1)なのに canvas が 256×128(2:1)固定で、字が
// ちょうど2倍に横へ太っていた ──「フォントが良くない、やっすいアプリって
// 感じ」と言われた正体がこれ。目で見て「なんか変」までは分かっても、
// 「2倍」とは分からないので、数で押さえる。
//
// 描く中身は記録用の偽 ctx で確かめる(test/island.test.js の地図と同じ手)。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INK, MAX_PX, PX_PER_UNIT, SIGN_FONT, TRACK_BIG, TRACK_SMALL,
  drawSign, fitPx, lineWidth, signCanvasSize,
} from '../src/minigame/sign-art.js';

// 実際に貼っている板(それぞれの組み立て先と同じ寸法)
const BOARDS = [
  ['掲示板の見出し', 0.52, 0.13],
  ['島の店', 0.30, 0.14],
  ['受付', 0.24, 0.12],
  ['円卓', 0.26, 0.13],
];

// 記録用の偽 ctx。字の幅は「大きさ × 字数」で作る(本物に近い比になればよい)
function fakeCtx(w, h) {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  let px = 10;
  return {
    calls,
    canvas: { width: w, height: h },
    get font() { return `${px}px`; },
    set font(v) {
      px = Number(String(v).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
      calls.push(['font', v]);
    },
    measureText: (s) => ({ width: [...s].length * px * 0.92 }),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    set textAlign(v) { calls.push(['textAlign', v]); },
    set textBaseline(v) { calls.push(['textBaseline', v]); },
  };
}

// **これが番人。** 板の比と canvas の比がずれたら、そのぶん字が伸びる
test('看板: canvas の縦横比が、板の縦横比と合っている', () => {
  for (const [名, w, h] of BOARDS) {
    const s = signCanvasSize(w, h);
    const ずれ = (s.w / s.h) / (w / h);
    assert.ok(Math.abs(ずれ - 1) < 0.03,
      `${名}: 字が ${ずれ.toFixed(2)} 倍に伸びる(板 ${(w / h).toFixed(2)}:1 / canvas ${s.w}×${s.h})`);
  }
  // 昔の作りを、そのまま失敗として書いておく(何を直したのかが残る)
  const 昔 = 256 / 128;
  assert.ok(Math.abs(昔 / (0.52 / 0.13) - 1) > 0.4, '前提: 掲示板は 2:1 の canvas だと伸びていた');
});

test('看板: 1辺が上限を超えない。細かさは足りている', () => {
  for (const [名, w, h] of BOARDS) {
    const s = signCanvasSize(w, h);
    assert.ok(s.w <= MAX_PX && s.h <= MAX_PX, `${名}: ${s.w}×${s.h} が上限 ${MAX_PX} を超えた`);
    // 昔は横 256px しかなく、寄るとぼやけていた
    assert.ok(s.w >= 512, `${名}: 横 ${s.w}px では寄るとぼやける`);
    assert.equal(s.w % 8, 0, `${名}: 8の倍数になっていない`);
    assert.equal(s.h % 8, 0, `${名}: 8の倍数になっていない`);
  }
  // うんと大きい板でも上限を守る
  const 巨大 = signCanvasSize(10, 2.5);
  assert.ok(巨大.w <= MAX_PX && 巨大.h <= MAX_PX, `上限を超えた: ${巨大.w}×${巨大.h}`);
  assert.ok(Math.abs((巨大.w / 巨大.h) / 4 - 1) < 0.03, '大きい板で比が崩れた');
  assert.ok(PX_PER_UNIT > 0);
});

// 字間は**字と字のあいだだけ**。最後の1つぶんまで足すと右へ寄って、
// 中央ぞろえのつもりが中央に来ない
test('看板: 字間は字と字のあいだだけに入る', () => {
  const m = () => 10;
  assert.equal(lineWidth(m, '', 20, 0.1), 0);
  assert.equal(lineWidth(m, 'あ', 20, 0.1), 10, '1字なのに字間が入っている');
  assert.equal(lineWidth(m, 'あい', 20, 0.1), 10 + 10 + 2);
  assert.equal(lineWidth(m, 'あいう', 20, 0.1), 30 + 4);
  assert.ok(TRACK_BIG > 0 && TRACK_SMALL > 0, '字間が0だと既定の組みに見える');
});

test('看板: 長い文言は、板に収まるまで小さくなる', () => {
  const 幅 = (px) => px * 6;                    // 6字ぶんのつもり
  assert.equal(fitPx(幅, 100, 40), 16, '収まるまで縮んでいない');
  assert.equal(fitPx(幅, 1000, 40), 40, '収まっているのに縮めた');
  // どんなに長くても下限で止まる(0 や負にならない)
  assert.equal(fitPx(() => 1e9, 10, 40, 6), 6);
});

test('看板: 板・縁・字が、この順で出る', () => {
  const c = fakeCtx(1024, 256);
  drawSign(c, ['島の掲示板', 'きょうの依頼']);
  const 名 = c.calls.map((x) => x[0]);
  assert.ok(名.indexOf('fillRect') < 名.indexOf('strokeRect'), '地より先に縁を描いている');
  assert.ok(名.indexOf('strokeRect') < 名.indexOf('fillText'), '字より後に縁を描いている(字が消える)');
  // 木目が入っている(地の1枚 + 木目)。無地だと「間に合わせ」に見える
  const 塗り = c.calls.filter((x) => x[0] === 'fillRect').length;
  assert.ok(塗り >= 6, `木目が入っていない(fillRect ${塗り}回)`);
  // 縁は二重(濃い溝 + 明るい光)
  assert.equal(c.calls.filter((x) => x[0] === 'strokeRect').length, 2, '縁が二重になっていない');
});

// 字ごとに置いている(字間を入れるため)。まとめて1回で描くと字間が入らない
test('看板: 字は1つずつ置く。彫り跡の光を先に敷く', () => {
  const c = fakeCtx(1024, 256);
  drawSign(c, ['島の掲示板', 'きょうの依頼']);
  const 字 = c.calls.filter((x) => x[0] === 'fillText');
  // 「島の掲示板」5字 + 「きょうの依頼」6字、それぞれ光と本体で2回ずつ
  assert.equal(字.length, (5 + 6) * 2, `字の置きかたが違う(${字.length}回)`);
  // 光(下へずらす)→ 本体、の順。逆だと彫ったように見えない
  const [光, 本体] = 字;
  assert.equal(光[1], 本体[1], '同じ字を置いていない');
  assert.ok(光[3] > 本体[3], '光が字の上に来ている(彫りに見えない)');
  assert.ok(c.calls.some((x) => x[0] === 'fillStyle' && x[1] === INK), '字の色が出ていない');
});

// **明朝系を先に置く。** system-ui のままだと、木の板に「アプリの既定の字」が
// 乗っているように見える(そう言われた)。端末に無ければ serif に落ちる。
test('看板: 書体は明朝系から探して、最後は serif に落ちる', () => {
  assert.match(SIGN_FONT, /Mincho|Serif/i, '明朝系が入っていない');
  assert.match(SIGN_FONT, /serif\s*$/, '最後の逃げ道が serif になっていない');
  assert.doesNotMatch(SIGN_FONT, /system-ui|sans-serif/, '既定の字に落ちる道が残っている');
  const c = fakeCtx(576, 288);
  drawSign(c, ['つり大会', '受付']);
  for (const f of c.calls.filter((x) => x[0] === 'font')) {
    assert.ok(String(f[1]).includes('serif'), `書体を渡していない: ${f[1]}`);
  }
});

test('看板: 文言が片方だけでも落ちない', () => {
  for (const 文 of [['島の店', ''], ['', 'なんでも屋'], ['', ''], ['あ', 'い']]) {
    const c = fakeCtx(576, 288);
    drawSign(c, 文);
    assert.ok(c.calls.length > 0);
  }
});

// 木目は毎回おなじ。**Math.random を使うと、撮り直すたびに変わって
// 見比べられなくなる**(遊びの乱数は state.rng。絵でも固定できるならそうする)
test('看板: 木目は何度描いても同じ', () => {
  const a = fakeCtx(1024, 256);
  const b = fakeCtx(1024, 256);
  drawSign(a, ['島の掲示板', 'きょうの依頼']);
  drawSign(b, ['島の掲示板', 'きょうの依頼']);
  assert.deepEqual(a.calls, b.calls, '描くたびに違う絵になっている');
});
