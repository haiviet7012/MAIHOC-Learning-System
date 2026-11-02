import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeUrl } from '../js/platform/router.js';
test('email destinations round trip through login routing for tests, notices and School assignments', () => {
  for (const path of ['/school/tests/test-123', '/school/announcements/notice-123', '/school/assignments/42?schoolId=7']) {
    const state = parseRoute(new URL(path, 'https://maihoc.test'));
    assert.equal(routeUrl(state), path);
  }
  assert.equal(parseRoute(new URL('https://maihoc.test/school/announcements')).announcementId, null);
});
