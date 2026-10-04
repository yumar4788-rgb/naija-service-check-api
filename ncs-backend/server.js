// Naija Service Check API – zero dependencies. Node 18+.
const http=require('http'),fs=require('fs'),path=require('path'),{URL}=require('url');
const PORT=process.env.PORT||3000, ORIGIN=process.env.ALLOWED_ORIGIN||'*', ADMIN_KEY=process.env.ADMIN_KEY||'';
const STALE_DAYS=+process.env.STALE_DAYS||180, DIR=path.join(__dirname,'data');
const COLL=['organisations','nafdac','domains','warnings'];
const load=n=>JSON.parse(fs.readFileSync(path.join(DIR,n+'.json'),'utf8'));
const save=(n,d)=>fs.writeFileSync(path.join(DIR,n+'.json'),JSON.stringify(d,null,1));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const fmt=d=>{const x=new Date(d);return isNaN(x)?'unknown':x.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
const stale=d=>(Date.now()-new Date(d))/864e5>STALE_DAYS;
const today=()=>fmt(new Date());
const host=s=>{try{return new URL(/^https?:/i.test(s)?s:'http://'+s).hostname.replace(/^www\./,'').toLowerCase()}catch{return''}};
const urlIn=t=>(String(t).match(/(https?:\/\/[^\s]+|\b[a-z0-9-]+(\.[a-z0-9-]+)+\/?\S*)/i)||[])[0]||'';
const warnFor=t=>{const n=norm(t),h=host(urlIn(t)||t);return load('warnings').find(w=>(w.match||[]).some(m=>n.includes(norm(m))||(h&&h===m.toLowerCase())))};
const warnRes=(claim,w)=>({status:'r',claim,source:{name:w.org,url:w.url},lastChecked:fmt(w.date),matches:[],mismatches:['An official warning matches this claim'],summary:w.issue+'. Do not pay or share personal information.'});
const unable=(claim,why)=>({status:'o',claim,lastChecked:today(),matches:[],mismatches:[],summary:why||'We could not find enough authoritative evidence. This does not automatically mean it is fake.'});

function company(q,id){
  const n=norm(q),rows=load('organisations');
  let m=rows.filter(r=>norm(r.name)===n||norm(r.rc)===n||norm(r.name).includes(n));
  if(id)m=m.filter(r=>norm(r.rc)===norm(id));
  if(!m.length)return unable(q);
  if(m.length>1)return{candidates:m.map(r=>({id:r.rc,label:`${r.name}, ${r.state} (${r.rc})`}))};
  const r=m[0];
  return{status:'b',claim:q,source:{name:r.source,url:r.url},lastChecked:fmt(r.checked),stale:stale(r.checked),
    fields:{'Organisation':r.name,'Registration number':r.rc,'State':r.state,'Status':r.status},matches:['Name or registration number found in our verified records'],mismatches:[],
    summary:'A matching record exists. It does not prove that every job, website, product or claim from this organisation is genuine.'};
}
function nafdac(q,id){
  const n=norm(q),rows=load('nafdac'),w=warnFor(q);
  const m=rows.find(r=>norm(r.number)===n||norm(r.number)===norm(id));
  if(w&&!m)return warnRes(q,w);
  if(!m)return unable(q,'No matching NAFDAC registration number in our records. Check the NAFDAC Greenbook yourself. Not found does not automatically mean fake.');
  return{status:'b',claim:q,source:{name:m.source,url:m.url},lastChecked:fmt(m.checked),stale:stale(m.checked),
    fields:{'Product':m.name,'Registration number':m.number,'Category':m.category,'Applicant':m.applicant,'Status':m.status},matches:['Registration number found'],mismatches:[],
    summary:'A matching number does not prove that your physical pack is genuine. Compare every detail on the pack with this record.'};
}
function site(q){
  const h=host(q),w=warnFor(q);
  if(w)return warnRes(q,w);
  if(!h)return unable(q,'That does not look like a website address.');
  const d=load('domains').find(x=>h===x.domain||h.endsWith('.'+x.domain));
  if(d)return{status:'g',claim:q,source:{name:d.org,url:d.url},lastChecked:fmt(d.checked),stale:stale(d.checked),matches:['Domain matches the organisation\'s recorded official domain: '+d.domain],mismatches:[],summary:'This domain is recorded as official for '+d.org+'. Still reach it from the organisation\'s own channels.'};
  const look=load('domains').find(x=>norm(h).includes(norm(x.org).split(' ')[0])&&norm(x.org).split(' ')[0].length>3);
  if(look)return{status:'y',claim:q,source:{name:look.org,url:look.url},lastChecked:fmt(look.checked),matches:[],mismatches:['Domain does not match the official domain '+look.domain],summary:'This address resembles '+look.org+' but is not its recorded official domain. Do not submit personal or payment information.'};
  return unable(q);
}
function job(q){
  const w=warnFor(q);if(w)return warnRes(q,w);
  const pay=/(pay|payment|fee|deposit|transfer|registration fee|processing fee|send money)/i.test(q);
  const sens=/(bvn|nin|otp|password|card)/i.test(q);
  const u=urlIn(q),s=u?site(u):null;
  const mism=[];if(pay)mism.push('The message mentions payment. Genuine recruiters do not charge applicants.');if(sens)mism.push('It asks for sensitive details (NIN, BVN, OTP, password or card).');
  if(s&&s.status==='g'&&!pay)return{...s,claim:q,summary:'The link goes to a recorded official domain. Confirm the vacancy itself on the organisation\'s careers page.'};
  return{status:pay?'y':'o',claim:q,lastChecked:today(),matches:s&&s.status==='g'?['Link uses an official domain']:[],mismatches:mism,summary:pay?'Red flags found. Do not pay. Check the vacancy on the organisation\'s own website.':'We could not confirm this vacancy from an authoritative source. Check the employer\'s official careers page.'};
}
const H={company,reg:company,nafdac,site,job};

function send(res,c,o){res.writeHead(c,{'Content-Type':'application/json','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Content-Type,x-api-key,x-admin-name','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});res.end(JSON.stringify(o))}
http.createServer((req,res)=>{
  if(req.method==='OPTIONS')return send(res,204,{});
  const u=new URL(req.url,'http://x'),p=u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
  try{
    if(p[0]==='health')return send(res,200,{ok:true});
    if(p[0]==='v1'&&p[1]==='verify'&&H[p[2]]&&req.method==='GET'){
      const q=(u.searchParams.get('q')||'').trim().slice(0,500);
      if(!q)return send(res,400,{error:'missing q'});
      const r=H[p[2]](q,u.searchParams.get('id'));
      console.log(JSON.stringify({t:new Date().toISOString(),type:p[2],q,status:r.status||(r.candidates?'ambiguous':'?')}));
      return send(res,200,r);
    }
    if(p[0]==='v1'&&p[1]==='admin'){
      if(!ADMIN_KEY||req.headers['x-api-key']!==ADMIN_KEY)return send(res,401,{error:'unauthorised'});
      const who=String(req.headers['x-admin-name']||'admin').slice(0,60),c=p[2];
      const log=(act,coll,rec)=>{let a=[];try{a=load('audit')}catch{}a.unshift({time:new Date().toISOString(),by:who,action:act,collection:coll,record:rec});save('audit',a.slice(0,500))};
      if(c==='audit'&&req.method==='GET'){let a=[];try{a=load('audit')}catch{}return send(res,200,a)}
      if(c==='summary'&&req.method==='GET'){const o={};COLL.forEach(k=>{const d=load(k);o[k]={total:d.length,stale:d.filter(r=>r.checked&&stale(r.checked)).length}});return send(res,200,o)}
      if(!COLL.includes(c))return send(res,404,{error:'unknown collection'});
      if(req.method==='GET')return send(res,200,load(c));
      let b='';req.on('data',x=>{b+=x;if(b.length>1e5)req.destroy()});
      return req.on('end',()=>{try{
        const d=load(c),i=p[3]!==undefined?+p[3]:-1;
        if(req.method==='POST'&&p[3]==='bulk'){const arr=JSON.parse(b);if(!Array.isArray(arr)||arr.length>2000)return send(res,400,{error:'send a list of up to 2000 records'});
          const K={organisations:r=>norm(r.name+r.rc),nafdac:r=>norm(r.number),domains:r=>norm(r.domain),warnings:r=>norm(r.org+r.issue)},key=K[c],seen=new Set(d.map(key));let added=0,skipped=0;
          arr.forEach(r=>{if(!r||typeof r!=='object'||!key(r).trim()||seen.has(key(r))){skipped++;return}seen.add(key(r));r.checkedBy=who;d.push(r);added++});
          save(c,d);log('bulk import ('+added+' added, '+skipped+' skipped)',c,'CSV');return send(res,201,{ok:true,added,skipped})}
        if(req.method==='POST'){const r=JSON.parse(b);r.checkedBy=who;d.push(r);save(c,d);log('add',c,r.name||r.number||r.domain||r.org);return send(res,201,{ok:true,count:d.length})}
        if(!(i>=0&&i<d.length))return send(res,404,{error:'no such record'});
        if(req.method==='PUT'){const r=JSON.parse(b);r.checkedBy=who;d[i]=r;save(c,d);log('edit',c,r.name||r.number||r.domain||r.org);return send(res,200,{ok:true})}
        if(req.method==='DELETE'){const r=d.splice(i,1)[0];save(c,d);log('delete',c,r.name||r.number||r.domain||r.org);return send(res,200,{ok:true})}
        send(res,405,{error:'method'})}catch{send(res,400,{error:'bad request'})}});
    }
    send(res,404,{error:'not found'});
  }catch(e){console.error(e);send(res,500,{error:'unavailable'})}
}).listen(PORT,()=>console.log('API on '+PORT));
