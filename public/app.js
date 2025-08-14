let currentUser = null;
let activeTab = 'public';

function $(id){ return document.getElementById(id); }

function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add('hidden'); }

function setAuthedUI(on) {
  if (on) {
    $('authArea').classList.add('hidden');
    $('userArea').classList.remove('hidden');
    $('navTabs').classList.remove('hidden');
    $('postSection').classList.remove('hidden');
    $('filters').classList.remove('hidden');
    $('helloUser').textContent = `Привет, ${currentUser.username}!`;
  } else {
    $('authArea').classList.remove('hidden');
    $('userArea').classList.add('hidden');
    $('navTabs').classList.add('hidden');
    $('postSection').classList.add('hidden');
    $('filters').classList.add('hidden');
  }
}

async function register() {
  const username = $('regUser').value.trim();
  const password = $('regPass').value;
  const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password}) });
  const data = await res.json();
  if (data.success) {
    currentUser = data.user;
    closeModal('registerModal');
    setAuthedUI(true);
    switchTab('public');
    reloadActive();
    alert('Успешная регистрация и вход!');
  } else {
    alert(data.error || 'Ошибка регистрации');
  }
}

async function login() {
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password}) });
  const data = await res.json();
  if (data.success) {
    currentUser = data.user;
    closeModal('loginModal');
    setAuthedUI(true);
    switchTab('public');
    reloadActive();
  } else {
    alert(data.error || 'Ошибка входа');
  }
}

function logout(){
  currentUser = null;
  setAuthedUI(false);
  // clear lists
  ['listPublic','listFeed','listMyPosts','listUsers','listRequests'].forEach(id => $(id).innerHTML = '');
}

function switchTab(tab){
  activeTab = tab;
  ['public','feed','myposts','users','requests'].forEach(t => {
    $('list'+capitalize(t)).classList.toggle('hidden', t!==tab);
    document.querySelector(`[data-tab="${t}"]`).classList.toggle('bg-[#1A1A2A]', t===tab);
  });
  reloadActive();
}
function capitalize(s){ return s[0].toUpperCase()+s.slice(1); }

async function createPost(){
  const title = $('postTitle').value.trim();
  const content = $('postContent').value.trim();
  const tags = $('postTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const visibility = $('postVisibility').value;
  if (!title || !content) return alert('Заполните заголовок и текст');
  const res = await fetch('/api/posts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id, title, content, tags, visibility }) });
  const data = await res.json();
  if (data.success) {
    $('postTitle').value = '';
    $('postContent').value = '';
    $('postTags').value = '';
    reloadActive();
  } else alert(data.error || 'Ошибка публикации');
}

function sortPosts(list){
  const mode = $('sortMode').value;
  return list.sort((a,b)=>{
    if (mode==='date_desc') return new Date(b.createdAt)-new Date(a.createdAt);
    if (mode==='date_asc') return new Date(a.createdAt)-new Date(b.createdAt);
    if (mode==='title_asc') return a.title.localeCompare(b.title);
    if (mode==='title_desc') return b.title.localeCompare(a.title);
    return 0;
  });
}

async function reloadActive(){
  const tag = $('filterTag').value.trim();
  if (activeTab==='public'){
    const url = tag ? `/api/posts/public?tag=${encodeURIComponent(tag)}` : '/api/posts/public';
    const res = await fetch(url); const list = await res.json();
    renderPosts('listPublic', list, true);
  } else if (activeTab==='feed'){
    const res = await fetch(`/api/feed/${currentUser.id}`); let list = await res.json();
    if (tag) list = list.filter(p => (p.tags||[]).map(t=>t.toLowerCase()).includes(tag.toLowerCase()));
    renderPosts('listFeed', sortPosts(list));
  } else if (activeTab==='myposts'){
    const res = await fetch(`/api/posts/visible/${currentUser.id}`); let list = await res.json();
    list = list.filter(p => p.userId === currentUser.id);
    if (tag) list = list.filter(p => (p.tags||[]).map(t=>t.toLowerCase()).includes(tag.toLowerCase()));
    renderPosts('listMyPosts', sortPosts(list), false, true);
  } else if (activeTab==='users'){
    const res = await fetch('/api/users'); const list = await res.json();
    renderUsers('listUsers', list);
  } else if (activeTab==='requests'){
    const res = await fetch(`/api/requests/${currentUser.id}`); const list = await res.json();
    renderRequests('listRequests', list);
  }
}

function renderUsers(rootId, users){
  const root = $(rootId);
  root.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'card mb-3 flex items-center justify-between';
    const isMe = currentUser.id === u.id;
    const isSub = (currentUser.subscriptions||[]).includes(u.id);
    div.innerHTML = `
      <div>
        <div class="text-lg font-semibold">${u.username} ${isMe ? '<span class="text-xs text-gray-400">(это вы)</span>' : ''}</div>
        <div class="text-xs text-gray-400">id: ${u.id}</div>
      </div>
      <div class="flex gap-2">
        ${!isMe ? `<button class="btn" onclick="toggleSubscribe('${u.id}')">${isSub?'Unsubscribe':'Subscribe'}</button>` : ''}
      </div>
    `;
    root.appendChild(div);
  });
}

