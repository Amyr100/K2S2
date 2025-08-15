
// Frontend for Social App V4 (auth fixed, centered modal, tags, subscriptions, requests)
document.addEventListener('DOMContentLoaded', () => {
  let state = { token: null, user: null, currentTab: 'public', authMode: 'login' };

  function setAuthUI(){
    const area = document.getElementById('authArea');
    area.innerHTML = '';
    if (state.user){
      const span = document.createElement('span'); span.textContent = '@' + state.user.username;
      const logout = document.createElement('button'); logout.className = 'tab'; logout.textContent = 'Выйти';
      logout.onclick = () => { localStorage.removeItem('token'); state.token = null; state.user = null; setAuthUI(); loadTab(state.currentTab); loadSubsBox(); };
      area.append(span, logout);
      document.getElementById('createPost').classList.remove('hidden');
    } else {
      const loginBtn = document.createElement('button'); loginBtn.className = 'btn'; loginBtn.textContent = 'Войти / Регистрация'; loginBtn.onclick = openLogin;
      area.append(loginBtn);
      document.getElementById('createPost').classList.add('hidden');
    }
  }

  function openLogin(){ state.authMode = 'login'; document.getElementById('authTitle').textContent = 'Вход'; document.getElementById('authMessage').textContent=''; document.getElementById('authUser').value=''; document.getElementById('authPass').value=''; document.getElementById('authModal').classList.add('show'); }
  function closeLogin(){ document.getElementById('authModal').classList.remove('show'); }

  document.getElementById('authSwap').addEventListener('click', ()=>{ state.authMode = state.authMode === 'login' ? 'register' : 'login'; document.getElementById('authTitle').textContent = state.authMode==='login' ? 'Вход' : 'Регистрация'; document.getElementById('authMessage').textContent=''; });
  document.getElementById('authSubmit').addEventListener('click', submitAuth);
  document.getElementById('authModal').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); submitAuth(); } if(e.key==='Escape'){ closeLogin(); } });
  document.getElementById('authModal').addEventListener('click', (e)=>{ if(e.target === document.getElementById('authModal')) closeLogin(); });

  async function submitAuth(){
    const username = document.getElementById('authUser').value.trim();
    const password = document.getElementById('authPass').value.trim();
    const msg = document.getElementById('authMessage'); msg.textContent = '';
    if (!username || !password){ msg.textContent = 'Введите логин и пароль'; return; }
    const url = state.authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (res.ok && data.success){
        state.token = data.token; localStorage.setItem('token', data.token); state.user = data.user; setAuthUI(); closeLogin(); loadTab('public'); loadSubsBox();
      } else {
        msg.textContent = data.error || data.message || 'Ошибка';
      }
    } catch (e){
      msg.textContent = 'Сетевая ошибка';
    }
  }

  async function api(path, opts={}){
    const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
    if (state.token) headers['Authorization'] = 'Bearer '+state.token;
    const res = await fetch(path, { ...opts, headers });
    try { return await res.json(); } catch(e){ return { error:'Invalid response' }; }
  }

  function selectTab(name){ state.currentTab=name; document.querySelectorAll('nav .tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===name)); loadTab(name); }

  async function loadTab(name){
    const list = document.getElementById('list'); list.innerHTML='';
    if (name==='public'){ const posts = await api('/api/posts/public'); renderPosts(posts); }
    if (name==='feed'){ if(!state.user) { list.innerHTML = needLogin(); return; } const posts = await api('/api/posts/feed'); renderPosts(posts); }
    if (name==='mine'){ if(!state.user) { list.innerHTML = needLogin(); return; } const posts = await api('/api/posts/mine'); renderPosts(posts, true); }
    if (name==='subs'){ if(!state.user){ list.innerHTML = needLogin(); return; } const subs = await api('/api/subscriptions/list'); const box = document.createElement('div'); box.className='card p-4'; if(!subs || subs.length===0){ box.innerHTML = '<div class=\"text-sm text-gray-400\">Подписок пока нет</div>'; } else subs.forEach(u=>{ const row = document.createElement('div'); row.className='flex items-center justify-between py-2 border-b border-white/5 last:border-none'; row.innerHTML = `<div>@${u.username}</div>`; const btn = document.createElement('button'); btn.className='text-xs underline'; btn.textContent='Отписаться'; btn.onclick = async()=>{ await api('/api/unsubscribe',{method:'POST', body:JSON.stringify({ targetUserId: u.id })}); loadSubsBox(); selectTab('subs'); }; row.append(btn); box.append(row); }); list.append(box); }
    if (name==='requests'){ if(!state.user){ list.innerHTML = needLogin(); return; } const reqs = await api('/api/requests'); const box = document.createElement('div'); box.className='card p-4 space-y-2'; if(!reqs || reqs.length===0){ box.innerHTML = '<div class=\"text-sm text-gray-400\">Запросов нет</div>'; } else reqs.forEach(r=>{ const row = document.createElement('div'); row.className='flex items-center justify-between py-2 border-b border-white/5 last:border-none'; row.innerHTML = `<div><b>${r.requester}</b> просит доступ к «${r.postTitle}»</div>`; const actions = document.createElement('div'); actions.className='flex gap-2'; const a=document.createElement('button'); a.className='btn text-sm'; a.textContent='Одобрить'; a.onclick = async()=>{ await api(`/api/requests/${r.id}/approve`,{method:'POST'}); selectTab('requests'); }; const d=document.createElement('button'); d.className='tab text-sm'; d.textContent='Отклонить'; d.onclick = async()=>{ await api(`/api/requests/${r.id}/deny`,{method:'POST'}); selectTab('requests'); }; actions.append(a,d); row.append(actions); box.append(row); }); list.append(box); }
  }

  function needLogin(){ return `<div class="card p-4 text-sm text-gray-400">Нужен вход</div>`; }

  function renderPosts(posts, mine=false){
    const list = document.getElementById('list');
    if(!posts || posts.length===0){ list.innerHTML='<div class=\"card p-4 text-sm text-gray-400\">Постов нет</div>'; return; }
    posts.forEach(p=>{
      const card = document.createElement('div'); card.className='card p-4';
      const tags = (p.tags||[]).map(t=>`<span class=\"tag cursor-pointer\" data-tag=\"${t}\">#${t}</span>`).join(' ');
      const content = p.restricted ? '<i class=\"text-sm text-gray-400\">Контент доступен по запросу</i>' : (p.content||'');
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="font-semibold">${p.title}</div>
          <div class="text-xs text-gray-400">@${p.author}</div>
        </div>
        <div class="mt-2 whitespace-pre-wrap">${content}</div>
        <div class="mt-3 flex flex-wrap gap-2">${tags}</div>
        <div class="mt-3 flex items-center gap-2" id="actions-${p.id}"></div>
      `;
      const act = card.querySelector(`#actions-${p.id}`);
      if(p.restricted){
        if(state.user){
          const b=document.createElement('button'); b.className='btn text-sm'; b.textContent='Запросить доступ'; b.onclick = async()=>{ const r=await api(`/api/posts/${p.id}/request-access`,{method:'POST'}); alert(r.error || 'Запрос отправлен'); }; act.append(b);
        } else {
          const b=document.createElement('button'); b.className='btn text-sm'; b.textContent='Войти, чтобы запросить'; b.onclick = openLogin; act.append(b);
        }
      }
      if(state.user && p.authorId !== state.user.id){
        const sub=document.createElement('button'); sub.className='tab text-sm'; sub.textContent='Подписаться'; sub.onclick = async()=>{ await api('/api/subscribe',{method:'POST', body:JSON.stringify({ targetUserId: p.authorId })}); loadSubsBox(); alert('Подписка оформлена'); }; act.append(sub);
      }
      if(mine){
        const e=document.createElement('button'); e.className='tab text-sm'; e.textContent='Редактировать'; e.onclick=()=>editPostPrompt(p);
        const d=document.createElement('button'); d.className='tab text-sm'; d.textContent='Удалить'; d.onclick=async()=>{ await api(`/api/posts/${p.id}`,{method:'DELETE'}); selectTab('mine'); };
        act.append(e,d);
      }
      const commentsBox=document.createElement('div'); commentsBox.className='mt-4 space-y-2'; loadComments(p.id, commentsBox);
      if(state.user && !p.restricted){
        const add=document.createElement('div'); add.className='flex gap-2';
        const input=document.createElement('input'); input.className='input-dark flex-1'; input.placeholder='Ваш комментарий...';
        const btn=document.createElement('button'); btn.className='btn'; btn.textContent='Отправить'; btn.onclick = async()=>{ const text=input.value.trim(); if(!text) return; await api(`/api/posts/${p.id}/comments`,{method:'POST', body:JSON.stringify({ text })}); input.value=''; loadComments(p.id, commentsBox, true); };
        add.append(input,btn); commentsBox.append(add);
      }
      card.append(commentsBox);
      list.append(card);
    });
    document.querySelectorAll('.tag').forEach(el=> el.addEventListener('click', ()=> filterByTag(el.dataset.tag)));
  }

  async function loadComments(postId, box, refresh=false){
    const list = await api(`/api/posts/${postId}/comments`);
    const container=document.createElement('div'); container.className='space-y-1';
    (list||[]).forEach(c=>{ const row=document.createElement('div'); row.className='text-sm text-gray-300'; row.textContent=`@${c.author}: ${c.text}`; container.append(row); });
    if(refresh){ const prev = box.querySelector(':scope > .space-y-1'); if(prev) prev.remove(); }
    box.prepend(container);
  }

  document.querySelectorAll('nav .tab').forEach(btn=> btn.addEventListener('click', ()=> selectTab(btn.dataset.tab)));
  document.getElementById('btnCreate').addEventListener('click', async ()=>{
    if(!state.user) return openLogin();
    const title=document.getElementById('title').value.trim();
    const content=document.getElementById('content').value.trim();
    const tags=document.getElementById('tags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const visibility=[...document.querySelectorAll('input[name=\"vis\"]')].find(x=>x.checked).value;
    const res = await api('/api/posts',{method:'POST', body:JSON.stringify({ title, content, tags, visibility })});
    if(res.error) return alert(res.error);
    document.getElementById('title').value=''; document.getElementById('content').value=''; document.getElementById('tags').value='';
    selectTab('mine'); refreshTagCloud();
  });

  function editPostPrompt(p){
    const title = prompt('Заголовок', p.title); if(title===null) return;
    const content = prompt('Текст', p.content||''); if(content===null) return;
    const tags = prompt('Теги через запятую', (p.tags||[]).join(', '));
    const visibility = confirm('Сделать пост закрытым «по запросу»? OK—да / Cancel—нет') ? 'restricted' : 'public';
    api(`/api/posts/${p.id}`, { method:'PUT', body: JSON.stringify({ title, content, tags: (tags||'').split(',').map(s=>s.trim()).filter(Boolean), visibility }) }).then(()=>{ selectTab('mine'); refreshTagCloud(); });
  }

  async function refreshTagCloud(){ renderTagCloud(await api('/api/tags')); }
  function renderTagCloud(list){
    const box = document.getElementById('tagCloud'); box.innerHTML='';
    if(!list || !list.length){ box.innerHTML = '<div class=\"text-sm text-gray-400\">Пока тегов нет</div>'; return; }
    const max = Math.max(...list.map(x=>x.count)), min = Math.min(...list.map(x=>x.count));
    list.forEach(({tag,count})=>{ const f=(count-min)/Math.max(1,(max-min)); const size=0.85+f*0.9; const el=document.createElement('span'); el.className='tag cursor-pointer'; el.style.fontSize=size+'rem'; el.textContent='#'+tag; el.onclick = ()=> filterByTag(tag); box.append(el); });
  }
  async function filterByTag(tag){
    document.querySelectorAll('nav .tab').forEach(b=>b.classList.remove('active'));
    const posts = await api('/api/posts/by-tag/'+encodeURIComponent(tag));
    const list = document.getElementById('list'); list.innerHTML = `<div class=\"text-sm text-gray-400 mb-2\">Фильтр по тегу: #${tag}</div>`;
    renderPosts(posts);
  }

  async function loadSubsBox(){
    const box = document.getElementById('subsList'); box.innerHTML='';
    if(!state.user){ box.innerHTML = '<div class=\"text-sm text-gray-500\">Нужен вход</div>'; return; }
    const subs = await api('/api/subscriptions/list');
    if(!subs || !subs.length){ box.innerHTML = '<div class=\"text-sm text-gray-500\">Пусто</div>'; return; }
    subs.forEach(u=>{ const row = document.createElement('div'); row.className='flex items-center justify-between'; row.innerHTML=`<div>@${u.username}</div>`; const btn=document.createElement('button'); btn.className='text-xs underline'; btn.textContent='Отписаться'; btn.onclick = async()=>{ await api('/api/unsubscribe',{method:'POST', body:JSON.stringify({ targetUserId: u.id })}); loadSubsBox(); if(state.currentTab==='subs') selectTab('subs'); }; row.append(btn); box.append(row); });
  }

  (async function init(){
    const t = localStorage.getItem('token'); if(t){ state.token = t; const me = await api('/api/me'); if(me && me.id) state.user = me; else { localStorage.removeItem('token'); state.token = null; } }
    setAuthUI(); selectTab('public'); refreshTagCloud(); loadSubsBox();
  })();

});
