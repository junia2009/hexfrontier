// あそびかたデモ(自動再生)の台本を、ブラウザなしで空回しする。
//
// デモは実物のルールエンジンを動かすので、ルールや盤面生成が変わると
// 台本の手が通らなくなる。ここで「全ビートが最後まで実行できること」を
// 保証しておけば、壊れたまま気づかずに配信することがない。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RESOURCES } from '../src/state.js';
import { dispatch, validateAction } from '../src/actions.js';
import { totalCards } from '../src/rules/build.js';
import { COMMODITIES } from '../src/rules/cak/progress-cards.js';
import {
  DEMO_CHAPTERS, DEMO_SECTIONS, chaptersOf, findChapter, nextChapter,
} from '../src/demo/script.js';
import {
  bestRollFor, buildDemoState, chapterSeconds, DEMO_PLAYER, stackDevDeck,
} from '../src/demo/scenario.js';
import { LAYOUT } from '../src/rules/board.js';
import { demoIndexHtml, lengthLabel } from '../src/render/demo-index.js';

function conservation(s, where) {
  for (const r of RESOURCES) {
    const total = s.bank.resources[r] + s.players.reduce((a, p) => a + p.resources[r], 0);
    assert.equal(total, 19, `${where}: ${r}の保存則`);
  }
  if (s.mode !== 'cak') return;
  for (const c of COMMODITIES) {
    const total = s.bank.commodities[c] + s.players.reduce((a, p) => a + p.commodities[c], 0);
    assert.equal(total, 12, `${where}: ${c}の保存則`);
  }
}

// main.js の doAction / refresh と同じ順序でビートを実行する(描画だけ無い)
function dryRun(chapter) {
  // **章ごとに、まっさらな盤から始める。** 短編は1本ずつ選んで見られるので、
  // 前の章が建てた道や配った資源を当てにできない(midTurn はダイスを
  // 振ってある状態にする ── 手番の途中から始まる章のため)
  let state = buildDemoState(chapter.mode, {
    finishSetup: !chapter.fromSetup, midTurn: chapter.midTurn,
  });
  const ui = { mode: 'idle', pending: null, pendingEdges: [], pendingHexes: [], dialog: null };
  let taps = 0;
  let actions = 0;

  chapter.beats.forEach((beat, i) => {
    const where = `${chapter.id}[${i}]`;
    if (beat.prep) beat.prep(state);
    conservation(state, `${where} prep後`);

    const say = typeof beat.say === 'function' ? beat.say(state, ui) : beat.say;
    assert.equal(typeof say, 'string', `${where}: 字幕が文字列でない`);

    if (beat.tap) {
      const target = beat.tap(state, ui);
      const value = target ? Object.values(target)[0] : null;
      assert.ok(value != null, `${where}: タップ先が見つからない`);
      taps++;
    }
    if (beat.ui) Object.assign(ui, beat.ui(state, ui));

    if (beat.action) {
      const action = beat.action(state, ui);
      assert.equal(
        validateAction(state, action), null,
        `${where}: ${action.type} が不正 — ${validateAction(state, action)}`,
      );
      state = dispatch(state, action);
      actions++;
      // 手を出したあとは入力状態を畳む(main.js の resetInputState 相当)
      ui.mode = 'idle';
      ui.pending = null;
      ui.pendingEdges = [];
      ui.pendingHexes = [];
      ui.dialog = null;
    }
    conservation(state, `${where} 実行後`);
  });

  return { state, taps, actions };
}

test('デモ: 節ごとに章が並び、id で引ける', () => {
  assert.ok(DEMO_CHAPTERS.length >= 12, `短編が ${DEMO_CHAPTERS.length} 本しかない`);
  assert.equal(findChapter('cak-knight').mode, 'cak');
  assert.equal(findChapter('しらない章').id, DEMO_CHAPTERS[0].id); // 未知の id は先頭へ
  // id は重ならない(重なると一覧のボタンが同じ章を開く)
  const ids = DEMO_CHAPTERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `id が重なっている: ${ids}`);
  for (const ch of DEMO_CHAPTERS) {
    assert.ok(ch.title && ch.lead, `${ch.id}: 題か説明が無い`);
    assert.ok(ch.beats.length >= 3, `${ch.id}: ビートが ${ch.beats.length} しかない`);
    assert.ok(DEMO_SECTIONS.some((x) => x.id === ch.section), `${ch.id}: 知らない節 ${ch.section}`);
  }
  // 節は空にならない。次の章は節をまたがない
  for (const sec of DEMO_SECTIONS) {
    const list = chaptersOf(sec.id);
    assert.ok(list.length >= 2, `${sec.id}: 章が ${list.length} 本`);
    assert.equal(nextChapter(list.at(-1).id), null, `${sec.id}: 最後の章から先へ送っている`);
    assert.equal(nextChapter(list[0].id)?.id, list[1].id);
  }
});