function renderRequests(rootId, items){
  const root = $(rootId);
  root.innerHTML = '';
  if (items.length===0){
    root.innerHTML = `<div class="card text-gray-300">Нет входящих запросов на доступ</div>`;
    return;
  }
  items.forEach(it => {
    const wrap = document.createElement('div');
    wrap.className = 'card mb-3';
    const users = (it.pendingRequests||[]).map(id => `<span class="tag">${id}</span>`).join(' ');
    wrap.innerHTML = `
      <div class="font-semibold mb-2">Пост: ${it.title}</div>
      <div class="text-sm text-gray-400 mb-3">Запросы: ${users||'—'}</div>
      <div class="flex flex-wrap gap-2" id="req-actions-${it.postId}"></div>
    `;
    root.appendChild(wrap);
    (it.pendingRequests||[]).forEach(uid => {
      const btnApprove = document.createElement('button');
      btnApprove.className = 'btn';
      btnApprove.textContent = `Одобрить ${uid.slice(0,6)}…`;
      btnApprove.onclick = () => resolveRequest(it.postId, uid, true);
      const btnDeny = document.createElement('button');
      btnDeny.className = 'btn-secondary';
      btnDeny.textContent = `Отклонить ${uid.slice(0,6)}…`;
      btnDeny.onclick = () => resolveRequest(it.postId, uid, false);
      $('req-actions-'+it.postId).append(btnApprove, btnDeny);
    });
  });
}

