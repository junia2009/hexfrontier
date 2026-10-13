// 匿名のアクセス集計(src/analytics.js)のテスト。
// 「数えてはいけない環境で数えない」「余計なものを送らない」の2点を押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCount, eventPath, track, initAnalytics } from '../src/analytics.js';

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

test('analytics: イベント名は英数字とハイフンだけになる', () => {
  assert.equal(eventPath('game-start', 'cak'), 'game-start/cak');
  assert.equal(eventPath('game-end', 'online', 'sea'), 'game-end/online/sea');
  // 空や undefined の部分は飛ばす
  assert.equal(eventPath('walk', undefined), 'walk');
  // 名前や記号を混ぜても、そのままは出ていかない
  assert.equal(eventPath('demo', 'ゆう/ABCD?x=1'), 'demo/abcdx1');
});

test('analytics: ブラウザでない環境では何もしない(テストや Node から呼んでも安全)', () => {
  assert.equal(initAnalytics(undefined), false);
  assert.doesNotThrow(() => track('game-start', 'base'));
});
