const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Exercise the actual TypeScript domain and API code with Node's test runner.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { monday, shiftWeek, weekBounds, parseDay } = require('../features/sorting/week.ts');
const { commitDecisions } = require('../features/sorting/commit.ts');
const { normalizeUrl, ImmichClient } = require('../lib/immich.ts');
const connection = { url: 'https://photos.example.test', key: 'test-only', userId: 'me', name: 'Test' };
const asset = (id, extra = {}) => ({ id, ownerId: 'me', fileCreatedAt: '2026-10-20T12:00:00Z', type: 'IMAGE', ...extra });
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

test('weeks start Monday, handle year boundaries and reject invalid dates', () => {
  assert.equal(monday(parseDay('2026-10-25')), '2026-10-19');
  assert.equal(shiftWeek('2026-12-28', 1), '2027-01-04');
  assert.throws(() => parseDay('2026-02-30'));
  assert.throws(() => parseDay('19/10/2026'));
});
test('week range follows local midnight across a daylight-saving change', () => {
  const previous = process.env.TZ; process.env.TZ = 'Europe/Amsterdam';
  const b = weekBounds('2026-10-19');
  assert.equal(b.start, '2026-10-18T22:00:00.000Z');
  assert.equal(b.end, '2026-10-25T23:00:00.000Z');
  process.env.TZ = previous;
});
test('URL normalisation rejects credentials and query strings', () => {
  assert.equal(normalizeUrl(' https://photos.test/api/ '), 'https://photos.test');
  assert.throws(() => normalizeUrl('https://user:secret@photos.test'));
  assert.throws(() => normalizeUrl('javascript:alert(1)'));
  assert.throws(() => normalizeUrl('https://photos.test?key=secret'));
});
test('week fetches every cursor page, removes duplicates and excludes other users/trash', async () => {
  const calls = [];
  const api = new ImmichClient(connection, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return response({ assets: calls.length === 1 ? { items: [asset('a'), asset('other', { ownerId: 'someone' })], nextCursor: 'next' } : { items: [asset('a'), asset('b'), asset('trash', { isTrashed: true })], nextCursor: null } });
  });
  assert.deepEqual((await api.week('2026-10-19')).map(x => x.id), ['a', 'b']);
  assert.equal(calls[1].cursor, 'next');
  assert.equal(calls[0].filter.trashedAt.eq, null);
  assert.equal(calls[0].filter.visibility.eq, 'timeline');
  assert.ok(calls[0].filter.takenAt.lt);
});
test('repeated cursors fail rather than looping or silently truncating the week', async () => {
  const api = new ImmichClient(connection, async () => response({ assets: { items: [], nextCursor: 'same' } }));
  await assert.rejects(api.week('2026-10-19'), /repeated a page/);
});
test('disabled trash blocks every delete call', async () => {
  const methods = [];
  const api = new ImmichClient(connection, async (url, options) => {
    methods.push(options.method);
    return response(url.endsWith('/features') ? { trash: false } : { trashDays: 30 });
  });
  await assert.rejects(api.trash(asset('a')), /Trash is disabled/);
  assert.ok(!methods.includes('DELETE'));
});
test('trash checks ownership and explicitly refuses permanent deletion', async () => {
  let body;
  const api = new ImmichClient(connection, async (url, options) => {
    if (url.endsWith('/features')) return response({ trash: true });
    if (url.endsWith('/config')) return response({ trashDays: 30 });
    if (options.method === 'DELETE') { body = JSON.parse(options.body); return new Response(null, { status: 204 }); }
    return response(asset('a'));
  });
  await api.trash(asset('a'));
  assert.deepEqual(body, { ids: ['a'], force: false });
});
test('album retry accepts duplicate, rejects missing or failed results', async () => {
  const duplicate = new ImmichClient(connection, async () => response([{ id: 'a', success: false, error: 'duplicate' }]));
  await duplicate.keep('a', 'album');
  const denied = new ImmichClient(connection, async () => response([{ id: 'a', success: false, error: 'no_permission' }]));
  await assert.rejects(denied.keep('a', 'album'), /Could not add/);
});
test('other users assets cannot be deleted even if an ID is staged incorrectly', async () => {
  let deleted = false;
  const api = new ImmichClient(connection, async (url, options) => {
    if (options.method === 'DELETE') deleted = true;
    return response(url.endsWith('/features') ? { trash: true } : url.endsWith('/config') ? { trashDays: 30 } : asset('a', { ownerId: 'other' }));
  });
  await assert.rejects(api.trash(asset('a')), /only trash your own/);
  assert.equal(deleted, false);
});
test('partial commit persists only successful decisions and stops on failure', async () => {
  const done = [], actions = [];
  const decisions = [
    { kind: 'trash', asset: asset('trash') },
    { kind: 'keep', asset: asset('a'), albumId: 'album' },
    { kind: 'keep', asset: asset('b'), albumId: 'album' },
  ];
  await assert.rejects(commitDecisions(decisions, {
    keep: async id => { actions.push(id); if (id === 'b') throw Error('offline'); },
    trash: async () => { actions.push('trash'); },
  }, id => done.push(id)), /offline/);
  assert.deepEqual(actions, ['a', 'b']);
  assert.deepEqual(done, ['a']);
});
test('keep without album completes locally without any server mutation', async () => {
  const done = [], calls = [];
  await commitDecisions([{ kind: 'keep', asset: asset('a') }], { keep: async () => calls.push('album'), trash: async () => calls.push('trash') }, id => done.push(id));
  assert.deepEqual(done, ['a']);
  assert.deepEqual(calls, []);
});
test('authentication failure reports an actionable error', async () => {
  const api = new ImmichClient(connection, async () => new Response(null, { status: 403 }));
  await assert.rejects(api.albums(), /lacks permission/);
});
test('saved progress survives reload, stays account-scoped, and undo never clears another account', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const storage = new Map();
  const adapter = {
    getItem: async name => storage.get(name) ?? null,
    setItem: async (name, value) => { storage.set(name, value); },
    removeItem: async name => { storage.delete(name); },
  };
  let store;
  try {
    Module._load = function (request, ...args) {
      if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: adapter };
      return originalLoad.call(this, request, ...args);
    };
    store = require('../store/useSortStore.ts').useSortStore;
  } finally { Module._load = originalLoad; }
  await store.persist.rehydrate();
  const d = { kind: 'keep', asset: asset('a'), albumId: 'album', week: '2026-10-19', at: 1 };
  store.getState().stage('server-a|user-a', d);
  store.getState().stage('server-b|user-a', { ...d, kind: 'trash' });
  store.getState().undo('server-a|user-a', 'a');
  assert.equal(store.getState().accounts['server-b|user-a'].pending.a.kind, 'trash');
  store.getState().stage('server-a|user-a', d);
  store.getState().complete('server-a|user-a', 'a');
  assert.equal(store.getState().accounts['server-a|user-a'].pending.a, undefined);
  assert.equal(store.getState().accounts['server-a|user-a'].completed.a.asset, undefined);
  store.getState().markWeek('server-a|user-a', d.week, true);
  await store.persist.rehydrate();
  assert.equal(store.getState().accounts['server-a|user-a'].completed.a.week, '2026-10-19');
  assert.equal(store.getState().accounts['server-a|user-a'].sortedWeeks[d.week], true);
  assert.equal(store.getState().accounts['server-b|user-a'].sortedWeeks, undefined);
  store.getState().markWeek('server-a|user-a', d.week, false);
  assert.equal(store.getState().accounts['server-a|user-a'].sortedWeeks[d.week], false);
  assert.equal(store.getState().accounts['server-b|user-a'].pending.a.kind, 'trash');
});

