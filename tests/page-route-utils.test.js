const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const routeUtils = require(path.join(__dirname, '..', 'site', 'static', 'page-route-utils.js'));

test('resolveManagedPageSlug prefers URL pathname over root slug when fallback page shell is served', () => {
  const resolved = routeUtils.resolveManagedPageSlug({
    defaultSlug: 'index',
    rootSlug: 'index',
    pathname: '/tasks',
    search: ''
  });
  assert.equal(resolved, 'tasks');
});

test('resolveManagedPageSlug prefers explicit query slug over pathname', () => {
  const resolved = routeUtils.resolveManagedPageSlug({
    defaultSlug: 'index',
    rootSlug: 'index',
    pathname: '/tasks',
    search: '?page_slug=reading-list'
  });
  assert.equal(resolved, 'reading-list');
});

test('slugFromPathname normalizes /pages/*.html paths', () => {
  assert.equal(routeUtils.slugFromPathname('/pages/projects.html'), 'projects');
  assert.equal(routeUtils.slugFromPathname('/pages/index.html'), 'index');
});

test('canonicalPathFromSlug and normalizePath map index to root', () => {
  assert.equal(routeUtils.canonicalPathFromSlug('index'), '/');
  assert.equal(routeUtils.canonicalPathFromSlug('reading-list'), '/reading-list');
  assert.equal(routeUtils.normalizePath('/pages/index.html'), '/');
  assert.equal(routeUtils.normalizePath('/pages/reading-list.html'), '/reading-list');
});