// **ここが短編に切り分けたことの肝。** 1本だけ選んで見られるということは、
// **どの章もまっさらな盤から成立しないといけない**。切り分けた直後は
// 14本中8本が「先にダイスを振ってください」で落ちた(手番の途中から
// 始まる章が、前の章の続きを当てにしていた)。
test('デモ: どの短編も、単独で最後まで通る', () => {
  for (const ch of DEMO_CHAPTERS) {
    if (ch.island) continue;   // 島は盤の手を出さない(下の別のテストで見張る)
    const { taps, actions } = dryRun(ch);
    assert.ok(taps + actions > 0, `${ch.id}: 指も手も出ない(字幕だけの章)`);
  }
});

// 島の章は盤ではないので、手が validate を通るかでは見張れない。
// **代わりに操作の綴りを見張る。** `data-act` を1文字間違えると
// 「押しても何も起きない動画」になり、目で見ても気づきにくい
test('デモ: 島の章の操作が、実在のボタンを指している', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const acts = new Set([...html.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]));
  const KINDS = ['click', 'walk', 'wait', 'fish'];
  const WALKS = ['fish', 'shop'];
  let ops = 0;
  for (const ch of DEMO_CHAPTERS.filter((c) => c.island)) {
    // **章に1つは操作が要る。** 字幕だけの章は「動画」ではない
    // (説明だけのビートが混じるのは構わない)
    assert.ok(ch.beats.some((b) => b.island), `${ch.id}: 操作が1つも無い(字幕だけの章)`);
    for (const [i, b] of ch.beats.entries()) {
      if (!b.island) continue;
      const kind = Object.keys(b.island)[0];
      assert.ok(KINDS.includes(kind), `${ch.id}[${i}]: 知らない操作 ${kind}`);
      ops += 1;
      if (kind === 'click') {
        assert.ok(acts.has(b.island.click),
          `${ch.id}[${i}]: 押せないボタン "${b.island.click}"(index.html に無い)`);
      }
      if (kind === 'walk') {
        assert.ok(WALKS.includes(b.island.walk), `${ch.id}[${i}]: 知らない行き先 ${b.island.walk}`);
      }
      // 指を出す先も実在すること(演出だけとはいえ、空振りすると指が出ない)
      if (b.tap) {
        const t = b.tap(null, null);
        const sel = t.btn ? `[data-act="${t.btn}"]` : t.sel;
        const act = sel?.match(/data-act="([^"]+)"/)?.[1];
        if (act) assert.ok(acts.has(act), `${ch.id}[${i}]: 指す先が無い "${act}"`);
      }
    }
  }
  assert.ok(ops >= 10, `島の操作を ${ops} 個しか見つけられていない(探し方が壊れている)`);
});

// 尺。**一覧に「約◯秒」と出す**ので、長すぎる短編は切り直しの合図
test('デモ: 短編が長くなりすぎていない', () => {
  for (const ch of DEMO_CHAPTERS) {
    const sec = chapterSeconds(ch);
    assert.ok(sec >= 8, `${ch.id}: ${sec}秒 ── 短すぎる(章に分ける値打ちがない)`);
    assert.ok(sec <= 75, `${ch.id}: ${sec}秒 ── 長い。話題で切り直す`);
  }
});

test('デモ 第1章: 初期配置を最初から見せられる(あなた2回 + CPU4回)', () => {
  const { state, actions } = dryRun(findChapter('setup'));
  const me = state.players[DEMO_PLAYER];

  assert.equal(actions, 6, '初期配置は全員で6手');
  assert.equal(state.phase, 'main', '初期配置が終わって手番フェーズに入っていない');
  assert.equal(
    Object.values(state.buildings).filter((b) => b.player === DEMO_PLAYER).length, 2,
    'あなたの開拓地が2つ建っていない',
  );
  // 2巡目の開拓地から初期資源が入る
  assert.ok(totalCards(me) >= 2, `初期資源が入っていない: ${totalCards(me)}枚`);
});