test('week completion recovers old progress and detects new photos or pending reviews', () => {
  const { isWeekSorted } = require('../features/sorting/progress.ts');
  const week = '2026-10-19';
  const progress = { pending: {}, completed: { a: { kind: 'keep', week, at: 1 } } };
  assert.equal(isWeekSorted(progress, week, [asset('a')]), true);
  assert.equal(isWeekSorted(progress, week, [asset('a'), asset('b')]), false);
  assert.equal(isWeekSorted(progress, week, []), true);
  assert.equal(isWeekSorted(undefined, week, []), false);
  assert.equal(isWeekSorted(progress, '2026-10-12', []), false);
  progress.pending.a = { asset: asset('a'), kind: 'trash', week, at: 2 };
  assert.equal(isWeekSorted(progress, week, [asset('a')]), false);
});


test('week list rechecks stale false flags as well as legacy and completed weeks', () => {
  const { weeksToRecheck, isWeekSorted } = require('../features/sorting/progress.ts');
  const week = '2026-10-19';
  const progress = { pending: {}, completed: { a: { kind: 'trash', week, at: 1 } }, sortedWeeks: { [week]: false } };
  assert.deepEqual(weeksToRecheck(progress), [week]);
  assert.equal(isWeekSorted(progress, week, []), true);
  progress.sortedWeeks[week] = true;
  assert.deepEqual(weeksToRecheck(progress), [week]);
  assert.equal(isWeekSorted(progress, week, [asset('new-upload')]), false);
  assert.deepEqual(weeksToRecheck(undefined), []);
});


