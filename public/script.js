let token = null;
let currentUser = null;

const el = (id) => document.getElementById(id);
const api = async (path, opts={}) => {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers||{}), ...(token ? { "Authorization": "Bearer " + token } : {}) }
  });
  if (!res.ok) { throw new Error((await res.json()).error || 'error'); }
  return res.json();
};

async function refreshAll() {
  await loadPublic();
  if (token) {
    await Promise.all([loadFeed(), loadMine(), loadUsers(), loadRequests()]);
  }
}

el("loginBtn").onclick = async () => {
  try {
    const { user, token: t } = await api("/api/login", { method: "POST", body: JSON.stringify({ username: el("username").value, password: el("password").value }) });
    token = t; currentUser = user;
    el("me").textContent = `Вы: ${user.username}`;
    el("logoutBtn").style.display = "";
    el("panel").style.display = "";
    await refreshAll();
  } catch (e) { alert("Ошибка входа"); }
};

el("regBtn").onclick = async () => {
  try {
    const { user, token: t } = await api("/api/register", { method: "POST", body: JSON.stringify({ username: el("username").value, password: el("password").value }) });
    token = t; currentUser = user;
    el("me").textContent = `Вы: ${user.username}`;
    el("logoutBtn").style.display = "";
    el("panel").style.display = "";
    await refreshAll();
  } catch (e) { alert("Ошибка регистрации"); }
};

el("logoutBtn").onclick = () => {
  token = null; currentUser = null;
  el("me").textContent = "";
  el("logoutBtn").style.display = "none";
  el("panel").style.display = "none";
};

el("createPost").onclick = async () => {
  try {
    const title = el("title").value.trim();
    const content = el("content").value.trim();
    const visibility = el("visibility").value;
    const tags = el("tags").value.split(",").map(s=>s.trim()).filter(Boolean);
    await api("/api/posts", { method:"POST", body: JSON.stringify({ title, content, visibility, tags }) });
    el("title").value=""; el("content").value=""; el("tags").value="";
    await refreshAll();
  } catch (e) { alert("Ошибка создания поста"); }
};

async function loadPublic() {
  const data = await api("/api/posts/public");
  el("public").innerHTML = data.posts.map(renderPostCard).join("");
}
async function loadFeed() {
  const data = await api("/api/posts/feed");
  el("feed").innerHTML = data.posts.map(renderPostCard).join("");
}
async function loadMine() {
  const data = await api("/api/posts/mine");
  el("mine").innerHTML = data.posts.map(p => renderPostCard(p, true)).join("");
}
async function loadUsers() {
  const data = await api("/api/users");
  el("users").innerHTML = data.users.map(u => `
    <div class="card row">
      <div><b>${u.username}</b> <span class="meta">id:${u.id}</span></div>
      <div class="actions">
        <button onclick="follow(${u.id})">Подписаться</button>
        <button onclick="unfollow(${u.id})">Отписаться</button>
      </div>
    </div>
  `).join("");
}
async function loadRequests() {
  const data = await api("/api/requests");
  el("requests").innerHTML = data.requests.map(r => `
    <div class="card row">
      <div>Запрос к «${r.post_title}» от <b>${r.requester_name}</b></div>
      <div class="actions">
        <button onclick="resolveReq(${r.id}, true)">Одобрить</button>
        <button onclick="resolveReq(${r.id}, false)">Отклонить</button>
      </div>
    </div>
  `).join("");
}

function renderPostCard(p, mine=false) {
  const tags = (p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join("");
  const hidden = p.visibility === "request" ? "hidden" : "";
  const canRequest = p.visibility === "request";
  const actions = mine ? `
      <button onclick="editPost(${p.id})">Редактировать</button>
      <button onclick="deletePost(${p.id})">Удалить</button>
  ` : (canRequest ? `<button onclick="requestAccess(${p.id})">Запросить доступ</button>` : ``);
  const comments = (p.comments||[]).map(c => `<div class="meta">${new Date(c.created_at).toLocaleString()} — <b>${c.author_name}</b>: ${c.content}</div>`).join("");
  const commentBox = token ? `<div class="row"><input id="c_${p.id}" placeholder="Комментарий"><button onclick="sendComment(${p.id})">Отправить</button></div>` : "";
  return `
  <div class="card ${hidden}">
    <div class="row">
      <div><b>${p.title}</b> <span class="meta">Автор: ${p.author_name} • ${new Date(p.created_at).toLocaleString()} • ${p.visibility}</span></div>
    </div>
    <div>${p.visibility==='public' ? p.content.replaceAll('\n','<br>') : '<i>Контент скрыт. Доступ по запросу.</i>'}</div>
    <div>${tags}</div>
    <div class="actions">${actions}</div>
    <div>${comments}</div>
    ${commentBox}
  </div>`;
}

window.follow = async (id) => { try { await api(`/api/subscribe/${id}`, { method:"POST" }); await refreshAll(); } catch(e){ alert("Ошибка подписки"); } };
window.unfollow = async (id) => { try { await api(`/api/subscribe/${id}`, { method:"DELETE" }); await refreshAll(); } catch(e){ alert("Ошибка отписки"); } };
window.requestAccess = async (id) => { try { await api(`/api/posts/${id}/request-access`, { method:"POST" }); alert("Запрос отправлен"); } catch(e){ alert("Ошибка запроса"); } };
window.resolveReq = async (id, approve) => { try { await api(`/api/requests/${id}/resolve`, { method:"POST", body: JSON.stringify({ approve }) }); await loadRequests(); } catch(e){ alert("Ошибка"); } };
window.deletePost = async (id) => { if (!confirm("Удалить пост?")) return; try { await api(`/api/posts/${id}`, { method:"DELETE" }); await refreshAll(); } catch(e){ alert("Ошибка удаления"); } };
window.editPost = async (id) => {
  const title = prompt("Новый заголовок");
  const content = prompt("Новый текст");
  const visibility = prompt("Видимость: public или request","public");
  const tags = prompt("Теги через запятую","").split(",").map(s=>s.trim()).filter(Boolean);
  try { await api(`/api/posts/${id}`, { method:"PUT", body: JSON.stringify({ title, content, visibility, tags }) }); await refreshAll(); } catch(e){ alert("Ошибка сохранения"); }
};
window.sendComment = async (postId) => {
  try {
    const content = document.getElementById(`c_${postId}`).value.trim();
    if (!content) return;
    await api(`/api/posts/${postId}/comments`, { method:"POST", body: JSON.stringify({ content }) });
    await refreshAll();
  } catch(e){ alert("Ошибка комментария"); }
};

(async function init(){
  try {
    await refreshAll();
  } catch {}
})();