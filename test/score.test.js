// インタラクティブミュージックの譜面(src/audio/score.js)。
//
// 音は耳で確かめるしかないが、**「場面ごとに本当に違うか」「高まりが
// 効いているか」「同じ場面なら同じ和音になるか」は数で確かめられる。**
// ここが崩れると、場面を切り替えても同じ曲に聞こえたり、切り替えのたびに
// 進行が飛んで聞こえたりする。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCENE, SCENES, chordAt, chordDur, layerGains, melodyChance,
  raceIntensity, raceScene, sceneOf,
} from '../src/audio/score.js';
import { MEETS } from '../src/minigame/meets.js';

test('譜面: 場面の定義がそろっている', () => {
  for (const [name, s] of Object.entries(SCENES)) {
    assert.ok(s.mode && s.cadence, `${name}: 旋法か和音進行がない`);
    assert.ok(s.dur > 1 && s.dur < 12, `${name}: 和音の長さが極端 ${s.dur}`);
    assert.ok(s.rush > 0 && s.rush <= 1, `${name}: 詰めかたが範囲外 ${s.rush}`);
    // どの場面でも、鳴っているパートが1つ以上ある
    const on = Object.values(layerGains(name, 0)).filter((v) => v > 0).length;
    assert.ok(on >= 2, `${name}: 高まり 0 で鳴るパートが ${on} しかない`);
  }
  assert.ok(SCENES[DEFAULT_SCENE], '既定の場面が無い');
  // 知らない名前は既定へ倒す(場面を足し忘れても無音にならない)
  assert.equal(sceneOf('しらない場面'), SCENES[DEFAULT_SCENE]);
});

// **すべての集まりに場面があること。** 遊びを足したときに忘れると、
// ミニゲーム中だけタイトルの曲が鳴り続ける。
test('譜面: すべての集まりに場面がある', () => {
  for (const m of Object.values(MEETS)) {
    assert.ok(SCENES[m.id], `${m.id}: 場面が無い`);
  }
  for (const name of ['title', 'game', 'walk']) {
    assert.ok(SCENES[name], `${name}: 場面が無い`);
  }
});

// **場面ごとに本当に違うこと。** 同じ音・同じ速さ・同じ編成なら、
// 切り替えても何も起きていないのと同じ。
test('譜面: 場面ごとに曲想が違う', () => {
  const sig = (name) => JSON.stringify([
    chordAt(name, 0).notes, Math.round(chordDur(name, 0) * 10), layerGains(name, 0),
  ]);
  const seen = new Map();
  for (const name of Object.keys(SCENES)) {
    const s = sig(name);
    assert.ok(!seen.has(s), `${name} と ${seen.get(s)} が同じ曲想`);
    seen.set(s, name);
  }
  // 動きのある場面は、落ち着いた場面より速い
  assert.ok(chordDur('logroll', 0) < chordDur('walk', 0), '丸太乗りが散策より遅い');
  assert.ok(chordDur('dragonhunt', 0) < chordDur('fishing', 0), '竜が釣りより遅い');
  // 刻みは動きのある場面にだけ出す
  assert.equal(layerGains('fishing', 0).pulse, 0, '凪いだ場面に刻みが出ている');
  assert.ok(layerGains('raid', 0).pulse > 0.5, '行進曲に刻みが無い');
});