test('right swipe stays keep after native gesture resets during animation', async () => {
  const { captureSwipe } = require('../features/sorting/swipe.ts');
  for (const [dx, expected] of [[150, 'keep'], [-150, 'trash']]) {
    const gesture = { dx };
    const decisions = [];
    const finishAnimation = captureSwipe(gesture.dx, kind => decisions.push({ kind, asset: asset('swiped'), albumId: 'album', week: '2026-10-19', at: 1 }));
    gesture.dx = 0;
    finishAnimation();
    const calls = [];
    await commitDecisions(decisions, { keep: async () => calls.push('keep'), trash: async () => calls.push('trash') }, () => {});
    assert.deepEqual(calls, [expected]);
  }
});

test('photo browser forwards cursor, album and filename filters and excludes trash/other owners', async () => {
  let sent;
  const client = new ImmichClient(connection, async (url, options) => {
    assert.equal(url, 'https://photos.example.test/api/search/metadata');
    sent = JSON.parse(options.body);
    return response({ assets: { items: [asset('kept'), asset('trash', { isTrashed: true }), asset('other', { ownerId: 'other' })], nextCursor: 'next' } });
  });
  const page = await client.browse({ cursor: 'previous', albumId: 'album-id', query: 'IMG_2026' });
  assert.equal(sent.cursor, 'previous');
  assert.deepEqual(sent.filter.albumIds, { any: ['album-id'] });
  assert.deepEqual(sent.filter.trashedAt, { eq: null });
  assert.deepEqual(sent.filter.visibility, { eq: 'timeline' });
  assert.deepEqual(sent.filter.originalFileName, { like: '%IMG_2026%' });
  assert.deepEqual(sent.orderBy, { field: 'fileCreatedAt', direction: 'desc' });
  assert.deepEqual(page.items.map(a => a.id), ['kept']);
  assert.equal(page.nextCursor, 'next');
});

test('subject search uses Immich semantic search, not filenames', async () => {
  const client = new ImmichClient(connection, async (url, options) => {
    assert.equal(url, 'https://photos.example.test/api/search/smart');
    const body = JSON.parse(options.body);
    assert.equal(body.query, 'dog');
    assert.equal(body.filter, undefined);
    assert.equal(body.visibility, 'timeline');
    assert.equal(body.page, 1);
    return response({ assets: { items: [asset('dog'), asset('trashed', { isTrashed: true })], nextPage: null } });
  });
  assert.deepEqual((await client.smartSearch('dog')).items.map(a => a.id), ['dog']);
});
test('people lists paginate and person/city browsing uses metadata filters', async () => {
  let count = 0;
  const client = new ImmichClient(connection, async (url, options) => {
    if (url.includes('/people?')) {
      count++;
      assert.ok(url.includes(`page=${count}`));
      return response({ people: [{ id: `p${count}`, name: `Person ${count}` }], hasNextPage: count === 1 });
    }
    const body = JSON.parse(options.body);
    assert.deepEqual(body.filter.personIds, { any: ['p1'] });
    assert.deepEqual(body.filter.city, { eq: 'Amsterdam' });
    return response({ assets: { items: [asset('match')], nextCursor: null } });
  });
  assert.equal((await client.people()).length, 2);
  assert.equal((await client.browse({ personId: 'p1', city: 'Amsterdam' })).items.length, 1);
});

