// 畳める章(src/render/sections.js)と、それを通した説明書・動画の一覧。
//
// **実機で「縦長すぎる」と言われた。** 390×844 で測ると
//   🎪 集まり 7769px(画面18枚)/ 🃏 進歩カード 2283px / ⚙️ 設定 1870px
//   ▶ 動画の一覧 2524px(40本)
// あって、読みたい1章に着くまで何画面も巻くことになっていた。
//
// ここが押さえるもの:
//   1. 見出しごとに章に切れている(切り出しの境目)
//   2. **小見出し(class="sub")は章にしない** ── 章にすると
//      「🎮 やりかた」が5回並んだ目次になって、かえって探せない
//   3. 最初の見出しより前(導入・動画への導線)は畳まない
//   4. 中身を落としていない(畳むのは見せ方だけ。文は1字も減らさない)
//   5. 実物のタブぜんぶが、ちゃんと章に割れている

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapsible, sectionCount } from '../src/render/sections.js';
import { RULES_TABS, rulesHtml } from '../src/render/rules-content.js';
import { demoIndexHtml } from '../src/render/demo-index.js';

// タグを落として、文字だけにする(中身が消えていないかを見るため)
const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');

test('章: 見出しごとに details へ割れる', () => {
  const src = '<p>まえおき</p><h4>ひとつめ</h4><p>A</p><h4>ふたつめ</h4><p>B</p>';
  const out = collapsible(src);
  assert.equal(sectionCount(src), 2);
  assert.equal((out.match(/<details class="rsec"/g) ?? []).length, 2);
  assert.match(out, /<summary>ひとつめ<\/summary>/);
  assert.match(out, /<summary>ふたつめ<\/summary>/);
  // まえおきは章の外(畳まれない)
  assert.match(out, /<div class="rsec-intro"><p>まえおき<\/p><\/div>/);
  // 章の中身は、その見出しから次の見出しの手前まで
  assert.match(out, /<summary>ひとつめ<\/summary><div class="rsec-body"><p>A<\/p><\/div>/);
});

test('章: 小見出し(sub)は章にしない', () => {
  const src = '<h4>章</h4><p>A</p><h4 class="sub">小見出し</h4><p>B</p>';
  assert.equal(sectionCount(src), 1);
  const out = collapsible(src);
  assert.equal((out.match(/<details/g) ?? []).length, 1);
  // 小見出しは章の中にそのまま残る
  assert.match(out, /<h4 class="sub">小見出し<\/h4>/);
});

test('章: 中身は1字も減らない', () => {
  const src = '<p>まえ</p><h4>あ</h4><p>いろは</p><h4 class="sub">に</h4><p>ほへと</p><h4>ち</h4><p>りぬ</p>';
  // 見出しの字は <summary> へ移るだけ。文字の集合として一致すること
  assert.equal(textOf(collapsible(src)), textOf(src));
});

test('章: 開けておくところを選べる', () => {
  const src = '<h4>あ</h4><p>A</p><h4>い</h4><p>B</p>';
  assert.equal((collapsible(src).match(/ open>/g) ?? []).length, 0, '既定で開いている');
  assert.equal((collapsible(src, { open: 'all' }).match(/ open>/g) ?? []).length, 2);
  const one = collapsible(src, { open: 1 });
  assert.match(one, /<details class="rsec"><summary>あ/, '1つめが開いている');
  assert.match(one, /<details class="rsec" open><summary>い/, '2つめが開いていない');
});

test('章: 見出しが無ければ、そのまま返す', () => {
  const src = '<p>ただの文</p>';
  assert.equal(collapsible(src), src);
});

test('章: 章の境目の区切り線は落とす(箱が仕切るので)', () => {
  const src = '<h4>あ</h4><p>A</p><hr class="mg-hr"><h4>い</h4><p>B</p>';
  const out = collapsible(src);
  assert.ok(!out.includes('<hr'), `区切り線が残っている: ${out}`);
});

test('説明書: どのタブも章に割れていて、目次が出る', () => {
  for (const [id, label] of RULES_TABS) {
    const html = rulesHtml(id);
    const n = (html.match(/<details class="rsec"/g) ?? []).length;
    assert.ok(n >= 2, `「${label}」が ${n} 章にしか割れていない(畳む意味がない)`);
    // 既定ではどれも開いていない = まず目次
    assert.equal((html.match(/<details class="rsec" open>/g) ?? []).length, 0,
      `「${label}」が既定で開いている ── 目次が画面の外へ押し出される`);
    // 全部開く指示は効く
    const all = rulesHtml(id, { openAll: true });
    assert.equal((all.match(/<details class="rsec" open>/g) ?? []).length, n,
      `「${label}」で「ぜんぶ開く」が効いていない`);
  }
});

test('説明書: 「ぜんぶ開く」の口がある', () => {
  assert.match(rulesHtml('meets'), /data-act="rules-openall"/);
  assert.match(rulesHtml('meets'), /ぜんぶ開く/);
  assert.match(rulesHtml('meets', { openAll: true }), /ぜんぶ閉じる/);
});

// **目次が目次になっているか。** 章の名前が同じ字で並ぶと探せない
// ── 「🎮 やりかた」が5回出ていたのがこれ(sub を付けて直した)。
test('説明書: 目次に同じ名前が2つ並ばない', () => {
  for (const [id, label] of RULES_TABS) {
    const names = [...rulesHtml(id).matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => m[1]);
    assert.equal(new Set(names).size, names.length,
      `「${label}」の目次に同じ名前が並んでいる: ${names.join(' / ')}`);
  }
});

test('動画の一覧: 節ごとに畳めて、畳んだ行に本数と長さが出る', () => {
  const sections = [
    { id: 'a', icon: '🅰', title: 'はじめて', lead: 'みじかく' },
    { id: 'b', icon: '🅱', title: 'しま', lead: 'あるく' },
  ];
  const chapters = [
    { id: 'x', section: 'a', title: 'X', lead: 'x', seconds: 30 },
    { id: 'y', section: 'a', title: 'Y', lead: 'y', seconds: 30 },
    { id: 'z', section: 'b', title: 'Z', lead: 'z', seconds: 45 },
  ];
  const html = demoIndexHtml(sections, chapters);
  assert.equal((html.match(/<details class="demo-sec"/g) ?? []).length, 2);
  assert.equal((html.match(/<details class="demo-sec" open>/g) ?? []).length, 0,
    '既定で開いている ── まず目次を見せたい');
  // 畳んだ1行で「何本・どれくらい」が分かる
  assert.match(html, /<span class="demo-sec-len">2本<small>約1分<\/small><\/span>/);
  assert.match(html, /data-act="demos-openall"/);
  // 名指しで開ける(指したものだけ)/ 全部開ける
  const openB = demoIndexHtml(sections, chapters, { open: 'b' });
  const opened = [...openB.matchAll(/<details class="demo-sec"( open)?>\s*<summary><span class="demo-sec-head"><b>(.)/gu)]
    .filter((m) => m[1]).map((m) => m[2]);
  assert.deepEqual(opened, ['🅱'], `開いている節が合わない: ${opened.join(',')}`);
  assert.equal((demoIndexHtml(sections, chapters, { open: 'all' })
    .match(/<details class="demo-sec" open>/g) ?? []).length, 2);
  // 空の節は出さない(章が1本も無い節を目次に並べない)
  const one = demoIndexHtml([...sections, { id: 'c', icon: '🅲', title: 'から', lead: '' }], chapters);
  assert.equal((one.match(/<details class="demo-sec"/g) ?? []).length, 2);
});
