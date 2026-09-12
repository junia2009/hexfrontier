// CPU の発展カード購入(基本ルール系)。
//
// 直す前の CPU は事実上まったく買っていなかった: 0.79枚/人/ゲーム、
// 最大騎士力(騎士3体)が成立する試合は 6.3% しかなく、2点が誰とも
// 争われないまま人間のものになっていた。原因は買う条件のほうで、
// nextGoal が 85% のターンで city/settlement を返す(昇格できる開拓地は
// ほぼ常にある)のに、その間は「手札が8枚超のときだけ」だったこと。
//
// ここでは「判断1回」と「1ゲームを通した結果」の両方を押さえる。
// 判断だけだと敷居の意味が守れず、結果だけだと落ちたときに原因が分からない。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { dispatch } from '../src/actions.js';
import { chooseAction, nextGoal, DEV_BUY_SHORT_BY } from '../src/ai/cpu-player.js';
import { missingFor } from '../src/ai/evaluator.js';

// 手番が回ってロール済みの状態まで進める(pid の手番・振ったあと)
function toRolledTurn(mode = 'base', seed = 5) {
  let state = createGame({ seed, playerCount: 4, humanIndex: -1, mode });
  for (let i = 0; i < 4000; i += 1) {
    if (state.phase === 'main' && !state.awaiting && state.turnFlags?.rolled) return state;
    const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
    state = dispatch(state, chooseAction(state, pid));
  }
  throw new Error('ロール済みの手番に辿り着けなかった');
}

test('発展カード: 敷居は「目標まであと何枚足りないか」', () => {
  // 1 にすると詰んだターンは必ず引き、3 以上にするとほとんど引かなくなる。
  // 値そのものは実測で選んでいるので、ここでは意味のある範囲かだけ見る。
  assert.ok(Number.isInteger(DEV_BUY_SHORT_BY));
  assert.ok(DEV_BUY_SHORT_BY >= 1 && DEV_BUY_SHORT_BY <= 3, `敷居が範囲外: ${DEV_BUY_SHORT_BY}`);
});

test('発展カード: 目標に遠いターンは、手札が少なくても引く', () => {
  const base = toRolledTurn();
  const pid = base.currentPlayer;
  const s = structuredClone(base);
  const p = s.players[pid];
  // 羊・麦・鉄を1枚ずつだけ持たせる(= 発展カードはちょうど買える。
  // 都市にも開拓地にも遠いので、目標には2枚以上足りない)。
  // 銀行から引いて保存則を壊さない
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) {
    s.bank.resources[r] += p.resources[r];
    p.resources[r] = 0;
  }
  for (const r of ['sheep', 'wheat', 'ore']) {
    p.resources[r] = 1;
    s.bank.resources[r] -= 1;
  }
  const goal = nextGoal(s, pid);
  const shortBy = Object.values(goal ? missingFor(p, goal.cost) : {}).reduce((a, b) => a + b, 0);
  assert.ok(shortBy >= DEV_BUY_SHORT_BY, `前提が崩れている(不足 ${shortBy}枚)`);

  const a = chooseAction(s, pid);
  assert.equal(a.type, 'BUY_DEV_CARD', `引かずに ${a.type} を選んだ`);
});

test('発展カード: 目標にあと1枚のときは崩さない', () => {
  const base = toRolledTurn();
  const pid = base.currentPlayer;
  const s = structuredClone(base);
  const p = s.players[pid];
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) {
    s.bank.resources[r] += p.resources[r];
    p.resources[r] = 0;
  }
  // 都市(麦2・鉄3)まであと1枚。発展カードも買えるが、ここで引くと都市が遠のく
  const give = { sheep: 1, wheat: 2, ore: 2 };
  for (const [r, n] of Object.entries(give)) {
    p.resources[r] = n;
    s.bank.resources[r] -= n;
  }
  const goal = nextGoal(s, pid);
  assert.equal(goal?.kind, 'city', '前提: 都市を狙っている');
  const shortBy = Object.values(missingFor(p, goal.cost)).reduce((a, b) => a + b, 0);
  assert.equal(shortBy, 1, `前提が崩れている(不足 ${shortBy}枚)`);

  const a = chooseAction(s, pid);
  assert.notEqual(a.type, 'BUY_DEV_CARD', 'あと1枚の都市を崩して引いてしまった');
});

test('発展カード: 通しで見て、最大騎士力が争われる程度には買われる', () => {
  // 敷居を戻す/条件を壊すと、ここが真っ先に落ちる。
  // 境目は実測(直す前 3.17枚・6.3%、直したあと 12.04枚・61.8%/400ゲーム)
  // のあいだに置いて、揺らぎで落ちないようにしてある。
  let bought = 0;
  let armyGames = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed += 1) {
    let state = createGame({ seed, playerCount: 4, humanIndex: -1, mode: 'base' });
    let steps = 0;
    while (state.phase !== 'ended' && ++steps < 6000) {
      const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
      const a = chooseAction(state, pid);
      if (a.type === 'BUY_DEV_CARD') bought += 1;
      state = dispatch(state, a);
    }
    assert.equal(state.phase, 'ended', `seed=${seed} が終わらない`);
    if (state.largestArmy?.player != null) armyGames += 1;
  }
  const perGame = bought / N;
  assert.ok(perGame >= 7, `発展カードが買われていない(${perGame.toFixed(2)}枚/ゲーム)`);
  assert.ok(
    armyGames / N >= 0.3,
    `最大騎士力がほとんど成立していない(${((armyGames / N) * 100).toFixed(0)}%)`,
  );
});