test('manual completion snapshots loaded photos and remote merges preserve pending choices', () => {
  const store = require('../store/useSortStore.ts').useSortStore;
  const { isWeekSorted } = require('../features/sorting/progress.ts');
  const account = 'sync-test', week = '2026-10-19';
  store.getState().markManual(account, week, [asset('one')]);
  let p = store.getState().accounts[account];
  assert.equal(isWeekSorted(p, week, [asset('one')]), true);
  assert.equal(isWeekSorted(p, week, [asset('one'), asset('new')]), false);
  store.getState().stage(account, { asset: asset('one'), kind: 'trash', week, at: 5 });
  store.getState().mergeRemote(account, { completed: { remote: { kind: 'keep', week, at: 1 } }, manualWeeks: { '2026-10-12': true } });
  p = store.getState().accounts[account];
  assert.equal(p.pending.one.kind, 'trash');
  assert.equal(p.completed.remote.kind, 'keep');
  assert.equal(isWeekSorted(p, week, [asset('one')]), false);
  store.getState().markManual(account, week, [asset('ignored')]);
  assert.equal(store.getState().accounts[account].completed.ignored, undefined);
  assert.equal(isWeekSorted(p, '2026-10-12', []), true);
});

test('smart search follows server pages beyond the first 100 results', async () => {
  const pages = [];
  const client = new ImmichClient(connection, async (_, options) => {
    const body = JSON.parse(options.body); pages.push(body.page);
    return response({ assets: { items: [asset(`page-${body.page}`)], nextPage: body.page === 1 ? '2' : null } });
  });
  const first = await client.smartSearch('dog');
  const second = await client.smartSearch('dog', first.nextCursor);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(second.nextCursor, null);
  assert.equal(second.items[0].id, 'page-2');
});
test('gallery places one date heading above each day and joins page boundaries', () => {
  const { galleryRows } = require('../features/sorting/gallery.ts');
  const photos = [asset('a'), asset('b'), asset('c'), asset('d'), asset('older', { fileCreatedAt: '2026-10-18T12:00:00Z' })];
  const rows = galleryRows(photos, true);
  assert.equal(rows.filter(r => r.title).length, 2);
  assert.deepEqual(rows.filter(r => r.photos).map(r => r.photos.length), [3, 1, 1]);
  assert.deepEqual(galleryRows(photos, false).flatMap(r => r.photos ?? []).map(a => a.id), photos.map(a => a.id));
});

test('mark not sorted survives stale sync and can be marked sorted again', () => {
  const store = require('../store/useSortStore.ts').useSortStore;
  const { isWeekSorted, isReviewed } = require('../features/sorting/progress.ts');
  const account = 'selection-test', week = '2026-10-19';
  store.getState().markManual(account, week, [asset('one')]);
  const old = store.getState().accounts[account];
  store.getState().resetWeek(account, week);
  store.getState().mergeRemote(account, old);
  let p = store.getState().accounts[account];
  assert.equal(isReviewed(p, 'one'), false);
  assert.equal(isWeekSorted(p, week, [asset('one')]), false);
  assert.equal(isWeekSorted(p, week, []), false);
  store.getState().markManual(account, week, [asset('one')]);
  p = store.getState().accounts[account];
  assert.equal(isWeekSorted(p, week, [asset('one')]), true);
  assert.equal(isWeekSorted(p, week, [asset('one'), asset('new')]), false);
  store.getState().resetWeek(account, week);
  store.getState().markManual(account, week, []);
  assert.equal(isWeekSorted(store.getState().accounts[account], week, []), true);
});

