// ダイアログの表(src/render/dialogs.js)。
//
// もとは 606 行・31 分岐の 1 関数で、1 種類を試すのに手前の 30 個の if を
// 素通りさせる必要があった。表にした一番の狙いは**取りこぼしの見張り**。
//
// ダイアログの型は 2 か所から立つ ── 直接の `ui.dialog = { type: ... }` と、
// ui-sync.js の DIALOG_FOR_AWAITING。型を足して分岐を書き忘れても、
// 以前は空文字が返って**空のダイアログが黙って出る**だけで、
// エラーにも落ちなかった。ここで突き合わせて落とす。
//
// 見張り先を名指しで書き並べるのはやめる。モード一覧のときに
// 「名前を挙げていない場所は最初から対象外」で取り残しが出たので、
// src/ を丸ごと歩いて `ui.dialog = { type: ... }` を拾う。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DIALOGS, dialogHtml } from '../src/render/dialogs.js';
import { DIALOG_FOR_AWAITING } from '../src/ui-sync.js';
import { setHumanSeat } from '../src/render/hud-common.js';
import { createGame } from '../src/state.js';
import { dispatch } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';
import { PROGRESS_CARDS } from '../src/rules/cak/progress-cards.js';
import { MAX_IMPROVEMENT } from '../src/rules/cak/improvements.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

// アプリが実際に立てる型を、ソースから機械的に拾う
function raisedTypes() {
  const out = new Map(); // type -> どのファイルで立つか
  for (const f of walk(SRC)) {
    const body = readFileSync(f, 'utf8');
    for (const m of body.matchAll(/dialog = \{\s*type: '([a-zA-Z-]+)'/g)) {
      out.set(m[1], f.slice(SRC.length + 1));
    }
  }
  for (const t of Object.values(DIALOG_FOR_AWAITING)) {
    if (!out.has(t)) out.set(t, 'ui-sync.js (DIALOG_FOR_AWAITING)');
  }
  return out;
}

test('ダイアログ: 立てる型には必ず中身がある(空のダイアログが出ない)', () => {
  const missing = [...raisedTypes()].filter(([t]) => !DIALOGS[t]);
  assert.deepEqual(
    missing, [],
    `表に無い型がある: ${missing.map(([t, f]) => `${t}(${f})`).join(', ')}\n`
    + '→ src/render/dialogs.js の DIALOGS に足してください',
  );
});

test('ダイアログ: 表にあるのに誰も立てない型が無い', () => {
  const raised = raisedTypes();
  const orphans = Object.keys(DIALOGS).filter((t) => !raised.has(t));
  assert.deepEqual(orphans, [], `使われていない型: ${orphans.join(', ')}`);
});

test('ダイアログ: 表の中身は全て関数', () => {
  assert.ok(Object.keys(DIALOGS).length >= 30, `型が少なすぎる: ${Object.keys(DIALOGS).length}`);
  for (const [t, fn] of Object.entries(DIALOGS)) {
    assert.equal(typeof fn, 'function', `${t}: 関数でない`);
  }
});

// 引き剥がす前は、知らない型でも「最後まで if を素通りして ''」だった。
// 表引きにしても同じ ── 落ちずに空を返す。
test('ダイアログ: 知らない型や空でも落ちない', () => {
  setHumanSeat(0);
  const s = createGame({ seed: 1, playerCount: 4, humanIndex: 0 });
  assert.equal(dialogHtml(s, { dialog: null }), '');
  assert.equal(dialogHtml(s, {}), '');
  assert.equal(dialogHtml(s, { dialog: { type: 'no-such-dialog' } }), '');
});

// 表引きの配線そのもの。state・ui・d・p の4つが正しい順で渡っていないと、
// 中身は書けているのに全部が空になる(型ごとのテストでは気づきにくい)。
test('ダイアログ: 表から呼ぶとき state・ui・d・p が渡る', () => {
  setHumanSeat(0);
  const s = createGame({ seed: 1, playerCount: 4, humanIndex: 0 });
  const seen = [];
  const saved = DIALOGS.log;
  try {
    DIALOGS.log = (...args) => { seen.push(args); return 'ok'; };
    const ui = { dialog: { type: 'log' } };
    assert.equal(dialogHtml(s, ui), 'ok');
    const [state, gotUi, d, p] = seen[0];
    assert.equal(state, s, 'state が渡っていない');
    assert.equal(gotUi, ui, 'ui が渡っていない');
    assert.equal(d, ui.dialog, 'dialog が渡っていない');
    assert.equal(p, s.players[0], '自分のプレイヤーが渡っていない');
  } finally {
    DIALOGS.log = saved;
  }
});

// ---- 中身(押せる / 押せないの判定)----
//
// 引き剥がした直後に故障注入をかけたら捕獲率 12% だった。見逃しは全部
// 「ボタンを押せるか」の判定で、**中身には1本もテストが無かった**
// (引き剥がしはテストを書ける形にしただけで、書いてはいなかった)。
// 誤って有効だと押しても弾かれ、誤って無効だと詰まる。どちらも境界で起きる。

// data-act → 押せるか
function btns(html) {
  const out = new Map();
  for (const m of html.matchAll(/data-act="([^"]+)"([^>]*)>/g)) {
    if (!out.has(m[1])) out.set(m[1], { on: !/\bdisabled\b/.test(m[2]) });
  }
  return out;
}

