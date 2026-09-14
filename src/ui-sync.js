// UI 状態と GameState の同期(設計書 §8)
//
// 「いま state がこうなっているのだから、画面はこのダイアログ・この入力モードで
// なければならない」を決めるところ。**DOM には触らない**ので、node から
// そのまま検証できる(test/ui-sync.test.js)。
//
// ここが狂うと操作不能になる。たとえば捨て札のダイアログを開いたまま盗賊移動へ
// 移ると、ダイアログの描画が読めない state を読んで例外で落ち、画面が固まる。
// main.js の中にあったときは1行もテストが触っていなかった。

// 割り込み(awaiting)に紐づくダイアログ。割り込みが変わったら必ず閉じる。
export const INTERRUPT_DIALOGS = [
  'discard', 'steal', 'tradeOffer', 'tradeChoose', 'aqueduct', 'gold', 'defenderDeck', 'progressLimit', 'weddingGift', 'harborGive',
  'merchantPick', 'spyPick',
];
// awaiting の種類ごとに、開いたままでよいダイアログ
export const DIALOG_FOR_AWAITING = {
  discard: 'discard',
  tradeOffer: 'tradeOffer',
  tradeChoose: 'tradeChoose',
  aqueduct: 'aqueduct',
  goldChoice: 'gold',
  defenderDeck: 'defenderDeck',
  progressLimit: 'progressLimit',
  weddingGift: 'weddingGift',
  harborGive: 'harborGive',
  merchantPick: 'merchantPick',
  spyPick: 'spyPick',
  moveRobber: 'steal', // 略奪相手の選択(自分で開くのでここでは自動で開かない)
};
// awaiting の種類ごとの盤面入力モード
export const MODE_FOR_AWAITING = {
  setupPlacement: 'setup-settlement',
  moveRobber: 'move-robber',
  barbarianDefense: 'raze-city',
  deserterPick: 'desert-pick',
  deserterPlace: 'desert-place',
  knightDisplace: 'knight-displace',
};
// 割り込みに強いられて入るモード。割り込みが消えたら必ず抜ける
// ── 抜けそこねると、誰の番でもないのに盤面が光ったままになる。
export const FORCED_MODES = [
  'setup-settlement', 'setup-road', 'move-robber', 'raze-city',
  'desert-pick', 'desert-place', 'knight-displace',
];
// 捨てる枚数を数える形のダイアログ(器を添えて開く)
const COUNTING_DIALOGS = ['discard', 'weddingGift', 'merchantPick'];

const zeroCounts = () => ({
  wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0,
  // 都市と騎士では商品も捨て札の対象(手札上限に数えるため)
  cloth: 0, coin: 0, paper: 0,
});

// ui を state に合わせて書き換える(その場で直す)。
// onEnded は決着したときに1度だけ呼ぶ ── 戦績を残すのは main.js の仕事。
export function syncUi(state, ui, human, onEnded = () => {}) {
  const aw = state.awaiting;
  const forced = FORCED_MODES.includes(ui.mode);

  if (state.phase === 'ended') {
    ui.mode = 'idle';
    ui.pending = null;
    onEnded();
    if (ui.dialog?.type !== 'winner') ui.dialog = { type: 'winner' };
    return;
  }

  const mine = aw?.players.includes(human) ? aw : null;
  const keep = mine ? DIALOG_FOR_AWAITING[mine.type] : null;
  // 自分の割り込みかどうかに関わらず、今の割り込みに合わないものは閉じる
  if (INTERRUPT_DIALOGS.includes(ui.dialog?.type) && ui.dialog.type !== keep) ui.dialog = null;

  // オンラインでは応答を送ってからサーバーの state が届くまで間がある。
  // その間は同じ割り込みを見ているので、ダイアログや入力モードを開き直さない
  // (開き直すと二重に手を出せてしまい、捨て札が 0 枚に戻って見える)。
  const replied = mine != null && ui.sentAwaiting === mine;

  if (mine && !replied) {
    const wantMode = MODE_FOR_AWAITING[mine.type];
    if (wantMode === 'setup-settlement' && !['setup-settlement', 'setup-road'].includes(ui.mode)) {
      ui.mode = 'setup-settlement';
      ui.pending = null;
      ui.pendingVertex = null;
      ui.setupPiece = 'road';
    } else if (wantMode && wantMode !== 'setup-settlement' && ui.mode !== wantMode) {
      ui.mode = wantMode;
      ui.pending = null;
    }
    if (keep && keep !== 'steal' && ui.dialog?.type !== keep) {
      ui.dialog = COUNTING_DIALOGS.includes(keep)
        ? { type: keep, counts: zeroCounts() }
        : { type: keep };
    }
  } else if (!mine && forced) {
    ui.mode = 'idle';
    ui.pending = null;
    ui.pendingVertex = null;
    ui.setupPiece = 'road';
  }
}