// **使っている音そのものが場面で入れ替わること。**
//
// 速さと編成だけ変えても「同じ曲の濃さ違い」にしかならない。曲想を分けている
// のは旋法(どの音を使うか)なので、そこが動いていることを別に押さえる
// ── 上の「曲想が違う」は速さ・編成でも通ってしまい、ここを守れない。
test('譜面: 場面ごとに使う音が入れ替わる', () => {
  // その場面で鳴りうる音の集合(オクターブを畳んで比べる)
  const pcs = (name) => [...new Set(chordAt(name, 0).scale.map((m) => ((m % 12) + 12) % 12))]
    .sort((a, b) => a - b).join(',');
  const sets = new Set(Object.keys(SCENES).map(pcs));
  assert.ok(sets.size >= 4, `音の並びが ${sets.size} 種類しかない(場面ごとの色が出ない)`);

  // 意味のある対比を名指しで押さえる
  assert.notEqual(pcs('walk'), pcs('game'), '散策と対戦が同じ音階(散策は明るい側へ)');
  assert.notEqual(pcs('dragonhunt'), pcs('game'), '竜と対戦が同じ音階(竜は不穏な側へ)');
  assert.notEqual(pcs('logroll'), pcs('game'), '丸太乗りと対戦が同じ音階');
  // 竜は「低い2度」を持つ(フリギア)。ここが不穏さの正体
  const second = (name) => chordAt(name, 0).scale
    .map((m) => (((m - chordAt(name, 0).scale[0]) % 12) + 12) % 12).includes(1);
  assert.ok(second('dragonhunt'), '竜に低い2度が無い(不穏に聞こえない)');
  assert.ok(!second('walk'), '散策に低い2度が入っている');
  // 5音の場面は本当に5音(何を弾いても濁らない、が売り)
  for (const name of ['logroll', 'daifugo']) {
    assert.equal(pcs(name).split(',').length, 5, `${name}: 5音になっていない`);
  }
  // 竜は低く鳴らす(オクターブ下げ)
  assert.ok(chordAt('dragonhunt', 0).notes[0] < chordAt('game', 0).notes[0], '竜が低くない');
});

// **進行が 4 和音で巡回すること。** ここが揺れると、場面を鳴らし直す
// たびに進行が飛んで聞こえる。番号は小節数なので前へも後ろへも回る
// (bgm.js は場面を替えるとき bar を 0 に戻すが、番号を跨いでも
// 同じ場所には同じ和音が来ていないと「同じ曲」に聞こえない)。
test('譜面: 進行が4和音で巡回する', () => {
  for (const name of Object.keys(SCENES)) {
    const cycle = [0, 1, 2, 3].map((i) => chordAt(name, i));
    // 1周ぶんが全部違う(和音が動かないと進行にならない)
    const uniq = new Set(cycle.map((c) => c.notes.join('/')));
    assert.equal(uniq.size, 4, `${name}: 1周に同じ和音が混ざっている`);
    // **輪の継ぎ目でも和音が動く。** 最後と次の周の頭が同じだと、
    // そこだけ和音が2小節ぶん止まって聞こえる
    assert.notDeepEqual(chordAt(name, 3).notes, chordAt(name, 4).notes,
      `${name}: 周の継ぎ目で和音が止まる`);
    // 前へ回る
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(chordAt(name, i), chordAt(name, i + 4), `${name}#${i}: 先へ巡回しない`);
    }
    // **後ろへも回る。** −1 は 1 周前の最後の和音
    assert.deepEqual(chordAt(name, -1), cycle[3], `${name}: 後ろへ巡回しない`);
    assert.deepEqual(chordAt(name, -4), cycle[0], `${name}: 後ろへ1周できない`);
  }
});

test('譜面: 和音と音階が音として筋が通っている', () => {
  for (const name of Object.keys(SCENES)) {
    // **1周ぶん全部を見る。** 0 番だけだと、どの場面も主和音 [0,2,4] で
    // 素直に並ぶので、転回する 1〜3 番の粗さを見逃す。
    for (const i of [0, 1, 2, 3]) {
      const c = chordAt(name, i);
      const tag = `${name}#${i}`;
      assert.equal(c.notes.length, 3, `${tag}: 和音が3声でない`);
      // 3声が別々の音(重なると和音が痩せる)
      assert.equal(new Set(c.notes).size, 3, `${tag}: 和音の音が重なっている`);
      // 狭い音域に収める(転回して近い声部に置く)。
      // 広がるとパッドがオクターブをまたいで濁る
      const span = Math.max(...c.notes) - Math.min(...c.notes);
      assert.ok(span > 0 && span <= 12, `${tag}: 和音が ${span} 半音に散っている`);
      // ドローンは和音の**どの音より**低い
      assert.ok(c.drone < Math.min(...c.notes), `${tag}: ドローンが和音に食い込む`);
      // 人が聞ける範囲に収まっている
      assert.ok(c.drone >= 12, `${tag}: ドローンが低すぎる ${c.drone}`);
      assert.ok(Math.max(...c.notes) <= 108, `${tag}: 和音が高すぎる`);
      // 旋律に使う音は和音より上(ぶつからない)
      assert.ok(c.scale.every(Number.isFinite), `${tag}: 音階が壊れている`);
      assert.ok(Math.min(...c.scale) > Math.min(...c.notes), `${tag}: 旋律が和音に潜る`);
    }
  }
});

