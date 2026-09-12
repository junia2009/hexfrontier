// セルフプレイ一括実行: node scripts/selfplay.js [ゲーム数] [モード]
// Phase 1 完了ゲート用(設計書 §10): クラッシュ・無限ループ・整合性の検証と統計。
//
// 引数は必ず検証してから走る。**黙って既定値に落ちるのがいちばん悪い** ──
// モード名を打ち間違えても base が 1,200 ゲーム走って、それらしい数字が出る。
// 測ったつもりで測れていないことに気づけない。

import { createGame, RESOURCES, MODE_IDS, isMode } from '../src/state.js';
import { dispatch } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';
import { computePoints } from '../src/rules/victory.js';

function die(msg) {
  console.error(`${msg}\n使い方: node scripts/selfplay.js [ゲーム数] [${MODE_IDS.join('|')}]`);
  process.exit(2);
}

const gamesArg = process.argv[2] ?? '200';
const games = Number(gamesArg);
if (!Number.isInteger(games) || games < 1) die(`ゲーム数が正の整数ではありません: ${gamesArg}`);
const mode = process.argv[3] ?? 'base';
if (!isMode(mode)) die(`知らないモードです: ${mode}`);
if (process.argv.length > 4) die(`余分な引数があります: ${process.argv.slice(4).join(' ')}`);
const wins = [0, 0, 0, 0];
let totalTurns = 0;
let totalActions = 0;
let failures = 0;

const t0 = Date.now();
for (let seed = 1; seed <= games; seed++) {
  try {
    let state = createGame({ seed, playerCount: 4, humanIndex: -1, mode });
    let actions = 0;
    while (state.phase !== 'ended') {
      if (++actions > 6000) throw new Error('6000アクション超過');
      const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
      state = dispatch(state, chooseAction(state, pid));
    }
    for (const r of RESOURCES) {
      const total = state.bank.resources[r] + state.players.reduce((s, p) => s + p.resources[r], 0);
      if (total !== 19) throw new Error(`資源保存則違反: ${r}=${total}`);
    }
    // 席番号でない勝者をそのまま数えると wins に変な鍵が生えて、
    // 勝率の合計が 100% にならないまま気づけない
    if (!Number.isInteger(state.winner) || state.winner < 0 || state.winner >= wins.length) {
      throw new Error(`勝者が席番号ではありません: ${state.winner}`);
    }
    wins[state.winner]++;
    totalTurns += state.turn;
    totalActions += actions;
    if (seed % 100 === 0) console.log(`... ${seed}/${games}`);
  } catch (e) {
    failures++;
    console.error(`seed=${seed}: ${e.message}`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// 平均と勝率の分母は「完走したゲーム数」。要求数で割ると、失敗した
// ぶんだけ勝率の合計が 100% を下回って、偏りと見分けがつかなくなる。
const done = games - failures;
console.log('─'.repeat(40));
console.log(`モード: ${mode} ゲーム数: ${games}(${elapsed}秒) 失敗: ${failures}`);
if (done > 0) {
  // 理論値 25% から何σ離れているか。眺めて「偏っていそう」と言うより、
  // ばらつきの範囲かどうかがその場で分かるほうがいい
  const se = Math.sqrt(0.25 * 0.75 / done) * 100;
  console.log(`勝率: ${wins.map((w, i) => {
    const p = (w / done) * 100;
    return `P${i}=${p.toFixed(1)}%(${((p - 25) / se >= 0 ? '+' : '')}${((p - 25) / se).toFixed(1)}σ)`;
  }).join(' ')}`);
  console.log(`平均ターン数: ${(totalTurns / done).toFixed(1)} 平均アクション数: ${(totalActions / done).toFixed(1)}`);
}
process.exit(failures > 0 ? 1 : 0);
