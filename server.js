
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json({limit:'1mb'}));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

let db = { users: [], posts: [], requests: [], comments: [] };

function loadDB(){
  if (fs.existsSync(DATA_FILE)){
    try{ db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
    catch(e){ console.error('Failed to parse data.json:', e); db={users:[],posts:[],requests:[],comments:[]}; }
  } else {
    db = seed(); saveDB();
  }
}
function saveDB(){ fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function seed(){
  const aliceId = uuidv4(), bobId = uuidv4(), carolId = uuidv4();
  const users = [
    { id: aliceId, username:'alice', passwordHash:bcrypt.hashSync('alice',10), subscriptions:[bobId] },
    { id: bobId, username:'bob',   passwordHash:bcrypt.hashSync('bob',10),   subscriptions:[] },
    { id: carolId, username:'carol', passwordHash:bcrypt.hashSync('carol',10), subscriptions:[] },
  ];
  const posts = [
    { id: uuidv4(), authorId:bobId, title:'Публичный пост Боба', content:'Добро пожаловать!', tags:['welcome','public'], visibility:'public', allowedUserIds:[], createdAt:new Date().toISOString() },
    { id: uuidv4(), authorId:bobId, title:'Скрытый пост Боба', content:'Секретный контент', tags:['secret'], visibility:'restricted', allowedUserIds:[], createdAt:new Date().toISOString() }
  ];
  return { users, posts, requests: [], comments: [] };
}
loadDB();

function auth(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token){
    try { req.user = jwt.verify(token, JWT_SECRET); } catch(e){}
  }
  next();
}
app.use(auth);
function requireAuth(req,res,next){ if(!req.user) return res.status(401).json({error:'Unauthorized'}); next(); }
const uById = id => db.users.find(u=>u.id===id);
const uByName = name => db.users.find(u=>u.username===name);
const uname = id => (uById(id)||{}).username;

// Auth
app.post('/api/register', async (req,res)=>{
  const {username,password} = req.body;
  if(!username || !password) return res.status(400).json({error:'Missing fields'});
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())) return res.status(400).json({error:'User exists'});
  const user = { id: uuidv4(), username, passwordHash: await bcrypt.hash(password,10), subscriptions:[] };
  db.users.push(user); saveDB();
  const token = jwt.sign({id:user.id, username:user.username}, JWT_SECRET, {expiresIn:'7d'});
  res.json({success:true, token, user:{id:user.id, username:user.username, subscriptions:user.subscriptions}});
});
app.post('/api/login', async (req,res)=>{
  const {username,password} = req.body;
  const user = uByName(username);
  if(!user) return res.status(400).json({error:'Invalid credentials'});
  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok) return res.status(400).json({error:'Invalid credentials'});
  const token = jwt.sign({id:user.id, username:user.username}, JWT_SECRET, {expiresIn:'7d'});
  res.json({success:true, token, user:{id:user.id, username:user.username, subscriptions:user.subscriptions}});
});
app.get('/api/me', (req,res)=>{
  if(!req.user) return res.json(null);
  const u = uById(req.user.id);
  res.json({ id:u.id, username:u.username, subscriptions:u.subscriptions });
});

// Subscriptions
app.get('/api/subscriptions/list', requireAuth, (req,res)=>{
  const me = uById(req.user.id);
  const list = me.subscriptions.map(id => {
    const u = uById(id);
    return u ? { id:u.id, username:u.username } : null;
  }).filter(Boolean);
  res.json(list);
});
app.post('/api/subscribe', requireAuth, (req,res)=>{
  const { targetUserId } = req.body;
  const me = uById(req.user.id);
  if(!uById(targetUserId)) return res.status(404).json({error:'User not found'});
  if(!me.subscriptions.includes(targetUserId)) me.subscriptions.push(targetUserId);
  saveDB();
  res.json({success:true, subscriptions:me.subscriptions});
});
app.post('/api/unsubscribe', requireAuth, (req,res)=>{
  const { targetUserId } = req.body;
  const me = uById(req.user.id);
  me.subscriptions = me.subscriptions.filter(id=>id!==targetUserId);
  saveDB();
  res.json({success:true, subscriptions:me.subscriptions});
});

