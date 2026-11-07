import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeUrl } from '../js/platform/router.js';
test('Retired School deep links resolve to the retained class page', () => {
  for (const path of ['/school', '/school/', '/school/assignment-management', '/learning?route=organization', '/learning?route=assignment-management']) {
    assert.deepEqual(parseRoute(new URL(path, 'https://maihoc.test')), {route:'school'}, path);
  }
  for (const route of ['organization','assignment-management']) assert.equal(routeUrl({route}), '/school/classes');
  assert.equal(parseRoute(new URL('https://maihoc.test/school?route=question-bank')).route,'question-bank');
});