async function resolveRequest(postId, requesterId, approve){
  const res = await fetch('/api/requests/resolve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ownerId: currentUser.id, postId, requesterId, approve }) });
  const data = await res.json();
  if (data.success) reloadActive();
  else alert(data.error || 'Ошибка');
}

function renderPosts(rootId, list, showSubscribe=true, mineOnly=false){
  const root = $(rootId);
  root.innerHTML = '';
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'post';
    const isOwner = currentUser && currentUser.id === p.userId;
    const canSee = p.visibility==='public' || isOwner || (p.allowedUsers||[]).includes(currentUser?.id);
    const tagHtml = (p.tags||[]).map(t => `<span class="tag">${t}</span>`).join(' ');
    const author = p.userId;
    const isSubscribed = (currentUser?.subscriptions||[]).includes(author);
    div.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm text-gray-400 mb-1">Автор: <span class="text-gray-200">${author}</span> ${p.visibility==='request' ? '<span class="tag ml-2">по запросу</span>' : ''}</div>
          <h3 class="text-xl font-bold text-gray-100 mb-2">${p.title}</h3>
        </div>
        <div class="flex gap-2">
          ${!isOwner && showSubscribe ? `<button class="btn" onclick="toggleSubscribe('${author}')">${isSubscribed?'Unsubscribe':'Subscribe'}</button>` : ''}
          ${isOwner ? `<button class="btn-secondary" onclick="openEdit('${p.id}')">Редактировать</button>` : ''}
          ${isOwner ? `<button class="btn-secondary" onclick="delPost('${p.id}')">Удалить</button>` : ''}
        </div>
      </div>
      <div class="text-gray-200 mb-3">${canSee ? escapeHtml(p.content).replace(/\n/g,'<br>') : '<i>Содержимое скрыто. Запросите доступ.</i>'}</div>
      <div class="flex flex-wrap gap-2 mb-3">${tagHtml}</div>
      <div class="flex gap-2 mb-2">
        ${!canSee && p.visibility==='request' ? `<button class="btn" onclick="requestAccess('${p.id}')">Запросить доступ</button>` : ''}
      </div>
      <div id="comments-${p.id}" class="${canSee ? '' : 'hidden'}">
        <h4 class="font-semibold mb-2">Комментарии</h4>
        <div id="comments-list-${p.id}" class="space-y-2 mb-2"></div>
        <div class="flex gap-2">
          <input id="comment-input-${p.id}" class="input" placeholder="Ваш комментарий">
          <button class="btn" onclick="addComment('${p.id}')">Отправить</button>
        </div>
      </div>
    `;
    root.appendChild(div);
    if (canSee) loadComments(p.id);
  });
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function requestAccess(postId){
  const res = await fetch('/api/request-access', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id, postId })});
  const data = await res.json();
  if (data.success) alert('Запрос отправлен автору.');
  else alert(data.error || 'Ошибка');
}

async function toggleSubscribe(targetId){
  const subscribed = (currentUser.subscriptions||[]).includes(targetId);
  const endpoint = subscribed ? '/api/unsubscribe' : '/api/subscribe';
  const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id, targetId }) });
  const data = await res.json();
  if (data.success){
    currentUser.subscriptions = data.subscriptions;
    reloadActive();
  } else alert(data.error || 'Ошибка подписки');
}

async function openEdit(postId){
  const res = await fetch(`/api/posts/visible/${currentUser.id}`);
  const list = await res.json();
  const p = list.find(x => x.id===postId);
  if (!p) return alert('Пост не найден');
  const title = prompt('Новый заголовок:', p.title);
  if (title===null) return;
  const content = prompt('Новый текст:', p.content);
  if (content===null) return;
  const tags = prompt('Теги через запятую:', (p.tags||[]).join(', ')) || '';
  const visibility = confirm('Сделать пост доступным ТОЛЬКО по запросу? Нажми OK для "по запросу", Отмена — публичный') ? 'request' : 'public';
  const res2 = await fetch(`/api/posts/${postId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id, title, content, tags: tags.split(',').map(s=>s.trim()).filter(Boolean), visibility }) });
  const data = await res2.json();
  if (data.success) reloadActive(); else alert(data.error || 'Ошибка сохранения');
}

async function delPost(postId){
  if (!confirm('Удалить пост безвозвратно?')) return;
  const res = await fetch(`/api/posts/${postId}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id }) });
  const data = await res.json();
  if (data.success) reloadActive(); else alert(data.error || 'Ошибка удаления');
}

async function loadComments(postId){
  const res = await fetch(`/api/posts/${postId}/comments`);
  const list = await res.json();
  const root = $(`comments-list-${postId}`);
  root.innerHTML = '';
  list.forEach(c => {
    const div = document.createElement('div');
    div.className = 'text-sm text-gray-300';
    div.innerHTML = `<span class="tag mr-2">${c.userId.slice(0,6)}…</span> ${escapeHtml(c.content)}`;
    root.appendChild(div);
  });
}

async function addComment(postId){
  const input = $(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;
  const res = await fetch(`/api/posts/${postId}/comments`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: currentUser.id, content }) });
  const data = await res.json();
  if (data.success) {
    input.value='';
    loadComments(postId);
  } else alert(data.error || 'Ошибка комментария');
}

// Initial
switchTab('public');
setAuthedUI(false);