// **高まりが効いていること。** 効かないなら「勝利への近さ」を渡す意味がない。
test('譜面: 高まると速く・厚くなる', () => {
  assert.ok(chordDur('game', 1) < chordDur('game', 0), '高まっても速くならない');
  const lo = layerGains('game', 0);
  const hi = layerGains('game', 1);
  assert.ok(Object.keys(hi).some((k) => hi[k] > lo[k]), '高まっても厚くならない');
  assert.ok(melodyChance('game', 1) > melodyChance('game', 0), '旋律の出番が増えない');
  // **足しぶんが頭打ちで捨てられていないこと。** base + add が 1 を超えていると、
  // 宣言したぶんだけ動かない(実際これで対戦のドローンが不動になっていた)。
  for (const [name, s] of Object.entries(SCENES)) {
    for (const [part, { base, add }] of Object.entries(s.layers)) {
      assert.ok(base + add <= 1, `${name}.${part}: 足しぶんが頭打ちで捨てられる`);
    }
  }
  // 音量は 0〜1 に収まる(足しすぎて割れない)
  for (const name of Object.keys(SCENES)) {
    for (const k of [0, 0.5, 1]) {
      for (const v of Object.values(layerGains(name, k))) {
        assert.ok(v >= 0 && v <= 1, `${name}: 音量が範囲外 ${v}`);
      }
    }
  }
  // おかしな高まりを渡しても壊れない
  for (const bad of [NaN, -5, 99, undefined, null]) {
    assert.ok(chordDur('game', bad) > 0, `高まり ${bad} で長さが壊れる`);
  }
});

// **勝利への近さで段が変わる。** 誰かが上がりに迫ると曲想ごと入れ替わる。
test('譜面: 勝利への近さで段が変わる', () => {
  assert.equal(raceScene(4, 10), 'game', '序盤から張り詰めている');
  assert.equal(raceScene(6, 10), 'game', '残り4点で早くも切り替わる');
  assert.equal(raceScene(7, 10), 'game-close', '残り3点で接近にならない');
  assert.equal(raceScene(8, 10), 'game-close', '残り2点で接近にならない');
  assert.equal(raceScene(9, 10), 'game-final', '王手にならない');
  assert.equal(raceScene(10, 10), 'game-final', '上がっているのに王手でない');
  // 目標が違うルールでも同じ形になる(都市と騎士は13点)
  assert.equal(raceScene(12, 13), 'game-final', '13点ルールで王手にならない');
  assert.equal(raceScene(10, 13), 'game-close', '13点ルールで接近にならない');
  assert.equal(raceScene(9, 13), 'game', '13点ルールで早く切り替わりすぎる');
  // 段は戻らない(点が増えて曲が緩むことはない)
  const rank = { game: 0, 'game-close': 1, 'game-final': 2 };
  let prev = -1;
  for (let p = 0; p <= 10; p++) {
    const r = rank[raceScene(p, 10)];
    assert.ok(r >= prev, `点が増えたのに段が下がった: ${p}点`);
    prev = r;
  }
  // 壊れた値でも平常に倒す
  for (const bad of [NaN, undefined, null]) assert.equal(raceScene(bad, 10), 'game');
  assert.equal(raceScene(5, 0), 'game');
});

