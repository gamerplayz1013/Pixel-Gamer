// Pixel Gamer server: zero dependencies, Node 18+.  Run:  PW_SIGMACREATOR67=... PW_CREATORNINJA67=... node server.js
// All game rules run HERE (the same code the game uses), so players can't cheat by editing the page.
const http=require('http'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DATA=process.env.DATA_DIR||path.join(__dirname,'database'),DBF=path.join(DATA,'db.json');
fs.mkdirSync(DATA,{recursive:true});
const OLD=path.join(__dirname,'db.json');if(!fs.existsSync(DBF)&&fs.existsSync(OLD))fs.copyFileSync(OLD,DBF); // move data from the old location
const html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const core=scripts.find(x=>x.includes('Shared by server and browser: cosmetics'));
const lsrc=scripts.find(x=>x.includes('function local(p,b)'));
const a=lsrc.indexOf('const MX='),z=lsrc.indexOf("E('Not found')}",lsrc.indexOf('function local(p,b)'))+15;
if(!core||a<0||z<15)throw new Error('index.html layout not recognised');

// ---------- storage: Firebase Firestore when FIREBASE_SERVICE_ACCOUNT is set, otherwise database/db.json ----------
function fileStore(){let timer=null;
  const write=D=>{try{fs.writeFileSync(DBF+'.tmp',JSON.stringify(D));fs.renameSync(DBF+'.tmp',DBF)}catch(e){console.error('save failed',e.message)}};
  return{name:'file '+DBF,load:async()=>{try{return JSON.parse(fs.readFileSync(DBF,'utf8'))}catch(e){return{}}},
    save:D=>{clearTimeout(timer);timer=setTimeout(()=>write(D),150)},now:async D=>write(D)}}
function firebaseStore(){
  const admin=require('firebase-admin'),raw=process.env.FIREBASE_SERVICE_ACCOUNT.trim();
  let sa;try{sa=JSON.parse(raw)}catch(e){sa=JSON.parse(Buffer.from(raw,'base64').toString('utf8'))}
  admin.initializeApp({credential:admin.credential.cert(sa)});const fsd=admin.firestore(),COLS=['users','sessions','ug','meta'];
  const last=new Map();let busy=false,pending=null,timer=null;
  // every player / session / game is its own document {j: JSON text, o: order}; JSON text avoids Firestore's nested-array limits
  async function load(){const D={users:{},sessions:{}},ugs=[];
    for(const c of COLS){const snap=await fsd.collection(c).get();snap.docs.forEach(d=>{const x=d.data(),v=JSON.parse(x.j);last.set(c+'/'+d.id,x.j+'|'+(x.o==null?'':x.o));
      if(c==='users')D.users[d.id]=v;else if(c==='sessions')D.sessions[d.id]=v;else if(c==='ug')ugs.push([x.o||0,v]);else D[d.id]=v})}
    D.ug=ugs.sort((a,b)=>a[0]-b[0]).map(x=>x[1]);return D}
  const entries=D=>{const m=new Map(),put=(c,id,v,o)=>{if(v!==undefined)m.set(c+'/'+id,{c,id,j:JSON.stringify(v),o})};
    for(const k in D.users)put('users',k,D.users[k]);for(const k in D.sessions)put('sessions',k,D.sessions[k]);
    (D.ug||[]).forEach((g,i)=>put('ug',g.id,g,i));
    for(const k in D)if(!['users','sessions','ug','cur'].includes(k))put('meta',k,D[k]);return m};
  async function flush(D){if(busy){pending=D;return}busy=true;
    try{const cur=entries(D),ops=[];
      cur.forEach((e,k)=>{const sig=e.j+'|'+(e.o==null?'':e.o);if(last.get(k)!==sig)ops.push(['set',e,sig,k])});
      last.forEach((_,k)=>{if(!cur.has(k)){const i=k.indexOf('/');ops.push(['del',{c:k.slice(0,i),id:k.slice(i+1)},null,k])}});
      for(let i=0;i<ops.length;i+=400){const b=fsd.batch();
        ops.slice(i,i+400).forEach(([t,e])=>{const r=fsd.collection(e.c).doc(e.id);t==='set'?b.set(r,e.o==null?{j:e.j}:{j:e.j,o:e.o}):b.delete(r)});await b.commit();
        ops.slice(i,i+400).forEach(([t,e,sig,k])=>t==='set'?last.set(k,sig):last.delete(k))}
    }catch(e){console.error('Firebase save failed:',e.message)}
    finally{busy=false;if(pending){const p=pending;pending=null;flush(p)}}}
  return{name:'Firebase Firestore',load,save:D=>{clearTimeout(timer);timer=setTimeout(()=>flush(D),700)},now:async D=>{clearTimeout(timer);await flush(D)}}}
const store=process.env.FIREBASE_SERVICE_ACCOUNT?firebaseStore():fileStore();
async function main(){
let init=await store.load();if(!init||typeof init!=='object')init={};
if(!init.secret)init.secret=crypto.randomBytes(32).toString('hex');
console.log('Database:',store.name);
const save=D=>store.save(D);
const ctx=vm.createContext({__save:save,__init:init,__hmac:s=>crypto.createHmac('sha256',init.secret).update(String(s)).digest('hex'),console});
const block=lsrc.slice(a,z).replace('const sv=','const sv_x=').replace('const hsh=','const hsh_x=');
vm.runInContext(core+'\nconst Core=globalThis.Core;\nconst hsh=s=>__hmac(s);const sv=()=>__save(D);\n'+block+
'\nObject.assign(D,__init);D.sessions=D.sessions||{};\nfunction __run(p,b,cur){D.cur=cur;const r=local(p,b);return{r,cur:D.cur}}\nfunction __D(){return D}',ctx);
for(const key of ['Kart Smash + Sky Islands','Pixel Rivals (3v3) and Hyper Duel','Bedwars 3D: shared by server'])vm.runInContext(scripts.find(x=>x.includes(key)),ctx);
const D=ctx.__D(),Core=ctx.Core,AR=ctx.Arena,SH=ctx.Shooter,BW=ctx.Bedwars;
for(const sg of ['SIGTERM','SIGINT'])process.on(sg,()=>store.now(D).finally(()=>process.exit(0)));
const run=(p,b,cur)=>{const o=ctx.__run(p,b,cur);return{r:o.r,cur:o.cur}};
// the two original creators are created from secret passwords, so nobody can grab those names
for(const [n,env] of [['SigmaCreator67','PW_SIGMACREATOR67'],['CreatorNinja67','PW_CREATORNINJA67']]){
  if(D.users[n.toLowerCase()])continue;const pw=process.env[env];
  if(!pw||pw.length<8){console.error('Set '+env+' (8+ characters) to create the creator account '+n);process.exit(1)}
  run('signup',{u:n,p:pw},null);console.log('Created creator',n)}
// rate limits (per IP): signups stop free-VIP farming with many accounts
const hits={};const limit=(ip,k,max,ms)=>{const key=ip+k,t=Date.now(),l=(hits[key]=(hits[key]||[]).filter(x=>t-x<ms));if(l.length>=max)return false;l.push(t);return true};
setInterval(()=>{for(const k in hits)if(!hits[k].length)delete hits[k]},6e5).unref();
const send=(res,c,o)=>{res.writeHead(c,{'content-type':'application/json','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(JSON.stringify(o))};

// ---------- real-player matches (Server-Sent Events out, POST inputs in) ----------
const MODES={kart:{sim:AR,max:6,min:4},sky:{sim:AR,max:6,min:4},tdm:{sim:SH,max:6,min:6},duel:{sim:SH,max:2,min:2},bw:{sim:BW,max:6,min:4}};
const FAST=!!process.env.PG_TEST,rooms=new Map(),where=new Map(); // where: user key -> room
const keyOf=tok=>{const k=D.sessions[String(tok||'')],u=k&&D.users[k];return u&&!u.banned?k:null};
const role=u=>u.role==='creator'?2:u.role==='sub'?3:u.role==='admin'?1:0;
const sse=(c,ev,o)=>{try{c.res.write((ev?'event: '+ev+'\n':'')+'data: '+JSON.stringify(o)+'\n\n')}catch(e){}};
const cast=(r,ev,o)=>{r.cl.forEach(c=>c.res&&sse(c,ev,o));r.sp.forEach(c=>c.res&&sse(c,ev,o))};
const watching=new Map(); // spectators: user key -> room
function unwatch(key){const r=watching.get(key);if(!r)return;watching.delete(key);const c=r.sp.get(key);r.sp.delete(key);if(c&&c.res){try{c.res.end()}catch(e){}c.res=null}}
function closeSpec(r){r.sp.forEach((c,k)=>{watching.delete(k);if(c.res){sse(c,'end',{});try{c.res.end()}catch(e){}c.res=null}});r.sp.clear()}
const roomOf=key=>{const r=where.get(key);return r&&r.phase!=='done'?{mode:r.mode,phase:r.phase,full:humans(r)>=r.M.max}:null};
const enrich=o=>{if(o&&o.user&&Array.isArray(o.user.friends))o.user.friends.forEach(f=>{const rm=roomOf(String(f.name).toLowerCase());if(rm){f.room=rm;f.on=true;f.g=rm.mode}});return o};
const humans=r=>r.sim.ps.filter(p=>!p.bot).length;
function leave(key){unwatch(key);const r=where.get(key);if(!r)return;where.delete(key);const c=r.cl.get(key);r.cl.delete(key);if(c&&c.res){try{c.res.end()}catch(e){}c.res=null}
  if(r.phase==='wait')r.sim.ps=r.sim.ps.filter(p=>p.id!==key);else{const p=r.sim.ps.find(p=>p.id===key);if(p)p.bot=true}
  if(!r.cl.size){closeSpec(r);rooms.delete(r.id)}}
function join(req,res,U){
  const key=keyOf(U.searchParams.get('t'));if(!key)return send(res,401,{error:'Please log in.'});
  const u=D.users[key],fr=String(U.searchParams.get('friend')||'').toLowerCase().slice(0,20);
  let mode=U.searchParams.get('mode'),code=(U.searchParams.get('code')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8),r=null,spec=false;
  if(fr){ // join a friend: only mutual friends, into the room they are in; if it already started (or is full) you watch
    const fu=D.users[fr];if(!fu||fu.banned||fr===key||!(fu.friends||[]).includes(key)||!(u.friends||[]).includes(fr))return send(res,403,{error:'You can only join your friends.'});
    const fr_=where.get(fr);if(!fr_||fr_.phase==='done')return send(res,404,{error:'Your friend is not in a match right now.'});
    r=fr_;mode=r.mode;spec=!(r.phase==='wait'&&humans(r)<r.M.max)}
  const M=MODES[mode];if(!M)return send(res,400,{error:'Unknown game'});
  leave(key);
  if(!fr){
    r=[...rooms.values()].find(x=>x.mode===mode&&x.code===code&&x.phase==='wait'&&humans(x)<M.max);
    if(!r&&code&&[...rooms.values()].some(x=>x.mode===mode&&x.code===code))return send(res,409,{error:'Already started'});
    if(!r){r={id:crypto.randomBytes(6).toString('hex'),mode,code,M,sim:M.sim.room(mode),cl:new Map(),sp:new Map(),phase:'wait',wait:FAST?1:code?20:10,cd:3};if(FAST&&process.env.PG_TEST==='quick')r.sim.lim=0;rooms.set(r.id,r)}}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no','x-content-type-options':'nosniff'});res.write(':ok\n\n');
  if(fr)sse({res},'role',{spec,who:D.users[fr].name});
  if(spec){r.sp.set(key,{res,chat:0});watching.set(key,r);
    req.on('close',()=>{if(watching.get(key)===r){const c=r.sp.get(key);if(c&&c.res===res){c.res=null;unwatch(key)}}});
    sse({res},'chat',{sys:1,m:'👀 You are watching '+D.users[fr].name});if(r.sim.log)sse({res},'world',{log:r.sim.log});return}
  const e=Core.eff(u),p={id:key,name:u.name,skin:e.skin,cape:e.cape,hat:e.hat,tag:e.tag,role:role(u),vip:Core.vip(u)};
  if(M.sim===SH)p.hero=U.searchParams.get('hero');
  M.sim.addP(r.sim,p);r.cl.set(key,{res,last:0,chat:0});where.set(key,r);
  req.on('close',()=>{if(where.get(key)===r){const c=r.cl.get(key);if(c&&c.res===res){c.res=null;leave(key)}}});
  cast(r,'chat',{sys:1,m:'👋 '+u.name+' joined'})}
function begin(r){const S=r.sim,cat=Core.CAT,sk=cat.skins.filter(i=>!i.v&&!i.s),cp=cat.capes.filter(i=>!i.v&&!i.s&&i.c),hs=['blaze','boomer','viper','nova'],nm=['Blix','Nova','Zap','Rex','Panda','Tetra'];
  for(let i=0;S.ps.length<r.M.min;i++)r.M.sim.addP(S,{id:'bot'+i,name:nm[i%6]+'Bot',bot:true,skin:sk[(i+1)%sk.length].id,cape:cp[i%cp.length].id,hero:hs[(i+1)%4]});
  r.M.sim.spawn(S);r.phase='count'}
function finish(r){const S=r.sim,n=S.ps.length;
  r.cl.forEach((c,key)=>{const p=S.ps.find(q=>q.id===key);if(!p||p.bot||!c.res)return;let xp,b,ex,st;
    if(r.M.sim===AR){const pl=p.place||1;xp=Math.min(40,pl===1?30:5+(n-pl)*4);b=pl===1?5:1;ex={place:pl};st={w:pl===1?1:0,g:1}}
    else{const w=S.winner===p.team;xp=Math.min(40,(w?30:8)+p.k*2);b=w?6:1;ex={win:w,tie:S.winner<0,k:p.k};st={k:p.k,w:w?1:0,bk:p.k,g:1}}
    try{let o;try{o=run('play',{xp,bucks:b},key).r}catch(e){o=run('me',{},key).r}try{run('stat',{g:r.mode,d:st},key)}catch(e){}sse(c,'reward',Object.assign({user:o.user,xp,b},ex))}catch(e){}});
  setTimeout(()=>{closeSpec(r);r.cl.forEach((c,k)=>{where.delete(k);try{c.res&&c.res.end()}catch(e){}});rooms.delete(r.id)},1500);r.phase='done'}
setInterval(()=>{rooms.forEach(r=>{const S=r.sim;
  if(r.phase==='wait'){r.wait-=.05;S.cd=Math.max(0,r.wait);if(humans(r)>=r.M.max||r.wait<=0)begin(r)}
  else if(r.phase==='count'){r.cd-=.05;S.cd=Math.max(0,r.cd);if(r.cd<=0){S.state='play';r.phase='play'}}
  else if(r.phase==='play'){r.M.sim.step(S,.05);if(S.state==='over')finish(r)}
  if(r.phase!=='done')cast(r,null,r.M.sim.snap(S))})},50);
const clamp=v=>Math.max(-1,Math.min(1,+v||0));
function arenaPost(p,b,tok,ip){const key=keyOf(tok),r=key&&(where.get(key)||watching.get(key));if(!r)throw new Error('Not in a match');const c=r.cl.get(key)||r.sp.get(key),now=Date.now();
  if(p==='arena/chat'){if(now-c.chat<1500)throw new Error('Slow down');c.chat=now;const u=D.users[key],e=Core.eff(u),m=String(b.m||'').replace(/[<>]/g,'').trim().slice(0,80);if(!m)return;
    cast(r,'chat',{n:u.name,m,sk:e.skin,cp:e.cape,ht:e.hat,tg:e.tag,v:+Core.vip(u),r:role(u)});return}
  if(!r.cl.has(key)||now-c.last<30||r.phase!=='play')return;c.last=now;const q=r.sim.ps.find(x=>x.id===key);if(!q)return;
  if(r.M.sim===AR){if(q.alive){q.dx=clamp(b.dx);q.dy=clamp(b.dy);if(b.s)q.smash=1}}
  else if(r.M.sim===BW)BW.input(r.sim,q,b);
  else{q.dx=clamp(b.dx);q.dy=clamp(b.dy);q.f=b.f?1:0;q.a=Number.isFinite(+b.a)&&b.a!==null?+b.a:null;if(b.ab)q.ab=1}}
http.createServer((req,res)=>{
  const ip=(process.env.TRUST_PROXY&&String(req.headers['x-forwarded-for']||'').split(',')[0].trim())||req.socket.remoteAddress||'?';
  if(req.method==='GET'&&(req.url==='/'||req.url.startsWith('/?'))){res.writeHead(200,{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff'});return res.end(html.replace('<script>window.PG_ONLINE=false</script>','<script>window.PG_ONLINE=true;window.PG_API=true</script>'))}
  const U=new URL(req.url,'http://x');if(req.method==='GET'&&U.pathname==='/api/arena/stream'){if(!limit(ip,'sse',30,6e4))return send(res,429,{error:'Slow down.'});return join(req,res,U)}
  const m=req.method==='POST'&&/^\/api\/([\w\/]{1,40})$/.exec(req.url);if(!m)return send(res,404,{error:'Not found'});
  const p=m[1];let body='';req.on('data',c=>{body+=c;if(body.length>4e5){send(res,413,{error:'Too big'});req.destroy()}});
  req.on('end',()=>{try{
    if(p==='arena/input'||p==='arena/chat'){let bb={};try{bb=JSON.parse(body||'{}')}catch(e){}arenaPost(p,bb||{},req.headers['x-token'],ip);return send(res,200,{ok:1})}
    if(!limit(ip,'all',400,6e4))return send(res,429,{error:'Slow down.'});
    if(p==='signup'&&!limit(ip,'su',3,864e5))return send(res,429,{error:'Too many accounts from this network today.'});
    if(p==='login'&&!limit(ip,'li',20,6e5))return send(res,429,{error:'Too many login attempts. Wait a few minutes.'});
    let b={};try{b=JSON.parse(body||'{}')}catch(e){return send(res,400,{error:'Bad request'})}
    const tok=String(req.headers['x-token']||''),cur=D.sessions[tok]||null;
    const {r,cur:nc}=run(p,b&&typeof b==='object'?b:{},cur),out=Object.assign({},r);
    if(p==='signup'||p==='login'){const t=crypto.randomBytes(24).toString('hex');D.sessions[t]=nc;out.token=t;save(D)}
    else if(p==='logout'){delete D.sessions[tok];out.token='';save(D)}
    send(res,200,enrich(out))}catch(e){send(res,400,{error:String(e&&e.message||'Error')})}})
}).listen(PORT,()=>console.log('Pixel Gamer running on port '+PORT));
}
main().catch(e=>{console.error('Startup failed:',e.message);process.exit(1)});