test('favorites update only the favorite flag, and person names are trimmed', async () => {
  const calls = [];
  const api = new ImmichClient(connection, async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return response({ id: 'p', name: 'Thijs' });
  });
  await api.favorite('photo', true);
  await api.favorite('photo', false);
  await api.namePerson('person', '  Thijs  ');
  await assert.rejects(() => api.namePerson('person', '  '));
  assert.deepEqual(calls, [
    { url: connection.url + '/api/assets/photo', method: 'PUT', body: { isFavorite: true } },
    { url: connection.url + '/api/assets/photo', method: 'PUT', body: { isFavorite: false } },
    { url: connection.url + '/api/people/person', method: 'PUT', body: { name: 'Thijs' } },
  ]);
  assert.deepEqual(api.personThumbnail('person'), { uri: connection.url + '/api/people/person/thumbnail', headers: { 'x-api-key': connection.key } });
});

test('full-screen navigation respects direction and leaves pinch and zoom gestures alone', () => {
  const { photoSwipe } = require('../features/sorting/viewer.ts');
  assert.equal(photoSwipe(-120, 10, 1, false), 1);
  assert.equal(photoSwipe(120, 10, 1, false), -1);
  assert.equal(photoSwipe(-20, 0, 1, false), 0);
  assert.equal(photoSwipe(-90, 100, 1, false), 0);
  assert.equal(photoSwipe(-120, 10, 2.5, false), 0);
  assert.equal(photoSwipe(-120, 10, 1, true), 0);
});

test('photo selection keeps multiple photos, toggles independently and uses one favorite action', () => {
  const { togglePhotoSelection, favoriteSelection } = require('../features/sorting/selection.ts');
  const a = asset('a', { isFavorite: true }), b = asset('b');
  let selected = togglePhotoSelection([], a);
  selected = togglePhotoSelection(selected, b);
  assert.deepEqual(selected.map(item => item.id), ['a', 'b']);
  assert.equal(favoriteSelection(selected), true);
  selected = togglePhotoSelection(selected, b);
  assert.deepEqual(selected.map(item => item.id), ['a']);
  assert.equal(favoriteSelection(selected), false);
  assert.deepEqual(togglePhotoSelection(selected, a), []);
});

test('album dragging moves the first to fifth without losing albums; saved order survives new albums', () => {
  const { moveAlbum, orderAlbums } = require('../features/sorting/albums.ts');
  const albums = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, albumName: id, assetCount: 0 }));
  const moved = moveAlbum(albums, 0, 4);
  assert.deepEqual(moved.map(a => a.id), ['b', 'c', 'd', 'e', 'a']);
  assert.deepEqual(albums.map(a => a.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(orderAlbums([...albums, { id: 'new' }], moved.map(a => a.id)).map(a => a.id), ['b', 'c', 'd', 'e', 'a', 'new']);
  assert.equal(moveAlbum(albums, -1, 4), albums);
});
test('album rename and adding multiple photos use the correct server operations', async () => {
  const calls = [];
  const api = new ImmichClient(connection, async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return response(options.method === 'PATCH' ? { id: 'album', albumName: 'Holiday' } : [{ id: 'a', success: true }, { id: 'b', success: false, error: 'duplicate' }]);
  });
  await api.renameAlbum('album', ' Holiday ');
  await api.addToAlbum('album', ['a', 'b']);
  await assert.rejects(() => api.addToAlbum('album', ['missing']));
  assert.throws(() => api.renameAlbum('album', ' '));
  assert.deepEqual(calls[0], { url: connection.url + '/api/albums/album', method: 'PATCH', body: { albumName: 'Holiday' } });
  assert.deepEqual(calls[1], { url: connection.url + '/api/albums/album/assets', method: 'PUT', body: { ids: ['a', 'b'] } });
});

