let currentUser = null;

async function register() {
  const username = document.getElementById('regUser').value;
  const password = document.getElementById('regPass').value;
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  alert(data.success ? 'Registered!' : data.error);
}

async function login() {
  const username = document.getElementById('logUser').value;
  const password = document.getElementById('logPass').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.success) {
    currentUser = data;
    document.getElementById('postSection').classList.remove('hidden');
    loadPosts();
  } else {
    alert(data.error);
  }
}

async function createPost() {
  const title = document.getElementById('postTitle').value;
  const content = document.getElementById('postContent').value;
  const tags = document.getElementById('postTags').value.split(',').map(t => t.trim());
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.userId, title, content, tags })
  });
  const data = await res.json();
  if (data.success) {
    loadPosts();
  }
}

async function loadPosts() {
  const res = await fetch('/api/posts');
  const data = await res.json();
  const postsDiv = document.getElementById('posts');
  postsDiv.innerHTML = '';
  data.forEach(post => {
    const div = document.createElement('div');
    div.className = 'bg-gray-800 p-6 rounded-2xl shadow-lg mb-4 hover:scale-105 transition-transform duration-200';
    div.innerHTML = `<h3 class='text-xl font-bold text-purple-400 mb-2'>${post.title}</h3>
                     <p class='text-gray-200 mb-2'>${post.content}</p>
                     <p class='text-sm text-gray-400'>Tags: ${post.tags.join(', ')}</p>`;
    postsDiv.appendChild(div);
  });
}