// Posts and related endpoints (same as before)
app.get('/api/posts/public', (req,res)=>{
  const viewer = req.user?.id;
  const result = db.posts
    .filter(p => p.visibility==='public' || p.visibility==='restricted')
    .map(p=>{
      const base = { id:p.id, title:p.title, authorId:p.authorId, author:uname(p.authorId), tags:p.tags||[], visibility:p.visibility, createdAt:p.createdAt };
      const canSee = p.visibility==='public' || p.authorId===viewer || (p.allowedUserIds||[]).includes(viewer);
      return canSee ? { ...base, content:p.content } : { ...base, restricted:true };
    });
  res.json(result);
});
app.get('/api/posts/feed', requireAuth, (req,res)=>{
  const me = uById(req.user.id);
  const ids = new Set(me.subscriptions);
  const result = db.posts.filter(p=>ids.has(p.authorId)).map(p=>{
    const base = { id:p.id, title:p.title, authorId:p.authorId, author:uname(p.authorId), tags:p.tags||[], visibility:p.visibility, createdAt:p.createdAt };
    const canSee = p.visibility==='public' || p.authorId===me.id || (p.allowedUserIds||[]).includes(me.id);
    return canSee ? { ...base, content:p.content } : { ...base, restricted:true };
  });
  res.json(result);
});
app.get('/api/posts/mine', requireAuth, (req,res)=>{
  res.json(db.posts.filter(p=>p.authorId===req.user.id).map(p=>({...p, author:uname(p.authorId)})));
});
app.post('/api/posts', requireAuth, (req,res)=>{
  const { title, content, tags, visibility } = req.body;
  if(!title) return res.status(400).json({error:'Title required'});
  const post = { id:uuidv4(), authorId:req.user.id, title, content:content||'', tags:Array.isArray(tags)?tags:[], visibility:visibility==='restricted'?'restricted':'public', allowedUserIds:[], createdAt:new Date().toISOString() };
  db.posts.unshift(post); saveDB();
  res.json({success:true, post:{...post, author:uname(post.authorId)}});
});
app.put('/api/posts/:id', requireAuth, (req,res)=>{
  const post = db.posts.find(p=>p.id===req.params.id);
  if(!post) return res.status(404).json({error:'Not found'});
  if(post.authorId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  const { title, content, tags, visibility } = req.body;
  if(title!==undefined) post.title = title;
  if(content!==undefined) post.content = content;
  if(tags!==undefined) post.tags = Array.isArray(tags)?tags:[];
  if(visibility!==undefined) post.visibility = visibility==='restricted'?'restricted':'public';
  saveDB();
  res.json({success:true, post});
});
app.delete('/api/posts/:id', requireAuth, (req,res)=>{
  const idx = db.posts.findIndex(p=>p.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  if(db.posts[idx].authorId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  db.posts.splice(idx,1); saveDB(); res.json({success:true});
});

// Access requests endpoints (same as before)
app.post('/api/posts/:id/request-access', requireAuth, (req,res)=>{
  const post = db.posts.find(p=>p.id===req.params.id);
  if(!post || post.visibility!=='restricted') return res.status(400).json({error:'Invalid post'});
  if(post.authorId===req.user.id) return res.status(400).json({error:'You are the author'});
  if((post.allowedUserIds||[]).includes(req.user.id)) return res.status(400).json({error:'Already allowed'});
  const dup = (db.requests||[]).find(r=>r.postId===post.id && r.requesterId===req.user.id && r.status==='pending');
  if(dup) return res.status(400).json({error:'Already requested'});
  const r = { id:uuidv4(), postId:post.id, requesterId:req.user.id, status:'pending', createdAt:new Date().toISOString() };
  db.requests.push(r); saveDB(); res.json({success:true, request:r});
});
app.get('/api/requests', requireAuth, (req,res)=>{
  const myPostIds = new Set(db.posts.filter(p=>p.authorId===req.user.id).map(p=>p.id));
  const list = db.requests.filter(r=>myPostIds.has(r.postId)).map(r=>({...r, requester:(uById(r.requesterId)||{}).username, postTitle:(db.posts.find(p=>p.id===r.postId)||{}).title }));
  res.json(list);
});
app.post('/api/requests/:id/approve', requireAuth, (req,res)=>{
  const r = db.requests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Not found'});
  const post = db.posts.find(p=>p.id===r.postId);
  if(!post || post.authorId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  r.status='approved'; post.allowedUserIds = post.allowedUserIds||[]; if(!post.allowedUserIds.includes(r.requesterId)) post.allowedUserIds.push(r.requesterId);
  saveDB(); res.json({success:true});
});
app.post('/api/requests/:id/deny', requireAuth, (req,res)=>{
  const r = db.requests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Not found'});
  const post = db.posts.find(p=>p.id===r.postId);
  if(!post || post.authorId!==req.user.id) return res.status(403).json({error:'Forbidden'});
  r.status='denied'; saveDB(); res.json({success:true});
});

// Tags and comments (same as before)
app.get('/api/tags', (req,res)=>{
  const counts = {};
  for(const p of db.posts){ for(const t of (p.tags||[])){ const k=t.toLowerCase(); counts[k]=(counts[k]||0)+1; } }
  res.json(Object.entries(counts).map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count));
});
app.get('/api/posts/by-tag/:tag', (req,res)=>{
  const viewer = req.user?.id;
  const tag = req.params.tag.toLowerCase();
  const result = db.posts.filter(p=>(p.tags||[]).some(t=>t.toLowerCase()===tag)).filter(p=>p.visibility==='public' || p.visibility==='restricted').map(p=>{
    const base = { id:p.id, title:p.title, authorId:p.authorId, author:uname(p.authorId), tags:p.tags||[], visibility:p.visibility, createdAt:p.createdAt };
    const canSee = p.visibility==='public' || p.authorId===viewer || (p.allowedUserIds||[]).includes(viewer);
    return canSee ? { ...base, content:p.content } : { ...base, restricted:true };
  });
  res.json(result);
});

app.get('/api/posts/:id/comments', (req,res)=>{ res.json(db.comments.filter(c=>c.postId===req.params.id).map(c=>({...c, author:(uById(c.authorId)||{}).username}))); });
app.post('/api/posts/:id/comments', requireAuth, (req,res)=>{
  const { text } = req.body; if(!text) return res.status(400).json({error:'Empty comment'});
  const comment = { id:uuidv4(), postId:req.params.id, authorId:req.user.id, text, createdAt:new Date().toISOString() };
  db.comments.push(comment); saveDB(); res.json({success:true, comment:{...comment, author:(uById(comment.authorId)||{}).username}});
});

app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server http://localhost:'+PORT));