test('Favorites collects every favorite page and removes only stale album membership', async () => {
  const { syncFavoritesAlbum } = require('../lib/favorites.ts');
  const writes = [];
  const api = new ImmichClient(connection, async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    if (url.endsWith('/albums?isOwned=true')) return response([{ id: 'fav', albumName: 'Favorites', assetCount: 2 }]);
    if (url.endsWith('/search/metadata')) {
      if (body.filter.isFavorite) return response({ assets: { items: [asset(body.cursor ? 'b' : 'a', { isFavorite: true })], nextCursor: body.cursor ? null : 'page2' } });
      return response({ assets: { items: [asset('a', { isFavorite: true }), asset('old')], nextCursor: null } });
    }
    writes.push({ url, method: options.method, body });
    return response(body.ids.map(id => ({ id, success: true })));
  });
  await syncFavoritesAlbum(api);
  assert.deepEqual(writes, [
    { url: connection.url + '/api/albums/fav/assets', method: 'PUT', body: { ids: ['b'] } },
    { url: connection.url + '/api/albums/fav/assets', method: 'DELETE', body: { ids: ['old'] } },
  ]);
});
test('heart changes create Favorites once and update album membership and Immich favorite flags', async () => {
  const { setPhotoFavorite } = require('../lib/favorites.ts');
  const calls = []; let exists = false;
  const api = new ImmichClient(connection, async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    if (url.endsWith('/albums?isOwned=true')) return response(exists ? [{ id: 'fav', albumName: 'Favorites' }] : []);
    calls.push({ url, method: options.method, body });
    if (url.endsWith('/albums')) { exists = true; return response({ id: 'fav', albumName: 'Favorites' }); }
    return response(body.ids ? body.ids.map(id => ({ id, success: true })) : asset('photo', { isFavorite: body.isFavorite }));
  });
  await setPhotoFavorite(api, 'photo', true);
  await setPhotoFavorite(api, 'photo', false);
  assert.deepEqual(calls, [
    { url: connection.url + '/api/albums', method: 'POST', body: { albumName: 'Favorites' } },
    { url: connection.url + '/api/albums/fav/assets', method: 'PUT', body: { ids: ['photo'] } },
    { url: connection.url + '/api/assets/photo', method: 'PUT', body: { isFavorite: true } },
    { url: connection.url + '/api/albums/fav/assets', method: 'DELETE', body: { ids: ['photo'] } },
    { url: connection.url + '/api/assets/photo', method: 'PUT', body: { isFavorite: false } },
  ]);
});


test('legacy favorit album is renamed in place without creating a duplicate', async () => {
  const { setPhotoFavorite } = require('../lib/favorites.ts');
  const writes = [];
  const api = new ImmichClient(connection, async (url, options) => {
    if (url.endsWith('/albums?isOwned=true')) return response([{ id: 'original', albumName: 'favorit' }]);
    const body = JSON.parse(options.body); writes.push({ url, method: options.method, body });
    return response(body.ids ? [{ id: 'photo', success: true }] : {});
  });
  await setPhotoFavorite(api, 'photo', true);
  assert.deepEqual(writes[0], { url: connection.url + '/api/albums/original', method: 'PATCH', body: { albumName: 'Favorites' } });
  assert.equal(writes.some(call => call.method === 'POST'), false);
  assert.equal(writes[1].url, connection.url + '/api/albums/original/assets');
});

