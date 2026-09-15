// HUD の組み立て(src/render/hud-render.js)。
//
// この画面はいままで1行もテストが触っていなかった(1,197行)。DOM を使うので
// 丸ごとは動かせないが、**押せる/押せないの判断**と**案内の文**は
// 純粋な関数に切り出せるので、そこを押さえる。
//
// いちばん効くのは「HUD の判断」と「ルールエンジンの判断」の突き合わせ。
// 片方だけを読み直した検算ではなく、**別々に書かれた2つの実装が一致するか**
// を見るので、どちらかがずれたら落ちる。
// ボタンが勝手に無効なら人が詰まるし、勝手に有効なら押しても弾かれる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { dispatch, validateAction } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';
import { boardEdgeIds } from '../src/rules/board.js';
import { PIECE_LIMITS } from '../src/rules/build.js';
import {
  controlsHtml, dialogHtml, statusText, devPlayableWhy, setHumanSeat,
} from '../src/render/hud-render.js';

const HUMAN = 0;

// ボタン1つぶんを読み取る。data-act と disabled だけ見れば十分
function buttons(html) {
  const out = new Map();
  for (const m of html.matchAll(/<button data-act="([^"]+)"([^>]*)>/g)) {
    out.set(m[1], { enabled: !/\bdisabled\b/.test(m[2]) });
  }
  return out;
}

// 人間の手番(ロール前)まで進める
function toHumanTurn(mode = 'base', seed = 3) {
  setHumanSeat(HUMAN);
  let state = createGame({ seed, playerCount: 4, humanIndex: HUMAN, mode });
  for (let i = 0; i < 4000; i += 1) {
    if (state.phase === 'main' && state.currentPlayer === HUMAN && !state.awaiting) return state;
    const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
    state = dispatch(state, chooseAction(state, pid));
  }
  throw new Error(`${mode}: 人間の手番に辿り着けなかった`);
}

const give = (state, res) => {
  for (const [r, n] of Object.entries(res)) {
    state.players[HUMAN].resources[r] += n;
    state.bank.resources[r] -= n; // 保存則を壊さない
  }
};

test('ボタン: いつでも data-act が読み取れる形で出る', () => {
  const b = buttons(controlsHtml(toHumanTurn(), false));
  assert.ok(b.size >= 6, `ボタンが少なすぎる: ${b.size}`);
  for (const act of ['roll', 'mode:road', 'mode:settlement', 'mode:city', 'buy-dev', 'trade-open', 'end-turn']) {
    assert.ok(b.has(act), `${act} のボタンがない`);
  }
});

test('ボタン: ルールエンジンと押せる/押せないが一致する(ロール・ターン終了)', () => {
  // ここが食い違うと、押しても弾かれる or 押せなくて詰む。
  // HUD は自前で条件を書いているので、エンジンと**独立**に判断している。
  const agrees = (state, act, action) => {
    const b = buttons(controlsHtml(state, false));
    const engineOk = validateAction(state, action) === null;
    assert.equal(
      b.get(act).enabled, engineOk,
      `${act}: HUD=${b.get(act).enabled} / エンジン=${engineOk}`,
    );
  };

  for (const mode of ['base', 'cak', 'sea', 'fish', 'dragon']) {
    let state = toHumanTurn(mode);
    // ロール前
    agrees(state, 'roll', { type: 'ROLL_DICE', player: HUMAN });
    agrees(state, 'end-turn', { type: 'END_TURN', player: HUMAN });
    // ロール後(7 だと捨て札・盗賊で awaiting に入るので、出目を固定して避ける)
    state.turnFlags.alchemist = [2, 3];
    state = dispatch(state, { type: 'ROLL_DICE', player: HUMAN });
    if (state.awaiting) continue; // 出目で誰かの選択待ちになったらこの回は飛ばす
    agrees(state, 'roll', { type: 'ROLL_DICE', player: HUMAN });
    agrees(state, 'end-turn', { type: 'END_TURN', player: HUMAN });
  }
});

test('ボタン: 発展カードの購入もエンジンと一致する', () => {
  let state = toHumanTurn('base');
  state.turnFlags.alchemist = [2, 3];
  state = dispatch(state, { type: 'ROLL_DICE', player: HUMAN });
  if (state.awaiting) return; // 選択待ちに入ったら諦める(別シードの話)

  // 資源が無い状態と、足りる状態の両方で突き合わせる
  for (const res of [{}, { sheep: 1, wheat: 1, ore: 1 }]) {
    const s = structuredClone(state);
    give(s, res);
    const b = buttons(controlsHtml(s, false));
    const engineOk = validateAction(s, { type: 'BUY_DEV_CARD', player: HUMAN }) === null;
    assert.equal(b.get('buy-dev').enabled, engineOk,
      `buy-dev: HUD=${b.get('buy-dev').enabled} / エンジン=${engineOk}(資源 ${JSON.stringify(res)})`);
  }
});

