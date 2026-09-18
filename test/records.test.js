// 戦績と実績の画面(src/render/records.js)。
//
// **バグが出た場所と、テストが無かった場所が一致していた。**
// この画面のレイアウトはこれまでに3回直している ── 下端が隠れて読めない、
// バッジの詳細が画面に収まらない、バッジを押すとスクロールが戻る。
// 3回とも人が目で見つけて報告した。209行の純粋な文字列生成で、
// テストを書くのがいちばん簡単な形をしているのに1本も無かった。
//
// ここで押さえるのは2種類:
//   - **入れ子の形**。詳細が流れる場所の外にあること(直した内容そのもの)。
//     ここが中に戻ると、また「送らないと読めない」に逆戻りする。
//   - **中身の約束**。押せる先が全部あること、伏せるものが漏れないこと、
//     どの実績を選んでも undefined が画面に出ないこと。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACHIEVEMENTS, TIERS } from '../src/achievements.js';
import { emptyProgress } from '../src/progress.js';
import { FISH } from '../src/minigame/fish.js';
import { fishbookHtml, recordsHtml } from '../src/render/records.js';

// 1戦ぶんの記録(progress.games の中身は summarize が読む形)
const game = (over = {}) => ({
  mode: 'base', difficulty: 'hard', won: true, points: 10, turns: 60,
  players: 4, at: 1700000000000, seed: 1, ...over,
});

function played(n = 3, over = {}) {
  const p = emptyProgress();
  for (let i = 0; i < n; i += 1) p.games.push(game(over));
  return p;
}

// data-act の一覧を取る
const acts = (html) => [...html.matchAll(/data-act="([^"]+)"/g)].map((m) => m[1]);

// .panel-scroll の中身だけを切り出す。
// 入れ子があるので、対応する </div> まで数えて閉じる
// (末尾まで取ると、外に出したはずの詳細まで含んでしまう)。
// 流れる場所は1つだけという前提(2つあると「どちらを保つか」が決まらない)
function scrollPart(html) {
  const tag = '<div class="panel-scroll">';
  const open = html.indexOf(tag);
  assert.notEqual(open, -1, '流れる場所(.panel-scroll)が無い');
  assert.equal(
    html.indexOf(tag, open + 1), -1,
    '流れる場所が2つある(スクロール位置をどちらで保つか決まらない)',
  );
  let depth = 0;
  for (const m of html.slice(open).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(open, open + m.index + '</div>'.length);
  }
  throw new Error('流れる場所の </div> が閉じていない');
}

test('戦績画面: 3つのタブが出て、いま見ているものだけが選ばれている', () => {
  for (const tab of ['stats', 'ach', 'fish']) {
    const html = recordsHtml(played(), { tab });
    const sel = [...html.matchAll(/<button class="(sel)?"\s*data-act="rec-tab:(\w+)"/g)]
      .filter((m) => m[1]);
    assert.equal(sel.length, 1, `${tab}: 選ばれているタブが1つでない`);
    assert.equal(sel[0][2], tab, `${tab}: 違うタブが選ばれている`);
    for (const t of ['stats', 'ach', 'fish']) {
      assert.ok(acts(html).includes(`rec-tab:${t}`), `${tab}: ${t} へ移れない`);
    }
  }
});

// 直した内容そのもの。詳細を流れる場所の中に置くと、43個のバッジの後ろに
// 付いてしまい、上のほうのバッジを押しても画面の外に出る。
test('実績: 選んだバッジの詳細は、流れる場所の外に出す', () => {
  const p = played();
  const a = ACHIEVEMENTS[0];
  const html = recordsHtml(p, { tab: 'ach', selected: a.id });

  assert.ok(html.includes('ach-dock'), '詳細の置き場(.ach-dock)が無い');
  assert.ok(
    !scrollPart(html).includes('ach-dock'),
    '詳細が流れる場所の中にある(バッジの後ろに付いて画面の外に出る)',
  );
  // バッジのほうは流れる場所の中に居る(ここが外に出ると今度は並びが崩れる)
  assert.ok(scrollPart(html).includes('badge-a'), 'バッジが流れる場所の中に無い');
});

test('実績: バッジは全部押せて、選ぶと印が付く', () => {
  const p = played();
  const all = recordsHtml(p, { tab: 'ach' });
  for (const a of ACHIEVEMENTS) {
    assert.ok(acts(all).includes(`ach-pick:${a.id}`), `${a.id}: 押せない`);
  }

  // 選んだものにだけ sel が付く。スクロール位置を戻す処理がこの印を頼りにする
  const target = ACHIEVEMENTS.at(-1);
  const one = recordsHtml(p, { tab: 'ach', selected: target.id });
  const sels = [...one.matchAll(/class="badge-a[^"]*\bsel\b[^"]*"/g)];
  assert.equal(sels.length, 1, '選ばれているバッジが1つでない');
  assert.ok(
    one.includes(`data-act="ach-pick:${target.id}"`) && one.includes(target.desc),
    '選んだ実績の説明が出ていない',
  );
});