// 短編それぞれが「その話題を実際に見せている」こと。**ビートが通るだけでは
// 足りない** ── 字幕だけ残って手が消えても、通ること自体は通ってしまう
test('デモ: 基本の短編が、それぞれの話題を実際に見せている', () => {
  const log = (id) => dryRun(findChapter(id)).state.log.join('\n');

  const build = dryRun(findChapter('build')).state;
  assert.ok(
    Object.values(build.buildings).some((b) => b.player === DEMO_PLAYER),
    '道と開拓地: 建物が建っていない',
  );
  const city = dryRun(findChapter('city')).state;
  assert.ok(
    Object.values(city.buildings).some((b) => b.player === DEMO_PLAYER && b.type === 'city'),
    '都市に育てる: 都市が建っていない',
  );
  assert.ok(/1 交易/.test(log('trade-bank')), '銀行と交易: 交易が出ていない');
  assert.ok(log('trade-player').includes('🤝'), '相手と交易: 成立していない');

  const dev = log('dev');
  assert.ok(dev.includes('発展カードを購入'), '発展カード: 買えていない');
  assert.ok(dev.includes('「街道建設」を使用'), '発展カード: 使えていない');
  assert.ok(log('robber').includes('盗賊'), '7と盗賊: 盗賊が動いていない');
});

test('デモ: 都市と騎士の短編が、それぞれの話題を実際に見せている', () => {
  const cityS = dryRun(findChapter('cak-city')).state;
  assert.ok(cityS.players[DEMO_PLAYER].improvements.science >= 2, '都市改良が進んでいない');
  assert.ok(cityS.players[DEMO_PLAYER].progressCards.length >= 1, '進歩カードが入っていない');

  const kn = dryRun(findChapter('cak-knight')).state;
  assert.ok(
    Object.values(kn.knights).some((k) => k.player === DEMO_PLAYER),
    '騎士が置かれていない',
  );

  const bar = dryRun(findChapter('cak-barbarian')).state;
  assert.ok(bar.log.some((l) => l.includes('蛮族襲来')), '蛮族襲来が起きていない');
  // 襲来後は全騎士が不活性に戻る
  assert.ok(
    Object.values(bar.knights).every((k) => !k.active),
    '襲来後に騎士が不活性へ戻っていない',
  );

  const wall = dryRun(findChapter('cak-wall')).state;
  assert.ok(Object.keys(wall.walls).length >= 1, '城壁が建っていない');
});