function playing(mode = 'base', seed = 5) {
  setHumanSeat(0);
  let s = createGame({ seed, playerCount: 4, humanIndex: 0, mode });
  for (let i = 0; i < 5000 && s.phase === 'setup'; i += 1) {
    s = dispatch(s, chooseAction(s, s.awaiting ? s.awaiting.players[0] : s.currentPlayer));
  }
  s.currentPlayer = 0;
  s.awaiting = null;
  s.turnFlags = { rolled: true, playedDev: false };
  return s;
}
const hand = (s, res) => {
  for (const [r, n] of Object.entries(res)) {
    s.bank.resources[r] -= n - s.players[0].resources[r];
    s.players[0].resources[r] = n;
  }
  return s;
};
const show = (s, dialog) => dialogHtml(s, { dialog });

test('交易(銀行): レートちょうどで渡せる。1枚足りないと押せない', () => {
  const s = playing();
  const rate = 4; // 港なしの既定
  hand(s, { wood: rate });
  assert.equal(btns(show(s, { type: 'trade', tab: 'bank' })).get('trade-give:wood').on, true,
    'レートちょうど持っているのに渡せない');
  hand(s, { wood: rate - 1 });
  assert.equal(btns(show(s, { type: 'trade', tab: 'bank' })).get('trade-give:wood').on, false,
    '1枚足りないのに渡せてしまう');
});

test('交易(銀行): 在庫が無い資源と、渡すものと同じ資源はもらえない', () => {
  const s = hand(playing(), { wood: 9 });
  s.bank.resources.ore = 0;
  const b = btns(show(s, { type: 'trade', tab: 'bank', give: 'wood' }));
  assert.equal(b.get('trade-receive:ore').on, false, '在庫0なのにもらえる');
  assert.equal(b.get('trade-receive:wood').on, false, '渡すものと同じものをもらえる');
  assert.equal(b.get('trade-receive:sheep').on, true, '普通の資源がもらえない');
});

test('交易(プレイヤー): 持っていないものは差し出せない', () => {
  const s = hand(playing(), { wood: 2, brick: 0 });
  const b = btns(show(s, { type: 'trade', tab: 'players', pgive: {}, precv: {} }));
  assert.equal(b.get('ptg-add:wood').on, true, '持っているのに差し出せない');
  assert.equal(b.get('ptg-add:brick').on, false, '持っていないのに差し出せる');
});

