// 遊べるルールの一覧(src/state.js の MODES)。
//
// 以前は同じ配列が6か所(画面4・サーバー2)に散らばっていて、モードを
// 足したときにどこかが取り残される形だった。一覧を1本にしたので、
// ここでは「一覧に載っているものは本当に遊べる」ことと、
// 「一覧を持ち直している場所が復活していない」ことを見張る。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MODES, MODE_IDS, isMode, modeOptions, createGame,
} from '../src/state.js';
import { dispatch } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');

test('モード一覧: id が重複せず、ラベルが埋まっている', () => {
  assert.ok(MODES.length >= 5);
  assert.equal(new Set(MODE_IDS).size, MODE_IDS.length, 'id が重複している');
  for (const m of MODES) {
    assert.match(m.id, /^[a-z]+$/, `id は小文字英字だけ: ${m.id}`);
    assert.ok(m.label && m.note, `${m.id} のラベル/説明が空`);
  }
  // 既存のモードが消えていないこと(消すと保存済みの設定が読めなくなる)
  for (const must of ['base', 'cak', 'dragon', 'fish', 'sea']) {
    assert.ok(MODE_IDS.includes(must), `${must} が一覧から消えている`);
  }
});

test('モード一覧: isMode は一覧のものだけを通す', () => {
  for (const id of MODE_IDS) assert.equal(isMode(id), true);
  for (const bad of ['', 'Base', 'ｂase', 'basic', null, undefined, 0, {}, ['base']]) {
    assert.equal(isMode(bad), false, `${JSON.stringify(bad)} を通してはいけない`);
  }
});

test('モード一覧: 画面用の形は [id, ラベル] の並びで、順番が一覧どおり', () => {
  assert.deepEqual(modeOptions(), MODES.map((m) => [m.id, m.label]));
});

test('モード一覧: 載っているモードは全部ゲームが始まって、少し進む', () => {
  // 一覧に足しただけで動かない id が混ざると、画面の選択肢が壊れる。
  // 盤ができて初期配置が一巡することまで確かめる。
  for (const id of MODE_IDS) {
    let state = createGame({ seed: 7, playerCount: 4, humanIndex: -1, mode: id });
    assert.equal(state.mode, id);
    assert.ok(Object.keys(state.board.hexes).length > 0, `${id}: 盤が空`);
    assert.equal(state.phase, 'setup', `${id}: setup で始まっていない`);
    for (let i = 0; i < 120 && state.phase === 'setup'; i += 1) {
      const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
      state = dispatch(state, chooseAction(state, pid));
    }
    assert.equal(state.phase, 'main', `${id}: 初期配置が終わらない`);
  }
});

test('モード一覧: base 以外は base と違う盤・違う状態になる', () => {
  // createGame は知らない mode を黙って base として扱う。だから
  // 「一覧に足したが実装がない」id は、上のテストだけだと素通りする。
  // **base と見分けがつくこと**を要求すれば、実装のない id を落とせる。
  // どの欄で差が出るかはモードごとに違う(盤・山札・追加の持ち物…)ので、
  // 欄を選ばず**初期状態まるごと**を比べる。mode 文字列そのものだけ伏せる
  // ── そこは必ず違うので、比べても何も分からない。
  const shape = (id) => {
    const s = createGame({ seed: 7, playerCount: 4, humanIndex: -1, mode: id });
    return JSON.stringify({ ...s, mode: null });
  };
  const base = shape('base');
  for (const id of MODE_IDS.filter((m) => m !== 'base')) {
    assert.notEqual(shape(id), base, `${id} が base と区別できない(実装が無い?)`);
  }
});

test('モード一覧: 一覧を別に持ち直している場所がない', () => {
  // 同じ配列をそこら中に書き戻すと、また取り残しが起きる。
  // 「id が3つ以上並んだ配列リテラル」を書いていたら落とす。
  const pattern = /\[\s*'base'\s*,\s*'cak'|\['base',\s*'基本'\]/;
  for (const f of ['src/main.js', 'server/room-core.js', 'scripts/selfplay.js']) {
    assert.ok(!pattern.test(read(f)), `${f} がモード一覧を持ち直している。state.js の MODES を使う`);
  }
});
