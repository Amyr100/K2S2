
let STATE = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null')
};

function setAuth(token, user) {
  STATE.token = token;
  STATE.user = user;
  if (token) localStorage.setItem('token', token); else localStorage.removeItem('token');
  if (user) localStorage.setItem('user', JSON.stringify(user)); else localStorage.removeItem('user');
  renderAuthArea();
}

function api(path, opts = {}) {
  const headers = opts.headers || {};
  headers['Content-Type'] = 'application/json';
  if (STATE.token) headers['Authorization'] = 'Bearer ' + STATE.token;
  return fetch(path, { ...opts, headers });
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function hideAllSections() { ['section-public','section-feed','section-mine','section-users','section-requests'].forEach(hide); }
function showModal(id){ show(id); }
function hideModal(id){ hide(id); }
function renderAuthArea() {
  const btnLogin = document.getElementById('btn-login');
  const btnRegister = document.getElementById('btn-register');
  const chip = document.getElementById('userChip');
  const chipName = document.getElementById('chipName');
  if (STATE.user && STATE.token) {
    btnLogin.classList.add('hidden');
    btnRegister.classList.add('hidden');
    chip.classList.remove('hidden');
    chipName.textContent = STATE.user.username;
  } else {
    btnLogin.classList.remove('hidden');
    btnRegister.classList.remove('hidden');
    chip.classList.add('hidden');
  }
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const res = await api('/api/login', { method:'POST', body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (data.success) { setAuth(data.token, data.user); hideModal('modal-login'); selectTab('public'); }
  else alert(data.error || 'Login failed');
}
async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const res = await api('/api/register', { method:'POST', body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (data.success) { setAuth(data.token, data.user); hideModal('modal-register'); selectTab('mine'); }
  else alert(data.error || 'Registration failed');
}
async function doLogout() {
  if (STATE.token) { try { await api('/api/logout', { method:'POST' }); } catch(e){} }
  setAuth('', null);
  selectTab('public');
}

document.getElementById('tab-public').addEventListener('click', () => selectTab('public'));
document.getElementById('tab-feed').addEventListener('click', () => selectTab('feed'));
document.getElementById('tab-mine').addEventListener('click', () => selectTab('mine'));
document.getElementById('tab-users').addEventListener('click', () => selectTab('users'));
document.getElementById('tab-requests').addEventListener('click', () => selectTab('requests'));
document.getElementById('btn-login').addEventListener('click', () => showModal('modal-login'));
document.getElementById('btn-register').addEventListener('click', () => showModal('modal-register'));
document.getElementById('btn-logout').addEventListener('click', doLogout);

async function selectTab(name) {
  hideAllSections();
  if (name === 'public') { show('section-public'); await loadPublic(); }
  else if (name === 'feed') {
    if (!STATE.token) { alert('Войдите, чтобы увидеть ленту'); return selectTab('public'); }
    show('section-feed'); await loadFeed();
  } else if (name === 'mine') {
    if (!STATE.token) { alert('Войдите, чтобы управлять постами'); return selectTab('public'); }
    show('section-mine'); await loadMine();
  } else if (name === 'users') {
    show('section-users'); await loadUsers();
  } else if (name === 'requests') {
    if (!STATE.token) { alert('Войдите, чтобы модераировать запросы'); return selectTab('public'); }
    show('section-requests'); await loadRequests();
  }
}

function el(html) { const d=document.createElement('div'); d.innerHTML=html; return d.firstElementChild; }
function escapeHtml(s){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function renderPosts(containerId, posts) {
  const container = document.getElementById(containerId);
  container.innerHTML='';
  if (!posts.length) { container.appendChild(el('<div class=\"text-gray-400\">Нет постов</div>')); return; }
  posts.forEach(p => {
    const canEdit = STATE.user && p.authorId === STATE.user.id;
    const canRequest = STATE.user && p.visibility === 'request' && p.authorId !== STATE.user.id && !(p.allowedUsers||[]).includes(STATE.user.id);
    const subscribed = STATE.user && (STATE.user.subscriptions||[]).includes(p.authorId);
    const card = el(`
      <article class="card bg-gray-900 rounded-2xl p-5 shadow border border-gray-800">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xl font-semibold text-purple-400">${escapeHtml(p.title)}</h3>
          <div class="text-sm text-gray-400">${new Date(p.createdAt).toLocaleString()}</div>
        </div>
        <div class="text-gray-200 whitespace-pre-wrap mb-3">${escapeHtml(p.content)}</div>
        <div class="flex flex-wrap gap-2 mb-3">
          ${(p.tags||[]).map(t => `<span class="px-2 py-0.5 rounded-lg bg-gray-800 text-xs border border-gray-700">#${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-400">Автор: <span class="text-gray-200">${escapeHtml(p.author)}</span> ${p.visibility==='request' ? '<span class="ml-2 text-xs px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-700">по запросу</span>':''}</div>
          <div class="flex items-center gap-2">
            ${STATE.user && (p.authorId !== STATE.user.id) ? `<button class="px-3 py-1 rounded-xl bg-gray-800 hover:bg-gray-700" onclick="toggleSubscribe('${p.authorId}')">${subscribed?'Отписаться':'Подписаться'}</button>`:''}
            ${canRequest ? `<button class="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500" onclick="requestAccess('${p.id}')">Запросить доступ</button>`:''}
            ${canEdit ? `<button class="px-3 py-1 rounded-xl bg-gray-800 hover:bg-gray-700" onclick="startEdit('${p.id}')">Редактировать</button>
                         <button class="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500" onclick="deletePost('${p.id}')">Удалить</button>`:''}
          </div>
        </div>
        <div class="mt-4 border-t border-gray-800 pt-3">
          <div class="flex gap-2">
            <input id="cmt-${p.id}" class="dark-input" placeholder="Написать комментарий..." />
            <button class="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500" onclick="addComment('${p.id}')">Отправить</button>
          </div>
          <div id="cmts-${p.id}" class="mt-3 space-y-2 text-sm text-gray-200"></div>
        </div>
      </article>`);
    container.appendChild(card);
    loadComments(p.id);
  });
}

async function loadPublic() {
  const userId = STATE.user ? STATE.user.id : '';
  const r = await api(`/api/posts/public?userId=${encodeURIComponent(userId)}`);
  const p = await r.json();
  renderPosts('list-public', p);
}

async function loadFeed(){ const r=await api('/api/posts/feed'); const p=await r.json(); renderPosts('list-feed',p); }
async function loadMine(){
  await loadMyPostsList();
  document.getElementById('form-create').onsubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const tags = document.getElementById('post-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const visibility = document.querySelector('input[name="visibility"]:checked').value;
    const res = await api('/api/posts', { method:'POST', body: JSON.stringify({ title, content, tags, visibility }) });
    const data = await res.json();
    if (data.success) {
      document.getElementById('post-title').value='';
      document.getElementById('post-content').value='';
      document.getElementById('post-tags').value='';
      await loadMyPostsList();
      if (visibility==='public') await loadPublic();
    } else alert(data.error || 'Ошибка создания');
  };
}
async function loadMyPostsList(){
  const rPub = await api('/api/posts/public'); let posts = await rPub.json();
  if (STATE.user && STATE.token) {
    const r2 = await api('/api/posts/feed'); const p2 = await r2.json();
    const mine = (p2||[]).filter(p=>p.authorId===STATE.user.id);
    const map=new Map(posts.map(p=>[p.id,p])); for(const m of mine) map.set(m.id,m);
    posts = Array.from(map.values()).filter(p=>p.authorId===STATE.user.id);
  } else posts = [];
  renderPosts('list-mine', posts);
}

async function loadUsers(){
  const r=await api('/api/users'); const users=await r.json();
  const box=document.getElementById('list-users'); box.innerHTML='';
  users.forEach(u=>{
    const isMe = STATE.user && u.id===STATE.user.id;
    const subscribed = STATE.user && (STATE.user.subscriptions||[]).includes(u.id);
    const card = el(`<div class="card bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
      <div><div class="font-semibold">${escapeHtml(u.username)}</div>${isMe?'<div class="text-xs text-gray-500">это вы</div>':''}</div>
      <div>${(!STATE.user||isMe)?'':`<button class="px-3 py-1 rounded-xl bg-gray-800 hover:bg-gray-700" onclick="toggleSubscribe('${u.id}')">${subscribed?'Отписаться':'Подписаться'}</button>`}</div>
    </div>`);
    box.appendChild(card);
  });
}

async function loadRequests(){
  const r=await api('/api/requests'); const list=await r.json();
  const box=document.getElementById('list-requests'); box.innerHTML='';
  if(!list.length){ box.innerHTML='<div class="text-gray-400">Нет запросов</div>'; return; }
  list.forEach(rq=>{
    const card=el(`<div class="card bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
      <div><div class="font-semibold">${escapeHtml(rq.fromUser)} хочет доступ</div>
      <div class="text-sm text-gray-400">к посту: ${escapeHtml(rq.postTitle)}</div></div>
      <div class="flex gap-2">
        <button class="px-3 py-1 rounded-xl bg-green-600 hover:bg-green-500" onclick="approveReq('${rq.id}')">Одобрить</button>
        <button class="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500" onclick="rejectReq('${rq.id}')">Отклонить</button>
      </div></div>`);
    box.appendChild(card);
  });
}

async function toggleSubscribe(targetId){
  if(!STATE.token){ alert('Войдите, чтобы подписываться'); return; }
  const subscribed=(STATE.user.subscriptions||[]).includes(targetId);
  const url=subscribed?'/api/unsubscribe':'/api/subscribe';
  const r=await api(url,{method:'POST', body: JSON.stringify({targetId})}); const d=await r.json();
  if(d.success){ STATE.user.subscriptions=d.subscriptions; localStorage.setItem('user', JSON.stringify(STATE.user));
    const active=document.querySelector('main section:not(.hidden)')?.id||'section-public';
    if(active==='section-users') await loadUsers();
    if(active==='section-feed') await loadFeed();
    if(active==='section-public') await loadPublic();
  } else alert(d.error||'Ошибка подписки');
}
async function requestAccess(postId){
  if(!STATE.token){ alert('Войдите, чтобы запрашивать доступ'); return; }
  const r=await api(`/api/posts/${postId}/request-access`,{method:'POST'}); const d=await r.json();
  if(d.success){ alert('Запрос отправлен автору'); } else alert(d.error||'Ошибка запроса');
}
async function startEdit(postId){
  const title=prompt('Новый заголовок?'); if(title===null) return;
  const content=prompt('Новый текст?'); if(content===null) return;
  const tags=prompt('Теги через запятую?')||'';
  const visibility=confirm('Сделать пост публичным? ОК=Публичный, Отмена=По запросу')?'public':'request';
  const r=await api(`/api/posts/${postId}`,{method:'PUT', body: JSON.stringify({title,content,tags,visibility})}); const d=await r.json();
  if(d.success){ const active=document.querySelector('main section:not(.hidden)')?.id||'section-public';
    if(active==='section-mine') await loadMine(); if(active==='section-feed') await loadFeed(); if(active==='section-public') await loadPublic();
  } else alert(d.error||'Ошибка редактирования');
}
async function deletePost(postId){
  if(!confirm('Удалить пост?')) return;
  const r=await api(`/api/posts/${postId}`,{method:'DELETE'}); const d=await r.json();
  if(d.success){ const active=document.querySelector('main section:not(.hidden)')?.id||'section-public';
    if(active==='section-mine') await loadMine(); if(active==='section-feed') await loadFeed(); if(active==='section-public') await loadPublic();
  } else alert(d.error||'Ошибка удаления');
}
async function addComment(postId){
  const input=document.getElementById(`cmt-${postId}`); const text=input.value.trim(); if(!text) return;
  const r=await api(`/api/posts/${postId}/comments`,{method:'POST', body: JSON.stringify({text})}); const d=await r.json();
  if(d.success){ input.value=''; await loadComments(postId); } else alert(d.error||'Ошибка комментария');
}
async function loadComments(postId){
  const r=await api(`/api/posts/${postId}/comments`); const list=await r.json();
  const box=document.getElementById(`cmts-${postId}`); box.innerHTML='';
  if(Array.isArray(list)){ list.forEach(c=>{ box.appendChild(el(`<div class="bg-gray-800 rounded-xl p-2"><span class="text-purple-300">${escapeHtml(c.username)}:</span> ${escapeHtml(c.text)}</div>`)); }); }
}
async function approveReq(id){ const r=await api(`/api/requests/${id}/approve`,{method:'POST'}); const d=await r.json(); if(d.success){ await loadRequests(); } else alert(d.error||'Ошибка'); }
async function rejectReq(id){ const r=await api(`/api/requests/${id}/reject`,{method:'POST'}); const d=await r.json(); if(d.success){ await loadRequests(); } else alert(d.error||'Ошибка'); }

window.addEventListener('DOMContentLoaded', ()=>{ renderAuthArea(); document.getElementById('tab-public').click(); });


// Загрузка подписок
async function loadSubscriptions() {
  const res = await fetch('/subscriptions', { headers: authHeader() });
  if (res.ok) {
    const subs = await res.json();
    renderPosts(subs);
  }
}

// Обработчик кнопки "Подписки"
document.getElementById('subscriptionsBtn').addEventListener('click', loadSubscriptions);

// 🔎 Поиск по тегу (публичные посты)
function getCurrentUserId() {
  if (window.STATE && STATE.user && STATE.user.id) return STATE.user.id;
  if (window.currentUser && currentUser.userId) return currentUser.userId;
  return '';
}

// 🔎 Поиск по тегу (публичные посты)
async function searchByTag() {
  try {
    const input = document.getElementById('searchTag');
    if (!input) return;
    const tag = (input.value || '').trim();
    const userId = getCurrentUserId();

    // Пустой запрос — показать обычный список публичных
    if (!tag) {
      const r = await fetch(`/api/posts/public?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const posts = await r.json();
      if (typeof window.renderPosts === 'function') {
        window.renderPosts('list-public', posts);
      } else {
        renderPublicFallback(posts);
      }
      return;
    }

    const r = await fetch(`/api/posts/search?tag=${encodeURIComponent(tag)}&userId=${encodeURIComponent(userId)}`, {
      headers: { 'Accept': 'application/json' },
    });

    // Если на бэке нет маршрута/ошибка — будет не-OK
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('Search failed:', r.status, text);
      alert(`Ошибка поиска: ${r.status}`);
      return;
    }

    const posts = await r.json();
    if (typeof window.renderPosts === 'function') {
      window.renderPosts('list-public', posts);
    } else {
      renderPublicFallback(posts);
    }
  } catch (e) {
    console.error('searchByTag error', e);
    alert('Ошибка поиска. Проверьте консоль.');
  }
}

// Фолбэк-рендер, window.renderPosts
function renderPublicFallback(posts) {
  const box = document.getElementById('list-public');
  if (!box) return;
  box.innerHTML = posts.map(p => `
    <article class="card bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <h3 class="text-lg font-semibold text-purple-400 mb-2">${escapeHtml(p.title || '')}</h3>
      <p class="text-gray-200 mb-3">${escapeHtml(p.content || '')}</p>
      <div class="flex flex-wrap gap-2">
        ${(p.tags || []).map(t => `<span class="px-2 py-1 rounded-lg bg-gray-800 text-xs">${escapeHtml(t)}</span>`).join('')}
      </div>
    </article>
  `).join('');
}

// Простая экранизация, чтобы не сломать верстку
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Сделать доступной из HTML-атрибута onclick
window.searchByTag = searchByTag;

// (не обязательно) запуск по Enter
const tagInputEl = document.getElementById('searchTag');
if (tagInputEl) {
  tagInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchByTag();
    }
  });
}
