import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function harness(fetch) {
  const elements = new Map(['#admin-users-status', '#admin-users-table', '#admin-user-total'].map(id => [id, { textContent: '', innerHTML: '', classList: { add() {} } }]));
  const toasts = [];
  const context = vm.createContext({
    fetch, state: { route: 'admin' }, currentUser: { role: 'admin', adminLevel: 2 }, $: id => elements.get(id),
    escapeHTML: String, formatAdminCreatedAt: () => '', loadAccountDeletionRequests: async () => {},
    confirm: () => true, toast: (...args) => toasts.push(args),
    document: { addEventListener: (_type, handler) => { context.click = handler; } }
  });
  const start = source.indexOf('let adminUsersLoadVersion');
  const end = source.indexOf('\n}', start) + 2;
  vm.runInContext(source.slice(start, end) + '\nglobalThis.load = loadAdminUsers;', context);
  const clickStart = source.indexOf('document.addEventListener("click", async (e) => {\n    const deleteUserButton');
  const clickEnd = source.indexOf('    const routeBtn =', clickStart);
  vm.runInContext(source.slice(clickStart, clickEnd) + '\n});', context);
  return { context, elements, toasts };
}
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const accounts = { users: [{ id: 2, name: 'Manager', email: 'manager@gmail.com', role: 'admin', adminLevel: 2, isManager: true }], total: 2, currentUserId: 1, isSuperAdmin: true, isOwnerAdmin: true };

test('admin list ignores old responses and only owner sees deletion, including manager rows', async () => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  let calls = 0;
  const { context, elements } = harness(() => ++calls === 1 ? old : response({ ...accounts, total: 1 }));
  const first = context.load();
  await context.load();
  resolveOld(response(accounts));
  await first;
  assert.equal(elements.get('#admin-user-total').textContent, '1');
  assert.match(elements.get('#admin-users-table').innerHTML, /data-delete-user="2"/);
  context.fetch = () => response({ ...accounts, isOwnerAdmin: false });
  await context.load();
  assert.doesNotMatch(elements.get('#admin-users-table').innerHTML, /data-delete-user=/);
  assert.match(elements.get('#admin-users-table').innerHTML, /create-subadmin-form/);
});

test('successful deletion removes the row and refreshes count; stale 404 also refreshes list', async () => {
  for (const status of [200, 404]) {
    const calls = [];
    let removed = false;
    const { context, elements, toasts } = harness((url, options) => {
      calls.push({ url, options });
      return url.endsWith('/2') ? response({ deleted: status === 200, error: 'Không tìm thấy tài khoản.' }, status)
        : response({ ...accounts, users: [], total: 1 });
    });
    const button = { dataset: { deleteUser: '2' }, closest: () => ({ remove: () => { removed = true; } }) };
    await context.click({ target: { closest: () => button } });
    assert.deepEqual(calls.map(c => c.url), ['/api/admin/users/2', '/api/admin/users']);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.equal(elements.get('#admin-user-total').textContent, '1');
    assert.doesNotMatch(elements.get('#admin-users-table').innerHTML, /data-delete-user=/);
    assert.equal(removed, status === 200);
    assert.equal(toasts[0][1], status === 200 ? 'success' : 'error');
  }
});

test('admin grants School through the user row, refreshes state and can cancel or retry failure', async () => {
  const learner = { id: 4, name: 'Learner', email: 'learner@test.local', role: 'user', schoolPlan: 'none' };
  const calls = [];
  const { context, elements, toasts } = harness((url, options) => {
    calls.push({url,options});
    return url.endsWith('/school') ? response({ ok: true, message: 'Đã cấp School' }) : response({ ...accounts, users: [{ ...learner, schoolPlan: 'standard', schoolExpiresAt: null }] });
  });
  context.fetch = (url, options) => { calls.push({url,options}); return response({ ...accounts, users: [learner] }); };
  await context.load();
  assert.match(elements.get('#admin-users-table').innerHTML, /data-grant-school="4"/);
  context.fetch = (url, options) => { calls.push({url,options}); return url.endsWith('/school') ? response({ ok: true }) : response({ ...accounts, users: [{ ...learner, schoolPlan: 'standard', schoolExpiresAt: null }] }); };
  const button = { dataset: { grantSchool: '4', userName: 'Learner' }, disabled: false };
  const event = { target: { closest: selector => selector === '[data-grant-school]' ? button : null } };
  context.confirm = () => false; calls.length=0; await context.click(event); assert.equal(calls.length,0);
  context.confirm = () => true; await context.click(event);
  assert.equal(calls[0].url, '/api/admin/users/4/school'); assert.equal(calls[0].options.method,'POST');
  assert.doesNotMatch(elements.get('#admin-users-table').innerHTML, /data-grant-school="4"/);
  assert.match(elements.get('#admin-users-table').innerHTML, /Không thời hạn/);
  assert.equal(toasts[0][1],'success');
  button.disabled=false; context.fetch=() => response({error:'Denied'},403); await context.click(event);
  assert.equal(button.disabled,false); assert.equal(toasts.at(-1)[1],'error');
});