// **`demo:<id>` の書き間違いは、静かに間違った章を開く。**
// findChapter は知らない id を先頭の章に倒すので、「なぜか初期配置が
// 始まる」だけで気づけない ── 実際、短編に切り分けたとき
// `demo:basic` と `demo:cak` が消えた id のまま残った。
test('デモ: 画面に書いてある章の id が、全部実在する', () => {
  const files = ['index.html', 'src/render/rules-content.js', 'src/main.js'];
  const ids = new Set(DEMO_CHAPTERS.map((c) => c.id));
  let found = 0;
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    // 書き方は2通り ── markup の直書きと、導線を作る関数への引数
    const pats = [/data-act="demo:([a-z-]+)"/g, /demoCta\('([a-z-]+)'/g, /startDemo\('([a-z-]+)'/g];
    for (const re of pats) {
      for (const m of src.matchAll(re)) {
        found += 1;
        assert.ok(ids.has(m[1]), `${f}: 知らない章 "${m[1]}" を開こうとしている`);
      }
    }
  }
  assert.ok(found >= 2, `導線を ${found} 個しか見つけられていない(探し方が壊れている)`);
});

// 一覧の表示。**尺の出しかたが崩れると、全部「約0秒」になっても気づかない**
test('デモ: 一覧に全部の短編が、尺つきで並ぶ', () => {
  const rows = DEMO_CHAPTERS.map((c) => ({
    id: c.id, section: c.section, title: c.title, lead: c.lead, seconds: chapterSeconds(c),
  }));
  const html = demoIndexHtml(DEMO_SECTIONS, rows);
  for (const c of DEMO_CHAPTERS) {
    assert.ok(html.includes(`data-act="demo:${c.id}"`), `${c.id} が一覧に無い`);
    assert.ok(html.includes(c.title), `${c.title} が一覧に無い`);
  }
  assert.equal((html.match(/class="demo-row"/g) ?? []).length, DEMO_CHAPTERS.length);
  // 「続けて見る」は節ごとに1つ
  assert.equal((html.match(/class="demo-all"/g) ?? []).length, DEMO_SECTIONS.length);
  assert.ok(!html.includes('約0秒'), '尺が 0 秒になっている');
  // 画面に入りきらないと困るので、流れる器に入れていること
  assert.match(html, /class="panel-scroll"/);
});

test('デモ: 尺の表記は、1分を超えたら分で言う', () => {
  assert.equal(lengthLabel(12), '約10秒');
  assert.equal(lengthLabel(38), '約40秒');
  assert.equal(lengthLabel(60), '約1分');
  assert.equal(lengthLabel(75), '約1分15秒');
  assert.equal(lengthLabel(120), '約2分');
  // 端でも「約0秒」を出さない(0 秒の動画は無い)
  assert.equal(lengthLabel(0), '約5秒');
  assert.equal(lengthLabel(2), '約5秒');
  // **丸めたぶんを繰り上げる。** 実機の一覧で「約1分60秒」が出た
  assert.equal(lengthLabel(110), '約1分45秒');
  assert.equal(lengthLabel(118), '約2分');
  for (let n = 0; n <= 600; n += 1) {
    const t = lengthLabel(n);
    assert.ok(!/分60秒/.test(t), `${n}秒 → ${t}(秒が60になっている)`);
    assert.match(t, /^約(\d+分(\d+秒)?|\d+秒)$/, `${n}秒 → ${t}`);
  }
});

// ---- 台本が使う仕込みの部品 ----
//
// script.js から間接的にしか呼ばれていなかったので、境界がどこも押さえられて
// いなかった。台本が静かに効かなくなっても、ビートは最後まで通ってしまう。

test('仕込み: 山札の一番上に持ってくる(先頭にある1枚も拾える)', () => {
  const s = buildDemoState('basic');
  // 山札は pop() で引くので、**末尾が上**
  s.bank.devDeck = ['monopoly', 'knight', 'knight'];
  // 索引 0 は「見つからない」ではない。`i < 0` を `i <= 0` にすると
  // ここだけ静かに失敗して、デモが狙ったカードを引けなくなる。
  assert.equal(stackDevDeck(s, 'monopoly'), true, '先頭の1枚を見つけられていない');
  assert.equal(s.bank.devDeck.at(-1), 'monopoly', '一番上に来ていない');
  assert.equal(s.bank.devDeck.length, 3, '枚数が変わった(並べ替えるだけのはず)');

  // 同じ種類が複数あるときは一番後ろのものを動かす
  s.bank.devDeck = ['knight', 'vp', 'knight', 'vp'];
  assert.equal(stackDevDeck(s, 'knight'), true);
  assert.deepEqual(s.bank.devDeck, ['knight', 'vp', 'vp', 'knight']);

  // 無い種類は false。山札は触らない
  s.bank.devDeck = ['knight', 'vp'];
  assert.equal(stackDevDeck(s, 'monopoly'), false, '無いカードを仕込めたことになっている');
  assert.deepEqual(s.bank.devDeck, ['knight', 'vp'], '見つからないのに並べ替えた');
});

test('仕込み: 一番もらえる出目を探す(赤も白も6まで見る)', () => {
  const s = buildDemoState('basic');
  // 盤の産出をいったん全部消して、12 の山1つだけに建物を残す。
  // 12 は (6,6) でしか出ないので、**6 まで見ていないと見つけられない**。
  const twelve = s.board.hexIds.find(
    (h) => s.board.hexes[h].token === 12 && s.board.hexes[h].terrain !== 'desert',
  );
  assert.ok(twelve, '前提: 12 の産出する山がある盤');
  for (const v of Object.keys(s.buildings)) delete s.buildings[v];
  s.board.robber = s.board.hexIds.find((h) => h !== twelve);
  const vid = LAYOUT.hexVertices[twelve][0];
  s.buildings[vid] = { player: DEMO_PLAYER, type: 'settlement' };

  assert.deepEqual(
    bestRollFor(s, DEMO_PLAYER), [6, 6],
    '6 の目を探しそこねている(走査が 6 まで届いていない)',
  );

  // 赤を固定したときも、白は 6 まで見る
  assert.deepEqual(
    bestRollFor(s, DEMO_PLAYER, { redDie: 6 }), [6, 6],
    '赤を固定すると白の 6 を見落とす',
  );
});