// **段が本当に別の曲になっていること。** ここが弱いと、段を分けた意味がない
// ── 実際、はじめは音量と速さだけを動かしていて、遊んでも気づけなかった。
test('譜面: 対戦の3段が別の曲になっている', () => {
  const stages = ['game', 'game-close', 'game-final'];
  const pcs = (n) => [...new Set(chordAt(n, 0).scale.map((m) => ((m % 12) + 12) % 12))]
    .sort((a, b) => a - b).join(',');

  // 段が上がるほど速くなる
  for (let i = 1; i < stages.length; i++) {
    assert.ok(chordDur(stages[i], 0) < chordDur(stages[i - 1], 0),
      `${stages[i]}: 前の段より速くない`);
  }
  // **和音進行が入れ替わる。** 平常と接近は同じ旋法なので、ここが唯一の手がかり
  assert.notDeepEqual(chordAt('game', 1).notes, chordAt('game-close', 1).notes,
    '平常と接近で和音進行が同じ');
  // 王手は使う音そのものが変わる(短調寄りへ)
  assert.notEqual(pcs('game-final'), pcs('game'), '王手で使う音が変わらない');
  // 王手は低く鳴る
  assert.ok(chordAt('game-final', 0).notes[0] < chordAt('game', 0).notes[0] - 6,
    '王手が十分低くない');
  // 刻みは平常では出ず、段が上がるごとに増える
  assert.equal(layerGains('game', 0).pulse, 0, '平常に刻みが出ている');
  assert.ok(layerGains('game-close', 0).pulse > 0.5, '接近に刻みが無い');
  assert.ok(layerGains('game-final', 0).pulse > layerGains('game-close', 0).pulse,
    '王手で刻みが増えない');
  // **速さの差が耳に分かる大きさか。** 平常と王手で 1.5 倍以上
  assert.ok(chordDur('game', 0) / chordDur('game-final', 0) >= 1.5,
    `平常と王手の速さの差が小さい: ${chordDur('game', 0)} → ${chordDur('game-final', 0)}`);

  // **段が上がるほど旋律は引っこむ。** 笛が歌うのをやめて刻みが出てくると、
  // 「濃さが変わった」ではなく「曲が変わった」と聞こえる ── 実測でも、
  // ここを動かして初めて平常と接近の差が基準の切り替えに並んだ。
  for (let i = 1; i < stages.length; i++) {
    assert.ok(melodyChance(stages[i], 0) < melodyChance(stages[i - 1], 0),
      `${stages[i]}: 前の段より旋律が引っこんでいない`);
    assert.ok(layerGains(stages[i], 0).flute < layerGains(stages[i - 1], 0).flute,
      `${stages[i]}: 前の段より笛が引っこんでいない`);
  }
  // 平常だけが「歌う」側(旋律が半分以上の和音で出る)
  assert.ok(melodyChance('game', 0) > 0.5, '平常で旋律が出てこない');
  assert.ok(melodyChance('game-final', 0) < 0.25, '王手でまだ旋律が歌っている');
});

// 段のなかの細かい濃さ。段の切り替えが主役なので、こちらは味つけ
test('譜面: 段のなかの濃さが段と食い違わない', () => {
  assert.equal(raceIntensity(4, 10), 0, '序盤から濃い');
  assert.ok(raceIntensity(8, 10) > 0, '接近で濃さが動かない');
  assert.equal(raceIntensity(9, 10), 1, '王手で最大にならない');
  // 単調に増える
  let prev = -1;
  for (let p = 0; p <= 10; p++) {
    const v = raceIntensity(p, 10);
    assert.ok(v >= prev, `点が増えたのに下がった: ${p}点`);
    prev = v;
  }
  // 段が上がる点で濃さも上がっている(ちぐはぐに鳴らない)
  for (let p = 1; p <= 10; p++) {
    if (raceScene(p, 10) !== raceScene(p - 1, 10)) {
      assert.ok(raceIntensity(p, 10) > raceIntensity(p - 1, 10),
        `${p}点: 段が上がったのに濃さが据え置き`);
    }
  }
  for (const bad of [NaN, undefined, null]) assert.equal(raceIntensity(bad, 10), 0);
  assert.equal(raceIntensity(5, 0), 0);
});