test('実績: 未取得は鍵を出し、取ると称号を名乗れる', () => {
  const a = ACHIEVEMENTS[0];
  const p = played();

  const locked = recordsHtml(p, { tab: 'ach', selected: a.id });
  assert.ok(locked.includes('🔒'), '未取得なのに鍵が出ていない');
  assert.ok(!acts(locked).includes(`title-set:${a.id}`), '未取得でも称号を名乗れる');

  p.achievements[a.id] = { at: 1700000000000 };
  const got = recordsHtml(p, { tab: 'ach', selected: a.id });
  assert.ok(acts(got).includes(`title-set:${a.id}`), '取得したのに称号を名乗れない');

  p.title = a.id;
  const wearing = recordsHtml(p, { tab: 'ach', selected: a.id });
  assert.ok(acts(wearing).includes('title-set:none'), '名乗っている称号を外せない');
  assert.ok(wearing.includes(`〈${a.title}〉`), '見出しに称号が出ていない');
});

// 44個 × 取得/未取得 を全部描く。1つでも壊れた実績があると
// undefined や NaN がそのまま画面に出る(バッジは押せるので気づきにくい)。
test('実績: どれを選んでも undefined や NaN が画面に出ない', () => {
  for (const a of ACHIEVEMENTS) {
    for (const has of [false, true]) {
      const p = played(2);
      if (has) p.achievements[a.id] = { at: 1700000000000 };
      const html = recordsHtml(p, { tab: 'ach', selected: a.id });
      for (const bad of ['undefined', 'NaN', 'null', '[object Object]']) {
        assert.ok(!html.includes(bad), `${a.id}(${has ? '取得' : '未取得'}): ${bad} が出ている`);
      }
    }
  }
});

test('実績: 進捗バーは 100% を超えない', () => {
  const p = played(999); // どの条件も振り切る回数
  for (const a of ACHIEVEMENTS) {
    const html = recordsHtml(p, { tab: 'ach', selected: a.id });
    for (const m of html.matchAll(/class="pbar"><i style="width:([\d.]+)%"/g)) {
      assert.ok(Number(m[1]) <= 100, `${a.id}: バーが ${m[1]}% まで伸びた`);
    }
  }
});

test('実績: 等級のまとめは全等級ぶん出る', () => {
  const html = recordsHtml(played(), { tab: 'ach' });
  for (const tier of TIERS) {
    assert.ok(html.includes(`tchip t-${tier}`), `${tier}: 等級のまとめに無い`);
  }
});

// 図鑑は「まだ釣っていないものを見せない」のが決まり。
// ここが漏れると、港をめぐって探す楽しみが無くなる。
test('釣り図鑑: まだ釣っていない魚は名前を伏せる', () => {
  const p = emptyProgress();
  const target = FISH.at(-1);
  p.fish[target.id] = { best: 42, n: 3 };

  const html = fishbookHtml(p);
  assert.ok(html.includes(target.name), '釣った魚の名前が出ていない');
  assert.ok(html.includes('42 cm'), '自己最高が出ていない');
  for (const f of FISH) {
    if (f.id === target.id) continue;
    assert.ok(!html.includes(f.name), `${f.id}: まだ釣っていないのに名前が見えている`);
  }
  assert.ok(html.includes('???'), '伏せ字が出ていない');
});

test('戦績画面: まっさらでも落ちない・遊ぶとその旨が消える', () => {
  const empty = recordsHtml(emptyProgress(), { tab: 'stats' });
  assert.ok(empty.includes('まだ対戦の記録がありません'), '案内が出ていない');
  assert.ok(!recordsHtml(played(), { tab: 'stats' }).includes('まだ対戦の記録がありません'),
    '遊んだのに「記録がありません」が残っている');

  // 知らないタブ・知らない実績 id でも描ける
  for (const tab of ['stats', 'ach', 'fish']) {
    assert.ok(recordsHtml(emptyProgress(), { tab, selected: 'no-such-badge' }).length > 0);
  }
});

test('戦績画面: 全部消すときは確認を挟む', () => {
  const p = played();
  assert.ok(!recordsHtml(p, { tab: 'stats' }).includes('元には戻せません'),
    '押す前から警告が出ている');
  const confirming = recordsHtml(p, { tab: 'stats', confirmingClear: true });
  assert.ok(confirming.includes('元には戻せません'), '警告が出ていない');
});

test('戦績画面: 財布はいつでも見える。通算は増えたときだけ添える', () => {
  const p = played();
  p.coins = 0; p.coinsEarned = 0;
  const zero = recordsHtml(p, { tab: 'stats' });
  assert.match(zero, /class="purse"/, '0枚のときに財布が消えている');
  assert.doesNotMatch(zero, /通算/, '稼ぐ前から通算が出ている');

  p.coins = 120; p.coinsEarned = 120;
  assert.doesNotMatch(recordsHtml(p, { tab: 'stats' }), /通算/,
    '使っていないのに通算が出ている(手持ちと同じ値の二重表示)');

  p.coins = 40; p.coinsEarned = 120;  // 80 使った
  const spent = recordsHtml(p, { tab: 'stats' });
  assert.match(spent, /通算 120/, '使ったあとに通算が出ていない');
  assert.match(spent, />40</, '手持ちが出ていない');

  // どのタブでも見える(財布はタブの外)
  for (const tab of ['stats', 'ach', 'fish']) {
    assert.match(recordsHtml(p, { tab }), /class="purse"/, `${tab}: 財布が無い`);
  }
});