test('交易(プレイヤー): 渡すもの・もらうものが片方だけだと提案できない', () => {
  const s = hand(playing(), { wood: 2 });
  const on = (pgive, precv) =>
    btns(show(s, { type: 'trade', tab: 'players', pgive, precv })).get('pt-offer').on;
  assert.equal(on({}, {}), false, '何も選ばずに提案できる');
  assert.equal(on({ wood: 1 }, {}), false, 'もらうものを選ばずに提案できる');
  assert.equal(on({}, { ore: 1 }), false, '渡すものを選ばずに提案できる');
  assert.equal(on({ wood: 1 }, { ore: 1 }), true, '両方選んだのに提案できない');

  // **押せないだけでは足りない。** 片側しか選んでいないときは
  // ルールエンジンも弾くので、判定を片方だけに緩めてもボタンは押せないまま。
  // 違いが出るのは**案内の文**だけなので、そこを見る
  // (ここが崩れると「なぜ押せないのか」が player に伝わらなくなる)。
  const why = (pgive, precv) =>
    show(s, { type: 'trade', tab: 'players', pgive, precv })
      .match(/data-act="pt-offer"[^>]*title="([^"]*)"/)?.[1] ?? '';
  for (const [g, r, label] of [[{}, {}, '両方とも空'], [{ wood: 1 }, {}, '渡すものだけ'],
                               [{}, { ore: 1 }, 'もらうものだけ']]) {
    assert.match(why(g, r), /渡すものともらうものを選んでください/, `${label}: 案内が違う`);
  }
});

test('魚: 奪う相手は「自分以外で手札を持っている人」だけ', () => {
  const s = playing('fish');
  s.players[0].fish = [3, 4, 5];
  hand(s, { wood: 5 });                       // 自分は持っている
  for (const o of s.players.slice(1)) {
    for (const r of Object.keys(o.resources)) { s.bank.resources[r] += o.resources[r]; o.resources[r] = 0; }
  }
  s.players[2].resources.wood += 1; s.bank.resources.wood -= 1;  // 席2だけ1枚
  const b = btns(show(s, { type: 'fish', pick: 'steal' }));
  assert.equal(b.has('fish-steal:0'), false, '自分から奪える');
  assert.equal(b.has('fish-steal:1'), false, '手ぶらの相手から奪える');
  assert.equal(b.has('fish-steal:2'), true, '手札を持つ相手が出ていない');
});

test('魚: 銀行が空なら「好きな資源」は使えない', () => {
  const s = playing('fish');
  s.players[0].fish = [3, 4, 5, 6];
  const ok = show(s, { type: 'fish' });
  assert.equal(btns(ok).get('fish-use:resource').on, true, '在庫があるのに使えない');
  for (const r of Object.keys(s.bank.resources)) s.bank.resources[r] = 0;
  const dry = show(s, { type: 'fish' });
  assert.equal(btns(dry).get('fish-use:resource').on, false, '銀行が空なのに使える');
  assert.match(dry, /銀行に在庫がありません/, '理由が出ていない');
});

test('外交官: 移せる道が無ければ「移設」は押せない', () => {
  const s = playing('cak');
  assert.equal(btns(show(s, { type: 'diplomat' })).get('diplo:move').on,
    // 自分の道が1本も無ければ移しようがない
    true, '前提: 置いた直後は移せる道がある');
  for (const e of Object.keys(s.roads)) if (s.roads[e].player === 0) delete s.roads[e];
  assert.equal(btns(show(s, { type: 'diplomat' })).get('diplo:move').on, false,
    '自分の道が無いのに移設できる');
});

test('進歩カードの上限: 自分の手番のときだけ5枚の断りが出る', () => {
  const s = playing('cak');
  s.players[0].progressCards.push({ id: 'spy', deck: 'politics', boughtTurn: 0 });
  assert.match(show(s, { type: 'progressLimit' }), /自分の手番のあいだだけ/,
    '自分の手番なのに断りが無い');
  s.currentPlayer = 1;
  assert.doesNotMatch(show(s, { type: 'progressLimit' }), /自分の手番のあいだだけ/,
    '相手の手番なのに断りが出ている');
});

test('交易の申し出: 手札が足りなければ受けられない', () => {
  const s = hand(playing('cak'), { wood: 0 });
  s.awaiting = { type: 'tradeOffer', players: [0], context: { from: 1, give: { ore: 1 }, receive: { wood: 2 } } };
  const poor = show(s, { type: 'tradeOffer' });
  assert.equal(btns(poor).get('offer-accept').on, false, '足りないのに受けられる');
  assert.match(poor, /手札が足りません/, '足りない断りが出ていない');
  hand(s, { wood: 2 });
  assert.equal(btns(show(s, { type: 'tradeOffer' })).get('offer-accept').on, true,
    'ちょうど足りているのに受けられない');
});

