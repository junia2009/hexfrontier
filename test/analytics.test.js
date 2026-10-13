// 匿名のアクセス集計(src/analytics.js)のテスト。
// 「数えてはいけない環境で数えない」「表に無いものは送らない」
// 「集計画面で読める名前になる」の3点を押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCount, describe, track, initAnalytics, PAGEVIEW } from '../src/analytics.js';
import { MODE_IDS } from '../src/state.js';

const PAGES = { hostname: 'junia2009.github.io', search: '' };

test('analytics: 公開サイトで普通に開いたときだけ数える', () => {
  assert.equal(shouldCount(PAGES), true);
});

test('analytics: 手元の開発・E2E・再現用の URL では数えない', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '']) {
    assert.equal(shouldCount({ ...PAGES, hostname }), false, hostname);
  }
  assert.equal(shouldCount({ ...PAGES, webdriver: true }), false, 'E2E');
  assert.equal(shouldCount({ ...PAGES, search: '?seed=11' }), false, 'seed');
  assert.equal(shouldCount({ ...PAGES, search: '?server=http://127.0.0.1:8787' }), false, 'server');
  // 関係のない引数なら数える(Qiita などのリンクに何か付いていても落とさない)
  assert.equal(shouldCount({ ...PAGES, search: '?utm_source=qiita' }), true);
});

test('analytics: 集計画面には日本語の「何をしたか」で出る', () => {
  assert.deepEqual(describe('game-start', 'cak'), {
    path: '🎲 CPU戦を始めた ― 都市と騎士', title: 'CPU 相手の対戦を開始した',
  });
  assert.equal(describe('game-end-online', 'sea').path, '🏁 オンライン対戦を最後まで遊んだ ― 航海者たち');
  assert.equal(describe('walk', 'dragon').path, '🚶 島を歩いた ― ドラゴンの島');
  assert.equal(describe('walk', 'base').path, '🚶 島を歩いた ― 基本の島');
  assert.equal(describe('demo', 'ダイスと資源').path, '▶ あそびかたデモを見た ― ダイスと資源');
  assert.equal(describe('room-join').path, '🌐 合言葉で部屋に入った');
  assert.equal(PAGEVIEW.path, '🏝 ゲームを開いた');
});

test('analytics: どのルールにも呼び名がある(ルールを足したら表にも足す)', () => {
  for (const m of MODE_IDS) {
    for (const key of ['game-start', 'game-end-cpu', 'online-start', 'game-end-online', 'walk']) {
      assert.ok(describe(key, m), `${key} / ${m} の呼び名がない`);
    }
  }
});

test('analytics: 表に無い出来事・知らない値は送らない', () => {
  assert.equal(describe('なにか', 'base'), null);
  assert.equal(describe('game-start', 'ABCD'), null, '知らないルール(合言葉など)');
  assert.equal(describe('game-start', undefined), null);
  assert.equal(describe('demo', ''), null);
  assert.equal(describe('demo', 'x'.repeat(31)), null, '長すぎる章名');
  assert.equal(describe('demo', { name: 'ゆう' }), null, '文字列でない');
});

test('analytics: ブラウザでない環境では何もしない(テストや Node から呼んでも安全)', () => {
  assert.equal(initAnalytics(undefined), false);
  assert.doesNotThrow(() => track('game-start', 'base'));
});