test('ボタン: コマが尽きたら建てられない(資源があっても)', () => {
  let state = toHumanTurn('base');
  state.turnFlags.alchemist = [2, 3];
  state = dispatch(state, { type: 'ROLL_DICE', player: HUMAN });
  if (state.awaiting) return;
  give(state, { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 6 });

  const rich = buttons(controlsHtml(state, false));
  assert.equal(rich.get('mode:road').enabled, true, '資源があるのに道が押せない');

  // 道のコマを全部使い切った状態にする(上限まで盤上に置く)
  const s = structuredClone(state);
  let n = Object.values(s.roads).filter((r) => r.player === HUMAN).length;
  for (const eid of boardEdgeIds(s.board)) {
    if (n >= PIECE_LIMITS.road) break;
    if (!s.roads[eid]) { s.roads[eid] = { player: HUMAN }; n += 1; }
  }
  assert.equal(n, PIECE_LIMITS.road, `道を${PIECE_LIMITS.road}本置けなかった(${n}本)`);
  const poor = buttons(controlsHtml(s, false));
  assert.equal(poor.get('mode:road').enabled, false, 'コマが尽きているのに道が押せる');
});

test('ボタン: モードごとに出る顔ぶれが違う', () => {
  const actsOf = (mode) => [...buttons(controlsHtml(toHumanTurn(mode), false)).keys()];

  assert.ok(actsOf('cak').includes('mode:knight'), '都市と騎士に騎士がない');
  assert.ok(actsOf('cak').includes('mode:wall'), '都市と騎士に城壁がない');
  assert.ok(!actsOf('cak').includes('buy-dev'), '都市と騎士に発展カードが出ている');

  assert.ok(actsOf('sea').includes('mode:ship'), '航海者に船がない');
  assert.ok(actsOf('sea').includes('mode:moveship'), '航海者に船の移動がない');
  assert.ok(actsOf('dragon').includes('mode:tower'), 'ドラゴンに見張り塔がない');
  assert.ok(actsOf('fish').includes('fish-open'), '漁師に魚がない');

  // 基本は余計なものを出さない
  const base = actsOf('base');
  for (const extra of ['mode:knight', 'mode:ship', 'mode:tower', 'fish-open']) {
    assert.ok(!base.includes(extra), `基本に ${extra} が出ている`);
  }
});

test('ボタン: 狭い画面では1つにまとまる(ロールとターン終了)', () => {
  const state = toHumanTurn('base');
  // ロール前: ロールが出て、ターン終了は出ない
  const before = buttons(controlsHtml(state, true));
  assert.ok(before.has('roll'), '狭い画面でロールが出ない');
  assert.ok(!before.has('end-turn'), '狭い画面でロール前にターン終了が出ている');
  // 広い画面では両方出る
  const wide = buttons(controlsHtml(state, false));
  assert.ok(wide.has('roll') && wide.has('end-turn'), '広い画面で両方出ない');
});

test('案内: 自分が選ぶ番のときは、何を選ぶのか必ず書いてある', () => {
  const state = toHumanTurn('base');
  const ui = { mode: null, toast: null, pendingEdges: [], pendingVertices: [], pendingHexes: [] };
  // **「空でない」では足りない。** 案内を消しても、後ろの分岐が
  // 「ダイスを振ってください」を返してしまい、それらしい文が出たまま
  // 通ってしまう(実際この緩い書きかたで見逃した)。
  // 種類ごとに、そこにしか出ない言葉が入っているかまで見る。
  const kinds = [
    ['moveRobber', {}, /盗賊/],
    ['discard', { required: { 0: 3 } }, /捨て/],
    ['goldChoice', {}, /金鉱/],
    ['setupPlacement', { round: 1 }, /初期配置/],
    ['aqueduct', {}, /水道橋/],
    ['tradeChoose', {}, /交換/],
  ];
  for (const [type, context, want] of kinds) {
    const s = { ...state, awaiting: { type, players: [HUMAN], context } };
    const t = statusText(s, ui);
    assert.match(t, want, `${type}: その場面の案内になっていない`);
    assert.ok(!t.startsWith('⏳'), `${type}: 自分の番なのに待ちの文になっている(${t})`);
  }

  // 枚数のような「その場で埋まる数字」も出ていること
  const d = { ...state, awaiting: { type: 'discard', players: [HUMAN], context: { required: { 0: 3 } } } };
  assert.match(statusText(d, ui), /3枚/, '捨てる枚数が出ていない');
});