test('calendar months handle leap years, year changes and local daylight-saving boundaries', () => {
  const { monthBounds, shiftMonth, assetWeek } = require('../features/sorting/period.ts');
  const previous = process.env.TZ; process.env.TZ = 'Europe/Amsterdam';
  try {
    assert.deepEqual(monthBounds('2026-10-01'), { start: '2026-09-30T22:00:00.000Z', end: '2026-10-31T23:00:00.000Z' });
    assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
    const leap = monthBounds('2024-02-01');
    assert.equal((Date.parse(leap.end) - Date.parse(leap.start)) / 86400000, 29);
    assert.equal(assetWeek(asset('boundary', { fileCreatedAt: '2026-10-01T12:00:00Z' })), '2026-09-28');
  } finally { process.env.TZ = previous; }
});
test('month sorting skips reviewed weeks, keeps pending decisions visible, and resumes at first unreviewed photo', () => {
  const { remainingPhotos, periodDecisions, monthSummary } = require('../features/sorting/period.ts');
  const photos = [asset('early', { fileCreatedAt: '2026-10-02T12:00:00Z' }), asset('later', { fileCreatedAt: '2026-10-20T12:00:00Z' }), asset('new', { fileCreatedAt: '2026-10-22T12:00:00Z' })];
  const progress = { completed: { early: { kind: 'keep', week: '2026-09-28', at: 10 }, later: { kind: 'keep', week: '2026-10-19', at: 10 } }, pending: {} };
  assert.deepEqual(remainingPhotos(progress, photos).map(p => p.id), ['new']);
  assert.deepEqual(monthSummary(progress, '2026-10-01', photos), { reviewed: 2, total: 3, pending: 0, sorted: false });
  progress.pending.new = { asset: photos[2], kind: 'keep', week: '2026-10-19', at: 20 };
  progress.pending.outside = { asset: asset('outside', { fileCreatedAt: '2026-09-29T12:00:00Z' }), kind: 'keep', week: '2026-09-28', at: 20 };
  assert.deepEqual(remainingPhotos(progress, photos), []);
  assert.deepEqual(periodDecisions(progress, '2026-10-01', 'months').map(d => d.asset.id), ['new']);
  assert.equal(monthSummary(progress, '2026-10-01', photos).sorted, false);
  progress.resetWeeks = { '2026-09-28': 11 };
  assert.deepEqual(remainingPhotos(progress, photos).map(p => p.id), ['early']);
});
test('marking a month reviewed retains canonical weeks without marking outside-month photos reviewed', () => {
  const store = require('../store/useSortStore.ts').useSortStore;
  const { isReviewed, isWeekSorted } = require('../features/sorting/progress.ts');
  const account = 'month-manual';
  const inside = asset('october', { fileCreatedAt: '2026-10-01T12:00:00Z' }), outside = asset('september', { fileCreatedAt: '2026-09-30T12:00:00Z' });
  store.getState().markAssetsReviewed(account, [inside]);
  const progress = store.getState().accounts[account];
  assert.equal(progress.completed.october.week, '2026-09-28');
  assert.equal(isReviewed(progress, inside.id), true);
  assert.equal(isReviewed(progress, outside.id), false);
  assert.equal(isWeekSorted(progress, '2026-09-28', [outside, inside]), false);
});
test('month loading requests every page in chronological order inside calendar boundaries', async () => {
  const { monthBounds } = require('../features/sorting/period.ts');
  const bodies = [];
  const api = new ImmichClient(connection, async (_, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    return response({ assets: { items: [asset(body.cursor ? 'early' : 'later', { fileCreatedAt: body.cursor ? '2026-10-01T12:00:00Z' : '2026-10-20T12:00:00Z' })], nextCursor: body.cursor ? null : 'second' } });
  });
  const photos = await api.month('2026-10-01');
  assert.deepEqual(photos.map(p => p.id), ['early', 'later']);
  const bounds = monthBounds('2026-10-01');
  assert.deepEqual(bodies[0].filter.takenAt, { gte: bounds.start, lt: bounds.end });
  assert.equal(bodies[1].cursor, 'second');
});

test('image requests use authenticated small thumbnails for grids and previews for preloading', () => {
  const api = new ImmichClient(connection);
  const photo = asset('photo/id');
  assert.deepEqual(api.media(photo, false, 'thumbnail'), { uri: connection.url + '/api/assets/photo%2Fid/thumbnail?size=thumbnail', headers: { 'x-api-key': connection.key } });
  assert.equal(api.media(photo).uri, connection.url + '/api/assets/photo%2Fid/thumbnail?size=preview');
  assert.equal(api.media(photo, true).uri, connection.url + '/api/assets/photo%2Fid/video/playback');
});

test('apply counter decreases only after acknowledged updates and retains failed decisions', async () => {
  let acknowledgeFirst, rejectSecond;
  const first = new Promise(resolve => { acknowledgeFirst = resolve; });
  const second = new Promise((_, reject) => { rejectSecond = reject; });
  const decisions = ['first', 'second'].map(id => ({ kind: 'keep', asset: asset(id), albumId: 'album' }));
  const pending = new Set(['first', 'second']), counts = [pending.size];
  const applying = commitDecisions(decisions, { keep: id => id === 'first' ? first : second, trash: async () => {} }, id => { pending.delete(id); counts.push(pending.size); });
  const failed = assert.rejects(applying, /offline/);
  assert.deepEqual(counts, [2]);
  acknowledgeFirst();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(counts, [2, 1]);
  rejectSecond(new Error('offline'));
  await failed;
  assert.deepEqual([...pending], ['second']);
  assert.deepEqual(counts, [2, 1]);
});
