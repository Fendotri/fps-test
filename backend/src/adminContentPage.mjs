export const buildAdminContentPage = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Content Admin</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#12161d;color:#eef3fb}*{box-sizing:border-box}
.shell{max-width:1200px;margin:0 auto;padding:24px}.bar,.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.panel{background:#19202b;border:1px solid #2a3442;border-radius:14px;padding:16px}.grid{display:grid;grid-template-columns:280px 1fr;gap:16px;margin-top:16px}
input,select,textarea,button{background:#0f141c;color:#eef3fb;border:1px solid #334155;border-radius:10px;padding:10px 12px}
button{cursor:pointer}.list{display:grid;gap:8px;max-height:70vh;overflow:auto}.item{padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#0f141c;cursor:pointer}
.item.active{border-color:#f6b15d;background:#2a1f13}.fields{display:grid;gap:10px}.field{display:grid;gap:6px}.hint{font-size:12px;color:#9fb0c6}
.title{font-size:28px;font-weight:700}.spacer{flex:1}.ok{color:#9ff0b2}.err{color:#ff9f9f}
</style>
</head>
<body>
<div class="shell">
  <div class="bar">
    <div>
      <div class="title">Content Admin</div>
      <div class="hint">Weapons, cases, packs, players, maps</div>
    </div>
    <div class="spacer"></div>
    <input id="adminKey" type="password" placeholder="Admin Key" />
    <button id="loadBtn">Load</button>
    <button id="saveBtn">Save</button>
    <a href="/" style="color:#f6b15d">API Root</a>
  </div>
  <div class="bar" style="margin-top:12px">
    <select id="entityType">
      <option value="weapons">Weapons</option>
      <option value="cases">Cases</option>
      <option value="packs">Packs</option>
      <option value="players">Players</option>
      <option value="maps">Maps</option>
    </select>
    <button id="addBtn">Add</button>
    <button id="cloneBtn">Duplicate</button>
    <button id="deleteBtn">Delete</button>
    <span id="status" class="hint">Ready</span>
  </div>
  <div class="grid">
    <div class="panel">
      <div class="list" id="itemList"></div>
    </div>
    <div class="panel">
      <div class="fields" id="editor"></div>
    </div>
  </div>
</div>
<script>
const state={liveops:null,type:'weapons',selected:''};
const $=id=>document.getElementById(id);
const safe=(v,f='')=>typeof v==='string'?v:(v??f);
const keyOf=item=>safe(item.weaponId||item.id).toLowerCase();
const collectionOf=()=>{const l=state.liveops||{};if(state.type==='weapons')return Array.isArray(l.weaponsCatalog)?l.weaponsCatalog:[];if(state.type==='cases')return Object.values(l.cases||{});if(state.type==='packs')return Array.isArray(l.contentStudio?.packs)?l.contentStudio.packs:[];if(state.type==='players')return Array.isArray(l.contentStudio?.players)?l.contentStudio.players:[];return Array.isArray(l.contentStudio?.maps)?l.contentStudio.maps:[];};
const setStatus=(t,ok=true)=>{const el=$('status');el.textContent=t;el.className=ok?'ok':'err';};
const renderList=()=>{const items=collectionOf();if(items.length&&!items.some(i=>keyOf(i)===state.selected))state.selected=keyOf(items[0]);$('itemList').innerHTML=items.map(i=>'<button class="item '+(keyOf(i)===state.selected?'active':'')+'" data-id="'+keyOf(i)+'">'+safe(i.displayName||i.title||i.weaponId||i.id)+'</button>').join('')||'<div class="hint">No entries</div>';document.querySelectorAll('.item').forEach(b=>b.onclick=()=>{state.selected=b.dataset.id;renderList();renderEditor();});};
const setField=(obj,key,val)=>{obj[key]=val;renderList();renderEditor();};
const fileField=(label,accept,onPick)=>'<div class="field"><label>'+label+'</label><input type="file" accept="'+accept+'" /></div>';
const field=(label,value,key,type='text')=>'<div class="field"><label>'+label+'</label><input data-key="'+key+'" type="'+type+'" value="'+String(value??'').replace(/"/g,'&quot;')+'" /></div>';
const area=(label,value,key)=>'<div class="field"><label>'+label+'</label><textarea data-key="'+key+'" rows="4">'+safe(value)+'</textarea></div>';
const activeItem=()=>collectionOf().find(i=>keyOf(i)===state.selected)||null;
const uploadAsset=async(target,file)=>{const body={target,entityId:safe(activeItem()?.weaponId||activeItem()?.id,'asset'),fileName:file.name,dataBase64:await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>rej(r.error||new Error('read failed'));r.readAsDataURL(file);})};const resp=await fetch('/api/liveops/upload-asset',{method:'POST',headers:{'Content-Type':'application/json','x-admin-key':$('adminKey').value},body:JSON.stringify(body)});const data=await resp.json();if(!resp.ok)throw new Error(data.error||'upload failed');return data.publicPath;};
const renderEditor=()=>{const item=activeItem();if(!item){$('editor').innerHTML='<div class="hint">No item selected</div>';return;} if(state.type==='weapons'){ $('editor').innerHTML=[field('Weapon ID',item.weaponId,'weaponId'),field('Display Name',item.displayName,'displayName'),area('Description',item.description,'description'),field('Category',item.category,'category'),field('Price Coin',item.priceCoin,'priceCoin','number'),field('Rarity',item.rarity,'rarity'),field('Drop Weight',item.dropWeight,'dropWeight','number'),field('Icon Path',item.iconPath,'iconPath'),fileField('Icon File (.png .jpg .jpeg .webp)','.png,.jpg,.jpeg,.webp'),field('Model Path',item.modelPath,'modelPath'),fileField('Model File (.glb .gltf .fbx .obj)','.glb,.gltf,.fbx,.obj'),field('Slot',item.slot,'slot'),field('Placeholder Rig',item.placeholderRig,'placeholderRig'),field('Damage',item.stats?.damage,'stats.damage','number'),field('RPM',item.stats?.rpm,'stats.rpm','number'),field('Magazine',item.stats?.magazine,'stats.magazine','number'),field('Reserve',item.stats?.reserve,'stats.reserve','number'),field('Speed',item.stats?.speed,'stats.speed','number'),field('Classification',item.stats?.classification,'stats.classification')].join('')+(item.iconPath?'<div class="field"><label>Icon Preview</label><img src="'+item.iconPath+'" style="max-width:240px;border-radius:12px;border:1px solid #334155" /></div>':'<div class="hint">No icon assigned</div>');} else { $('editor').innerHTML=[field('ID',item.id,'id'),field('Title',item.title,'title'),area('Description',item.description,'description'),area('Raw JSON',JSON.stringify(item,null,2),'__json')].join(''); }
 document.querySelectorAll('#editor [data-key]').forEach(el=>{el.onchange=()=>{const i=activeItem();const key=el.dataset.key; if(key==='__json'){try{const parsed=JSON.parse(el.value);Object.keys(i).forEach(k=>delete i[k]);Object.assign(i,parsed);}catch(err){setStatus('Invalid JSON',false);return;}} else if(key.startsWith('stats.')){if(!i.stats)i.stats={}; const k=key.split('.')[1]; i.stats[k]=el.type==='number'?Number(el.value)||0:el.value;} else {i[key]=el.type==='number'?Number(el.value)||0:el.value;} renderList();};});
 const fileInputs=$('#editor').querySelectorAll('input[type=file]'); if(fileInputs[0]) fileInputs[0].onchange=async e=>{const f=e.target.files&&e.target.files[0]; if(!f)return; try{activeItem().iconPath=await uploadAsset('weapon-icon',f); renderEditor(); setStatus('Icon uploaded');}catch(err){setStatus(err.message||'upload failed',false);} }; if(fileInputs[1]) fileInputs[1].onchange=async e=>{const f=e.target.files&&e.target.files[0]; if(!f)return; try{activeItem().modelPath=await uploadAsset('weapon-model',f); renderEditor(); setStatus('Model uploaded');}catch(err){setStatus(err.message||'upload failed',false);} };
};
const ensureContainers=()=>{if(!state.liveops.contentStudio)state.liveops.contentStudio={packs:[],players:[],maps:[]};if(!state.liveops.cases)state.liveops.cases={};};
const load=async()=>{const resp=await fetch('/api/liveops/config',{headers:{'x-admin-key':$('adminKey').value}});const data=await resp.json();if(!resp.ok)throw new Error(data.error||'load failed');state.liveops=data.liveops;ensureContainers();renderList();renderEditor();};
const save=async()=>{const resp=await fetch('/api/liveops/config',{method:'PUT',headers:{'Content-Type':'application/json','x-admin-key':$('adminKey').value},body:JSON.stringify(state.liveops)});const data=await resp.json();if(!resp.ok)throw new Error(data.error||'save failed');state.liveops=data.liveops;ensureContainers();renderList();renderEditor();};
const add=()=>{ensureContainers();if(state.type==='weapons'){state.liveops.weaponsCatalog.push({weaponId:'weapon_'+Math.random().toString(36).slice(2,6),displayName:'New Weapon',description:'',category:'Custom',priceCoin:0,rarity:'milspec',dropWeight:10,iconPath:'',modelPath:'',enabled:true,slot:'primary',placeholderRig:'ak',stats:{damage:30,fireRate:0.1,rpm:600,magazine:30,reserve:90,speed:220,classification:'rifle'}});} else if(state.type==='cases'){const id='case_'+Math.random().toString(36).slice(2,6);state.liveops.cases[id]={id,title:'New Case',description:'',offerId:'offer_'+id,openPriceCoin:180,priceCoin:180,enabled:true,drops:[]};} else {const bucket=state.liveops.contentStudio[state.type];bucket.push({id:state.type.slice(0,-1)+'_'+Math.random().toString(36).slice(2,6),title:'New Entry',description:'',enabled:true});} renderList(); renderEditor();};
const dup=()=>{const item=activeItem();if(!item)return;const copy=JSON.parse(JSON.stringify(item));if(state.type==='weapons'){copy.weaponId='weapon_'+Math.random().toString(36).slice(2,6);copy.displayName+=(copy.displayName?' Copy':'');state.liveops.weaponsCatalog.push(copy);} else if(state.type==='cases'){const id='case_'+Math.random().toString(36).slice(2,6);copy.id=id;copy.offerId='offer_'+id;copy.title+=(copy.title?' Copy':'');state.liveops.cases[id]=copy;} else {copy.id=state.type.slice(0,-1)+'_'+Math.random().toString(36).slice(2,6);copy.title+=(copy.title?' Copy':'');state.liveops.contentStudio[state.type].push(copy);} renderList(); renderEditor();};
const del=()=>{if(!state.selected)return; if(state.type==='weapons')state.liveops.weaponsCatalog=state.liveops.weaponsCatalog.filter(i=>keyOf(i)!==state.selected); else if(state.type==='cases'){delete state.liveops.cases[state.selected];} else {state.liveops.contentStudio[state.type]=state.liveops.contentStudio[state.type].filter(i=>keyOf(i)!==state.selected);} state.selected=''; renderList(); renderEditor();};
$('entityType').onchange=e=>{state.type=e.target.value;renderList();renderEditor();};
$('loadBtn').onclick=async()=>{try{await load();setStatus('Loaded');}catch(err){setStatus(err.message||'load failed',false);}};
$('saveBtn').onclick=async()=>{try{await save();setStatus('Saved');}catch(err){setStatus(err.message||'save failed',false);}};
$('addBtn').onclick=add;$('cloneBtn').onclick=dup;$('deleteBtn').onclick=del;
setStatus('Enter admin key and load');
</script>
</body></html>`;