test('案内: 他人を待っているときは、誰を待っているか出る', () => {
  const state = toHumanTurn('base');
  const ui = { mode: null, toast: null, pendingEdges: [], pendingVertices: [], pendingHexes: [] };
  const s = { ...state, awaiting: { type: 'discard', players: [1, 2], context: { required: {} } } };
  const t = statusText(s, ui);
  assert.ok(t.startsWith('⏳'), `待ちの文になっていない: ${t}`);
  assert.ok(t.includes(state.players[1].name), '待っている相手の名前が出ていない');
});

test('案内: 知らせがあるときは、それを最優先で出す', () => {
  const state = toHumanTurn('base');
  const ui = { mode: null, toast: 'テストの知らせ', pendingEdges: [], pendingVertices: [], pendingHexes: [] };
  assert.ok(statusText(state, ui).includes('テストの知らせ'));
});

test('案内: 決着したら勝者の名前を出す', () => {
  const state = toHumanTurn('base');
  const s = { ...state, phase: 'ended', winner: 2 };
  const ui = { mode: null, toast: null, pendingEdges: [], pendingVertices: [], pendingHexes: [] };
  assert.ok(statusText(s, ui).includes(state.players[2].name));
});

// 使えるときは null、使えないときは**理由の文**を返す(画面にそのまま出る)
test('発展カード: 使えないときは理由が出て、使えるときは null', () => {
  const state = toHumanTurn('base');

  assert.match(
    devPlayableWhy(state, { type: 'knight', boughtTurn: state.turn }),
    /購入したターン/, '買った手番なのに使える扱いになっている',
  );
  assert.equal(
    devPlayableWhy(state, { type: 'knight', boughtTurn: state.turn - 1 }), null,
    '前の手番に買った騎士が使えない',
  );
  // 勝利点カードは「使う」ものではない
  assert.ok(devPlayableWhy(state, { type: 'vp', boughtTurn: 0 }));
  // 騎士以外はロールのあと(騎士はロール前に出して盗賊を避けられる)
  assert.match(
    devPlayableWhy(state, { type: 'monopoly', boughtTurn: state.turn - 1 }),
    /ダイスを振った/, 'ロール前に独占が使える扱いになっている',
  );
  // 1手番に2枚は使えない
  const used = { ...state, turnFlags: { ...state.turnFlags, playedDev: true } };
  assert.match(
    devPlayableWhy(used, { type: 'knight', boughtTurn: state.turn - 1 }),
    /すでに/, '同じ手番に2枚目が使える扱いになっている',
  );
  // 自分の手番でなければ使えない
  const other = { ...state, currentPlayer: 1 };
  assert.match(
    devPlayableWhy(other, { type: 'knight', boughtTurn: state.turn - 1 }),
    /自分の手番/, '他人の手番に使える扱いになっている',
  );
});

// 魚トークンの使い道の出し分け。
//
// 「資源を1枚奪う」は**相手が手札を持っているとき**だけ押せる。
// この判定は `o.id !== HUMAN && totalCards(o) > 0` の一行で、
// `!==` を `===` にすると「自分が手札を持っているか」を見るようになる。
// 自分も相手も持っている普通の場面では**どちらでも同じ答え**になるので、
// 自分だけが持っている場面を作らないと違いが出ない。
test('魚の使い道: 奪うのは相手が手札を持っているときだけ', () => {
  const state = toHumanTurn('fish');
  state.turnFlags.rolled = true;
  // 自分に魚と資源を持たせ、相手は全員手ぶらにする
  state.players[HUMAN].fish = [3, 4, 5];
  give(state, { wood: 2 });
  for (const o of state.players) {
    if (o.id === HUMAN) continue;
    for (const r of Object.keys(o.resources)) {
      state.bank.resources[r] += o.resources[r]; // 保存則を壊さない
      o.resources[r] = 0;
    }
    o.commodities = { cloth: 0, coin: 0, paper: 0 };
  }

  const html = dialogHtml(state, { dialog: { type: 'fish' } });
  const b = buttons(html);
  assert.ok(b.has('fish-use:steal'), '奪う選択肢が出ていない');
  assert.equal(
    b.get('fish-use:steal').enabled, false,
    '相手が手ぶらなのに奪えることになっている(自分の手札を見ている)',
  );
  assert.match(html, /手札を持っている相手がいません/, '理由が出ていない');

  // 相手に1枚持たせると押せるようになる
  state.players[1].resources.wood += 1;
  state.bank.resources.wood -= 1;
  assert.equal(
    buttons(dialogHtml(state, { dialog: { type: 'fish' } })).get('fish-use:steal').enabled,
    true,
    '相手が持っているのに奪えない',
  );
});
