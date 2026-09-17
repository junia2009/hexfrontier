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