test('都市改良: 上限まで育てた系統は買えない', () => {
  const s = playing('cak');
  assert.ok(btns(show(s, { type: 'improve' })).has('improve-buy:trade'), '前提: 買う口がある');
  s.players[0].improvements.trade = MAX_IMPROVEMENT;
  const maxed = show(s, { type: 'improve' });
  assert.equal(btns(maxed).has('improve-buy:trade'), false, '上限なのに買う口が出ている');
  assert.match(maxed, /MAX/, '上限の表示が無い');
});

test('豪商: 相手が持っている種類だけ並ぶ', () => {
  const s = playing('cak');
  for (const r of Object.keys(s.players[1].resources)) {
    s.bank.resources[r] += s.players[1].resources[r]; s.players[1].resources[r] = 0;
  }
  s.players[1].commodities = { cloth: 0, coin: 0, paper: 0 };
  s.players[1].resources.ore = 2; s.bank.resources.ore -= 2;
  s.awaiting = { type: 'merchantPick', players: [0], context: { target: 1, count: 1 } };
  const b = btns(show(s, { type: 'merchantPick', counts: {} }));
  assert.equal(b.has('mer-plus:ore'), true, '持っている種類が出ていない');
  assert.equal(b.has('mer-plus:wood'), false, '持っていない種類が出ている');
});

test('収穫: 2枚まで。銀行の残りを超えて選べない', () => {
  const s = playing();
  const two = btns(show(s, { type: 'yop', picks: ['wood', 'brick'] }));
  for (const r of ['wood', 'brick', 'sheep']) {
    assert.equal(two.get(`yop:${r}`).on, false, `${r}: 2枚選んだのにまだ選べる`);
  }
  assert.equal(btns(show(s, { type: 'yop', picks: [] })).get('yop:wood').on, true,
    '1枚も選んでいないのに選べない');
  s.bank.resources.wood = 1;
  const b = btns(show(s, { type: 'yop', picks: ['wood'] }));
  assert.equal(b.get('yop:wood').on, false, '銀行の残り1枚を2枚目に選べる');
  assert.equal(b.get('yop:ore').on, true, '別の資源が選べない');
});

test('進歩カードの説明: 獲得したターンには使えないと出る', () => {
  const s = playing('cak');
  s.turn = 5;
  s.players[0].progressCards.push({ id: 'spy', deck: 'politics', boughtTurn: 5 });
  assert.match(show(s, { type: 'prog-info', index: 0 }), /獲得したターンには使えません/,
    '同じターンに獲得したのに理由が違う');
  s.players[0].progressCards[0].boughtTurn = 4;
  assert.doesNotMatch(show(s, { type: 'prog-info', index: 0 }), /獲得したターンには使えません/,
    '前のターンに獲得したのに使えない扱い');
});

test('進歩カード(相手を選ぶ): 自分は相手に出ない', () => {
  const s = playing('cak');
  const id = Object.keys(PROGRESS_CARDS)[0];
  s.players[0].progressCards.push({ id, deck: PROGRESS_CARDS[id].deck, boughtTurn: 0 });
  const b = btns(show(s, { type: 'prog-player', index: 0 }));
  assert.equal(b.has('pplayer:0'), false, '自分が相手として出ている');
  assert.ok([1, 2, 3].some((i) => b.has(`pplayer:${i}`)), '相手が1人も出ていない');
});

test('出目の記録: まだ振っていないときは棒グラフを出さない', () => {
  const s = playing();
  s.diceCounts = Array(13).fill(0);
  assert.match(show(s, { type: 'dicelog' }), /まだダイスを振っていません/, '案内が出ていない');
  s.diceCounts[6] = 2;
  const drawn = show(s, { type: 'dicelog' });
  assert.doesNotMatch(drawn, /まだダイスを振っていません/, '振ったのに案内が出ている');
  assert.match(drawn, /dchart/, '棒グラフが出ていない');
});
