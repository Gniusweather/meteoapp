/* Lazy-load Leaflet only when a map tab needs it */
window.__leafletLoading=null;
window.ensureLeaflet=function(){
  if(typeof L!=='undefined') return Promise.resolve();
  if(window.__leafletLoading) return window.__leafletLoading;
  window.__leafletLoading=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.crossOrigin='';
    s.onload=function(){resolve();};
    s.onerror=function(){window.__leafletLoading=null;reject(new Error('Leaflet load failed'));};
    document.head.appendChild(s);
  });
  return window.__leafletLoading;
};


(function(){
'use strict';

/* ── CONSTANTS ── */
var STATIONS=['TNCA','TNCB','TNCC','TNCM','SVMI','SVVA'];
var SPECI_ICAOS=['TNCA','TNCB','TNCC'];
var AWC_METAR='https://aviationweather.gov/api/data/metar?ids={IDS}&format=raw&hours=2';
var ICAO_FLAGS={TNCA:'🇦🇼',TNCB:'🇧🇶',TNCC:'🇨🇼',TNCM:'🇸🇽',SVMI:'🇻🇪',SVVA:'🇻🇪'};
var ICAO_NAMES={TNCA:'Beatrix · Aruba',TNCB:'Flamingo · Bonaire',TNCC:'Hato · Curaçao',TNCM:'Juliana · St Maarten',SVMI:'Simón Bolívar · VE',SVVA:'Michelena · VE'};
var TAF_ICAOS=['TNCA','TNCB','TNCC'];
var METAR_TPL='https://tgftp.nws.noaa.gov/data/observations/metar/stations/{ICAO}.TXT';
var TAF_TPL='https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/{ICAO}.TXT';
var KNMI_URL='https://www.knmidc.org/weather/bonaire/?Current';
var KNMI_FC='https://www.knmidc.org/weather/bonaire/?Forecast';
var KNMI_MAR='https://www.knmidc.org/weather/bonaire/?Marine';
// Multi-model consensus (Open-Meteo) — Curaçao / Bonaire area
var OM_FC='https://api.open-meteo.com/v1/forecast?latitude=12.15&longitude=-68.98&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&models=gfs_seamless,icon_seamless,ecmwf_ifs025,knmi_seamless,meteofrance_seamless&forecast_days=5&timezone=America%2FCuracao';
var OM_MAR='https://marine-api.open-meteo.com/v1/marine?latitude=12.15&longitude=-68.28&daily=wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max,wind_wave_height_max&forecast_days=5&timezone=America%2FCuracao';
var NHC_SURFACE='https://www.nhc.noaa.gov/tafb_latest/USA_latest.gif';
var METAR_MS=45000, VIS_MS=90000, TIMEOUT_MS=7000;

function refreshNhcChart(){
  const img=document.getElementById('wx-nhc-chart');
  if(!img) return;
  const wrap=img.closest('.wx-chart-wrap');
  if(wrap) wrap.classList.remove('fail');
  // cache-bust so ↻ loads the latest analysis
  img.src=NHC_SURFACE+(NHC_SURFACE.indexOf('?')>=0?'&':'?')+'t='+Date.now();
}
function nhcCrop(mode){
  const wrap=document.getElementById('wx-chart-wrap');
  if(!wrap) return;
  wrap.classList.remove('crop-carib','crop-wide','crop-full');
  wrap.classList.add(mode==='full'?'crop-full':(mode==='wide'?'crop-wide':'crop-carib'));
  ['carib','wide','full'].forEach(function(m){
    const b=document.getElementById('nhc-btn-'+m);
    if(b) b.classList.toggle('active', m===(mode||'carib'));
  });
}
window.nhcCrop=nhcCrop;

/* ── HELPERS ── */
var $=id=>document.getElementById(id);
var pad=n=>n<10?'0'+n:''+n;
function escHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function nowStamp(){const d=new Date();return`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}

/* ── CLOCKS (full date + time, local & UTC) ── */
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDateLocal(d){
  return `${DOW[d.getDay()]} ${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateUTC(d){
  return `${DOW[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function tickClocks(){
  const d=new Date();
  const lc=$('local-clock'), uc=$('utc-clock');
  const ld=$('local-date'), ud=$('utc-date');
  if(lc) lc.textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if(uc) uc.textContent=`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
  if(ld) ld.textContent=fmtDateLocal(d);
  if(ud) ud.textContent=fmtDateUTC(d)+' UTC';
}
tickClocks();
setInterval(tickClocks,1000);

/* ── AUDIO ── */
var mute=false, _actx=null;
function getCtx(){if(_actx)return _actx;try{_actx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}return _actx;}
function beep(freq,dur,vol){
  if(mute)return;
  const ctx=getCtx();if(!ctx)return;
  try{
    if(ctx.state==='suspended')ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.frequency.value=freq;g.gain.value=vol||0.04;
    o.connect(g);g.connect(ctx.destination);
    o.start();o.stop(ctx.currentTime+(dur||0.1));
  }catch(e){}
}
function playBeep(){beep(880,0.1,0.015);}
function playCriticalAlarm(){
  if(mute)return;
  const ctx=getCtx();if(!ctx)return;
  try{
    if(ctx.state==='suspended')ctx.resume();
    const now=ctx.currentTime,g=ctx.createGain();
    g.gain.value=0.05;g.connect(ctx.destination);
    [0,0.35,0.7].forEach(t=>{
      const o=ctx.createOscillator();o.type='sawtooth';
      o.frequency.setValueAtTime(520,now+t);
      o.frequency.exponentialRampToValueAtTime(1100,now+t+0.25);
      o.connect(g);o.start(now+t);o.stop(now+t+0.28);
    });
  }catch(e){}
}
function playSpeciAlarm(){
  if(mute)return;
  const ctx=getCtx();if(!ctx)return;
  try{
    if(ctx.state==='suspended')ctx.resume();
    const now=ctx.currentTime;
    [0,0.4,0.8].forEach(t=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='square';g.gain.value=0.05;
      o.connect(g);g.connect(ctx.destination);
      o.frequency.setValueAtTime(900,now+t);
      o.frequency.linearRampToValueAtTime(1400,now+t+0.12);
      o.frequency.linearRampToValueAtTime(900,now+t+0.24);
      o.start(now+t);o.stop(now+t+0.27);
    });
  }catch(e){}
}

/* ── FETCH ── */
async function fetchTimeout(url){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{const r=await fetch(url,{cache:'no-store',signal:ctrl.signal});clearTimeout(id);return r;}
  catch(e){clearTimeout(id);throw e;}
}
// Ordered list of ways to fetch a URL: custom proxy (if set), direct, then public CORS proxies.
var PROXY_LS_KEY='rwcapp_cors_proxy';
var sourceHealth={};
window.__sourceHealth=sourceHealth;

function loadProxyConfig(){
  try{
    const s=localStorage.getItem(PROXY_LS_KEY);
    // First run: enable a public proxy so METAR works from mobile / file hosts
    if(!s){
      const def={url:'https://api.allorigins.win/raw?url={url}',type:'raw'};
      try{localStorage.setItem(PROXY_LS_KEY,JSON.stringify(def));}catch(e){}
      return def;
    }
    const o=JSON.parse(s);
    return {url:(o&&o.url)||'', type:(o&&o.type)==='allorigins'?'allorigins':'raw'};
  }catch(e){return {url:'https://api.allorigins.win/raw?url={url}',type:'raw'};}
}
function saveProxyConfig(cfg){
  try{localStorage.setItem(PROXY_LS_KEY,JSON.stringify(cfg||{url:'',type:'raw'}));}catch(e){}
}

function getFetchSources(){
  const cfg=loadProxyConfig();
  const list=[];
  // User-configured proxy first (highest priority)
  if(cfg.url&&cfg.url.indexOf('{url}')>=0){
    list.push({
      name:'custom',
      build:u=>cfg.url.replace(/\{url\}/g,encodeURIComponent(u)).replace(/\{url_raw\}/g,u),
      extract:async r=>{
        if(cfg.type==='allorigins'){
          const j=await r.json();
          return j&&j.contents&&String(j.contents).trim();
        }
        const t=await r.text();
        return t&&t.trim();
      }
    });
  }
  list.push(
    {name:'direct', build:u=>u, extract:async r=>{const t=await r.text();return t&&t.trim();}},
    {name:'allorigins-raw', build:u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u), extract:async r=>{const t=await r.text();return t&&t.trim();}},
    {name:'allorigins', build:u=>'https://api.allorigins.win/get?url='+encodeURIComponent(u), extract:async r=>{const j=await r.json();return j&&j.contents&&j.contents.trim();}},
    {name:'corsproxy', build:u=>'https://corsproxy.io/?url='+encodeURIComponent(u), extract:async r=>{const t=await r.text();return t&&t.trim();}},
    {name:'jina', build:u=>'https://r.jina.ai/'+u, extract:async r=>{const t=await r.text();return t&&t.trim();}}
  );
  list.forEach(s=>{if(!sourceHealth[s.name]) sourceHealth[s.name]={ok:0,fail:0,last:null};});
  return list;
}

function looksLikeFetchError(text){
  if(!text) return true;
  const t=String(text).trim();
  if(t.length<8) return true;
  // Proxy / gateway error bodies
  if(/^\s*\{\s*"error"\s*:/i.test(t)) return true;
  if(/A valid API key is required/i.test(t)) return true;
  if(/^\s*<!DOCTYPE html/i.test(t)&&t.length<800&&!/\bMETAR\b|\bAAXX\b|\bTAF\b/i.test(t)) return true;
  return false;
}
async function robustFetch(url){
  const sources=getFetchSources();
  for(const src of sources){
    try{
      const r=await fetchTimeout(src.build(url));
      // A genuine "not found" from the direct source is permanent — don't keep retrying proxies.
      if(src.name==='direct'&&r&&(r.status===404||r.status===410)){return{ok:false,permanent:true};}
      if(r&&r.ok){
        const text=await src.extract(r);
        if(text&&!looksLikeFetchError(text)){
          sourceHealth[src.name].ok++;sourceHealth[src.name].last=Date.now();
          return{ok:true,text,via:src.name};
        }
      }
    }catch(e){}
    if(sourceHealth[src.name]) sourceHealth[src.name].fail++;
  }
  return{ok:false};
}
async function fetchRetry(url,n=1){
  // Single pass over proxy list (each source tried once) — faster than multi-round
  for(let i=0;i<n;i++){
    const o=await robustFetch(url);
    if(o.ok||o.permanent)return o;
    if(i<n-1)await new Promise(r=>setTimeout(r,250*(i+1)));
  }
  return{ok:false};
}

/** Pull a JSON object from a response body (handles BOM / proxy wrappers). */
function extractJson(text){
  if(!text) return null;
  var s=String(text).replace(/^\uFEFF/,'').trim();
  try{return JSON.parse(s);}catch(e){}
  var a=s.indexOf('{'), b=s.lastIndexOf('}');
  if(a>=0&&b>a){
    try{return JSON.parse(s.slice(a,b+1));}catch(e){}
  }
  return null;
}

/**
 * Fetch JSON preferring direct access for CORS-friendly hosts (Open-Meteo).
 * Proxies often garble JSON; only use them if direct fails.
 */
async function fetchJson(url){
  // 1) Direct
  try{
    const r=await fetchTimeout(url);
    if(r&&r.ok){
      const t=await r.text();
      const j=extractJson(t);
      if(j&&!j.error) return {ok:true,json:j,text:t,via:'direct'};
    }
  }catch(e){}
  // 2) Proxies via robustFetch
  const out=await fetchRetry(url);
  if(!out.ok||!out.text) return {ok:false};
  const j=extractJson(out.text);
  if(j&&!j.error) return {ok:true,json:j,text:out.text,via:out.via||'proxy'};
  return {ok:false};
}

/* ── CORS proxy settings UI ── */
function openProxySettings(){
  const modal=$('proxy-modal');if(!modal)return;
  const cfg=loadProxyConfig();
  const urlEl=$('proxy-url'), typeEl=$('proxy-type'), st=$('proxy-status');
  if(urlEl) urlEl.value=cfg.url||'';
  if(typeEl) typeEl.value=cfg.type||'raw';
  if(st){
    st.className='proxy-status';
    st.textContent=cfg.url
      ?('Active custom proxy:\n'+cfg.url+' ('+cfg.type+')')
      :'No custom proxy — using built-in: custom? → direct → allorigins → corsproxy → jina';
  }
  modal.style.display='flex';
  modal.setAttribute('aria-hidden','false');
}
function closeProxySettings(){
  const modal=$('proxy-modal');if(!modal)return;
  modal.style.display='none';
  modal.setAttribute('aria-hidden','true');
}
function saveProxySettings(){
  const url=($('proxy-url')&&$('proxy-url').value||'').trim();
  const type=($('proxy-type')&&$('proxy-type').value)||'raw';
  if(url&&url.indexOf('{url}')<0){
    const st=$('proxy-status');
    if(st){st.className='proxy-status err';st.textContent='Template must include {url} — e.g. https://corsproxy.io/?url={url}';}
    return;
  }
  saveProxyConfig({url,type});
  const st=$('proxy-status');
  if(st){st.className='proxy-status ok';st.textContent=url?'Saved. Custom proxy will be tried first.':'Saved. Using built-in proxies only.';}
  // Refresh data with new path
  setTimeout(()=>{closeProxySettings();if(typeof refreshAllMetars==='function')refreshAllMetars();},400);
}
function clearProxySettings(){
  saveProxyConfig({url:'',type:'raw'});
  if($('proxy-url')) $('proxy-url').value='';
  if($('proxy-type')) $('proxy-type').value='raw';
  const st=$('proxy-status');
  if(st){st.className='proxy-status';st.textContent='Cleared. Built-in proxies only.';}
}
async function testProxySettings(){
  const url=($('proxy-url')&&$('proxy-url').value||'').trim();
  const type=($('proxy-type')&&$('proxy-type').value)||'raw';
  const st=$('proxy-status');
  if(!url){if(st){st.className='proxy-status err';st.textContent='Enter a proxy template first (or pick a preset).';}return;}
  if(url.indexOf('{url}')<0){if(st){st.className='proxy-status err';st.textContent='Template must include {url}';}return;}
  if(st){st.className='proxy-status';st.textContent='Testing proxy…';}
  const target='https://tgftp.nws.noaa.gov/data/observations/metar/stations/TNCC.TXT';
  try{
    const built=url.replace(/\{url\}/g,encodeURIComponent(target)).replace(/\{url_raw\}/g,target);
    const r=await fetch(built,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    let text='';
    if(type==='allorigins'){const j=await r.json();text=(j&&j.contents)||'';}
    else text=await r.text();
    text=(text||'').trim();
    if(!text||text.length<10) throw new Error('Empty body');
    const ok=/TNCC|METAR|SPECI/.test(text);
    if(st){
      st.className='proxy-status '+(ok?'ok':'err');
      st.textContent=(ok?'OK — got METAR data via proxy.':'Got a response but it does not look like a METAR.\n')+text.slice(0,160).replace(/\s+/g,' ');
    }
  }catch(e){
    if(st){st.className='proxy-status err';st.textContent='Test failed: '+(e&&e.message||e);}
  }
}
window.openProxySettings=openProxySettings;
window.closeProxySettings=closeProxySettings;
window.saveProxySettings=saveProxySettings;
window.clearProxySettings=clearProxySettings;
window.testProxySettings=testProxySettings;

// Preset buttons
document.addEventListener('click',function(ev){
  const b=ev.target&&ev.target.closest&&ev.target.closest('.proxy-preset');
  if(!b) return;
  const url=b.getAttribute('data-url')||'';
  const type=b.getAttribute('data-type')||'raw';
  if($('proxy-url')) $('proxy-url').value=url;
  if($('proxy-type')) $('proxy-type').value=type;
});
// Close modal on backdrop click
document.addEventListener('click',function(ev){
  const m=$('proxy-modal');
  if(m&&ev.target===m) closeProxySettings();
});

/* ── CACHE (instant load from last good data) ── */
var LS='rwc1_', CACHE_MAX=3*3600*1000; // keep ~3h
function cacheSet(k,v){try{localStorage.setItem(LS+k,JSON.stringify({t:Date.now(),v}));}catch(e){}}
function cacheGet(k){try{const s=localStorage.getItem(LS+k);if(!s)return null;const o=JSON.parse(s);if(Date.now()-o.t>CACHE_MAX)return null;return o.v;}catch(e){return null;}}

/* ── VIS (KNMI Bonaire) ── */
function extractVis(text){
  if(!text)return null;
  const s=String(text).replace(/\u00A0/g,' ').replace(/\s+/g,' ');
  let m=s.match(/Visibility[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)\s*km/i);
  if(m)return{m:Math.round(parseFloat(m[1])*1000)};
  m=s.match(/Visibility[^0-9]{0,30}([0-9]+)\s*m/i);
  if(m)return{m:parseInt(m[1])};
  return null;
}
function paintVis(km){
  const dot=$('vis-dot'), val=$('vis-value');
  if(val)val.textContent=km>=1000?`${(km/1000).toFixed(1)} km`:`${km} m`;
  if(dot){
    dot.className='vis-dot';
    if(km<2000)dot.classList.add('low');
    else if(km<8000)dot.classList.add('warn');
  }
}
async function updateVis(){
  const out=await fetchRetry(KNMI_URL);
  if(!out.ok){if(!cacheGet('vis')){const v=$('vis-value');if(v)v.textContent='—';}return;}
  const r=extractVis(out.text);
  if(!r){if(!cacheGet('vis')){const v=$('vis-value');if(v)v.textContent='—';}return;}
  cacheSet('vis',r.m);
  paintVis(r.m);
}

/* ── METAR PARSE ── */
function cleanMetar(s){
  return String(s||'')
    .replace(/^(?:METAR|SPECI)\s+/i,'')
    .replace(/\sRMK[\s\S]*/i,'')
    .replace(/\s(?:TEMPO|BECMG|PROB\d{2}|FM\d{6})[\s\S]*/i,'')
    .replace(/\bAUTO\b|\bCOR\b/gi,'')
    .trim();
}
function parseMetar(raw){
  const cl=cleanMetar(raw),tok=cl.split(/\s+/).filter(Boolean);
  const time=(tok.find(x=>/^\d{6}Z$/.test(x))||tok[1]||'--');
  const wb=tok.find(x=>/^(?:VRB|\d{3})\d{2}(?:G\d{2,3})?KT$/.test(x))||'/////KT';
  const vd=tok.find(x=>/^\d{3}V\d{3}$/.test(x));
  const wind=vd?`${wb} ${vd}`:wb;
  const vt=tok.filter(x=>/^\d{4}(?:[NSEW]{1,2})?$/.test(x));
  const vis=vt.length?vt[0]:'--';
  const visMin=vt.length?Math.min(...vt.map(v=>parseInt(v)).filter(n=>!isNaN(n))):NaN;
  const wx=tok.filter(x=>/^(?:\+|-)?(?:VC)?(?:TS|VCTS|VCSH|TSRA|SH|SHRA|RA|DZ|SN|FG|BR|HZ|SQ|PO)/.test(x)).join(' ')||'--';
  const cldM=cl.match(/((?:FEW|SCT|BKN|OVC)(?:\d{3}|\/{3})(?:TCU|CB)?)/gi)||[];
  const cld=cldM.join(' ')||'--';
  const td=tok.find(x=>/^M?\d{2}\/M?\d{2}$/.test(x))||'--';
  const qp=tok.find(x=>/^Q\d{4}$/.test(x));
  let qnh='—';
  if(qp){const h=qp.slice(1);qnh=`${h} / ${(parseInt(h)*0.029529983).toFixed(2)}`;}
  const gm=wb.match(/G(\d{2,3})/);const gust=gm?+gm[1]:0;
  let age=0;
  if(/^\d{6}Z$/.test(time)){
    const now=new Date(),dd=+time.slice(0,2),hh=+time.slice(2,4),mm=+time.slice(4,6);
    age=(Date.now()-Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),dd,hh,mm))/60000;
  }
  return{time,wind,windBase:wb,vis,visMin,wx,cld,td,qnh,gust,age,raw:cl};
}
function isWxCrit(wx){return/\b(?:VCTS|VCSH|TS|TSRA|SHRA)\b|(^|\s)[+-]\s*(?:SHRA|RA|DZ|SN|FG)/i.test(String(wx||''));}
function isCB(s){return/(?:FEW|SCT|BKN|OVC)\d{3}(?:CB|TCU)/i.test(String(s||''));}
function getCeiling(cld){
  if(!cld||cld==='--')return Infinity;
  const layers=(String(cld).match(/(BKN|OVC)(\d{3})/gi)||[]);
  let min=Infinity;
  layers.forEach(l=>{const h=parseInt(l.slice(3))*100;if(h<min)min=h;});
  return min;
}
function flightCat(visM,cld){
  const c=getCeiling(cld);
  const v=isNaN(visM)?Infinity:visM;
  if(v<1600||c<500)return'LIFR';
  if(v<4800||c<1000)return'IFR';
  if(v<8000||c<3000)return'MVFR';
  return'VFR';
}
function updateMetarSummaryBar(){
  const bar=$('metar-summary-bar');if(!bar)return;
  bar.innerHTML=STATIONS.map(icao=>{
    const st=metarState[icao];
    const cat=st&&st.lastCat?st.lastCat:'';
    return`<div class="msb-pill"><span class="msb-icao">${ICAO_FLAGS[icao]||''} ${icao}</span>${cat?`<span class="msb-cat ${cat}">${cat}</span>`:''}</div>`;
  }).join('');
}

/* ── METAR STATE & BUILD ── */
var metarState={};
var speciState={};

function buildMetarTable(){
  const cont=$('metar');if(!cont)return;
  cont.innerHTML='';
  STATIONS.forEach(icao=>{
    metarState[icao]={lastTime:null,lastRaw:null,lastCat:null,card:null};
    const c=document.createElement('div');
    c.className='mc';c.id='mc-'+icao;
    c.innerHTML=`
<div class="mc-head">
  <div class="mc-left">
    <span class="mc-flag">${ICAO_FLAGS[icao]||''}</span>
    <div><span class="mc-icao">${icao}</span><div class="mc-name">${ICAO_NAMES[icao]||''}</div></div>
  </div>
  <div class="mc-right">
    <span class="mc-flcat" id="mcfc-${icao}"></span>
    <span class="mc-time" id="mct-${icao}">--:--Z</span>
  </div>
</div>
<div class="mc-grid">
  <div class="mc-cell span2"><span class="mc-lbl">Wind</span><span class="mc-val lg" id="mcw-${icao}">--</span></div>
  <div class="mc-cell"><span class="mc-lbl">Gust</span><span class="mc-val" id="mcg-${icao}">--</span></div>
  <div class="mc-cell span2"><span class="mc-lbl">Visibility</span><span class="mc-val lg" id="mcv-${icao}">--</span><div class="vis-track"><div class="vis-fill" id="mcvb-${icao}" style="width:0%"></div></div></div>
  <div class="mc-cell"><span class="mc-lbl">Weather</span><span class="mc-val" id="mcwx-${icao}">--</span></div>
  <div class="mc-cell span3"><span class="mc-lbl">Cloud</span><span class="mc-val" id="mcc-${icao}">--</span></div>
  <div class="mc-cell"><span class="mc-lbl">Temp</span><span class="mc-val lg" id="mctp-${icao}">--</span></div>
  <div class="mc-cell"><span class="mc-lbl">Dew</span><span class="mc-val" id="mcd-${icao}">--</span></div>
  <div class="mc-cell"><span class="mc-lbl">QNH</span><span class="mc-val" id="mcq-${icao}">--</span></div>
</div>
<div class="mc-raw" id="mcr-${icao}">Awaiting data…</div>`;
    cont.appendChild(c);
    metarState[icao].card=c;
  });
}

function renderMetar(icao,raw){
  if(!raw)return false;
  const lines=String(raw).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let metarLine=null;
  for(const ln of lines){
    if(/^(?:SPECI|METAR)\s+/.test(ln)||ln.startsWith(icao)||/\b\d{6}Z\b/.test(ln)){metarLine=ln;break;}
  }
  if(!metarLine&&lines.length)metarLine=lines[lines.length-1];
  if(!metarLine)return false;
  const p=parseMetar(metarLine);
  const st=metarState[icao];if(!st||!st.card)return false;
  const isSpeci=isSpeciText(metarLine);
  const isAuto=/\bAUTO\b/i.test(metarLine);
  st.lastRaw=metarLine;
  cacheSet('m_'+icao,metarLine);
  const prevTime=st.lastTime;st.lastTime=p.time;
  const isNew=prevTime!==p.time;

  // flight category
  const cat=flightCat(p.visMin,p.cld);
  const fce=$('mcfc-'+icao);
  if(fce){fce.textContent=cat;fce.className='mc-flcat '+cat;}
  if(metarState[icao])metarState[icao].lastCat=cat;

  // time badge
  let tdisp='--:--Z';
  const m6=p.time.match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if(m6)tdisp=`${m6[2]}:${m6[3]}Z`;
  const te=$('mct-'+icao);
  if(te){
    const ageStr=(p.age>0&&p.age<200)?`<span class="mc-age">${Math.round(p.age)}m ago</span>`:'';
    let badges='';
    if(isSpeci)badges+='<span class="mc-badge speci">SPECI</span>';
    else if(isAuto)badges+='<span class="mc-badge auto">AUTO</span>';
    te.innerHTML=tdisp+ageStr+badges;
    te.className='mc-time'+(isNew?' new':'');
    if(isNew)setTimeout(()=>{te.classList.remove('new');},5000);
  }

  // wind
  const wdirM=p.windBase.match(/^(\d{3})/);
  const wdir=wdirM?parseInt(wdirM[1]):null;
  const wspdM=p.windBase.match(/\d{3}(\d{2,3})KT/)||p.windBase.match(/^VRB(\d{2,3})KT/);
  const wspd=wspdM?parseInt(wspdM[1]):0;
  const arr=wdir!=null?`<span style="display:inline-block;transform:rotate(${(wdir+180)%360}deg);margin-right:3px;">↑</span>`:'';
  const wCls='mc-val lg'+(p.gust>=35?' alert':(p.gust>=25?' warn':''));
  const we=$('mcw-'+icao);if(we){we.innerHTML=arr+escHtml(p.windBase||'--');we.className=wCls;}
  const ge=$('mcg-'+icao);if(ge){ge.textContent=p.gust?p.gust+' kt':'—';ge.className='mc-val'+(p.gust>=35?' alert':(p.gust>=25?' warn':''));}

  // vis
  const ve=$('mcv-'+icao),vb=$('mcvb-'+icao);
  if(ve){
    const vm=p.visMin;
    let vCls='mc-val lg',bw=100,bCol='#3fcf82';
    if(!isNaN(vm)){
      if(vm>=9999){ve.textContent='CAVOK';}
      else{ve.textContent=p.vis;}
      if(vm<2000){vCls+=' alert';bCol='#ff5f5f';bw=Math.max(4,Math.round(vm/100));}
      else if(vm<5000){vCls+=' warn';bCol='#f59e0b';bw=Math.round(vm/100);}
      else{bw=Math.min(100,Math.round(vm/80));}
    }else{ve.textContent=p.vis;}
    ve.className=vCls;
    if(vb){vb.style.width=bw+'%';vb.style.background=bCol;}
  }

  // wx
  const wxe=$('mcwx-'+icao);const wxcrit=isWxCrit(p.wx);
  if(wxe){wxe.textContent=p.wx||'--';wxe.className='mc-val'+(wxcrit?' alert':'');}

  // cloud
  const ce=$('mcc-'+icao);const cbFlag=isCB(p.cld);
  if(ce){ce.textContent=p.cld||'--';ce.className='mc-val'+(cbFlag?' alert':'');}

  // temp/dew
  const parts=p.td.split('/');
  const tv=parts[0]?.trim().replace('M','-')||'--';
  const dv=parts[1]?.trim().replace('M','-')||'--';
  const tnum=parseFloat(tv);
  const tCls='mc-val lg'+(!isNaN(tnum)&&tnum>=35?' alert':(!isNaN(tnum)&&tnum<=5?' warn':''));
  const tp=$('mctp-'+icao);if(tp){tp.textContent=tv+'°';tp.className=tCls;}
  const dp=$('mcd-'+icao);if(dp)dp.textContent=dv+'°';

  // qnh
  const qe=$('mcq-'+icao);
  if(qe){
    const qn=parseInt(p.qnh);
    qe.textContent=p.qnh||'--';
    qe.className='mc-val'+(!isNaN(qn)&&qn<1000?' warn':'');
  }

  // raw
  const re=$('mcr-'+icao);if(re)re.textContent=metarLine;

  // card state
  const card=st.card;
  card.classList.toggle('stale',p.age>120);
  card.classList.toggle('mc-alert',isSpeci||wxcrit||cbFlag||p.gust>=35);

  // sounds & speci
  if(isNew){
    playBeep();
    if(p.gust>=35||/\b(?:VCTS|TS|TSRA)\b/i.test(p.wx))playCriticalAlarm();
  }
  checkSpeci(icao,metarLine);
  updateMetarSummaryBar();
  return true;
}

/* ── SPECI (TNCA / TNCB / TNCC) ── */
function isSpeciText(raw){
  return /(?:^|\s)SPECI\b/i.test(String(raw||''));
}
function normalizeSpeciLine(icao, raw){
  let s=String(raw||'').replace(/\s+/g,' ').trim();
  if(!s) return '';
  s=s.replace(/^(METAR|SPECI)\s+/i,'').trim();
  if(!s.startsWith(icao)) s=icao+' '+s;
  return 'SPECI '+s;
}
function checkSpeci(icao,raw){
  if(!raw) return;
  if(SPECI_ICAOS.indexOf(icao)<0){
    if(!isSpeciText(raw)) speciState[icao]=null;
    return;
  }
  const isSp=isSpeciText(raw);
  if(isSp){
    const line=normalizeSpeciLine(icao, raw);
    const first=speciState[icao]!==line;
    speciState[icao]=line;
    refreshSpeciBanner();
    if(first) triggerSpeci(icao,line);
  }else if(speciState[icao]){
    speciState[icao]=null;
    refreshSpeciBanner();
  }
}
function activeSpeciList(){
  return SPECI_ICAOS.filter(function(id){return !!speciState[id];}).map(function(id){return speciState[id];});
}
function refreshSpeciBanner(){
  const banner=$('speciBanner');
  const title=$('speciBannerTitle');
  const text=$('speciBannerText');
  if(!banner) return;
  const list=activeSpeciList();
  if(!list.length){
    banner.classList.remove('active');
    document.body.classList.remove('speci-on');
    return;
  }
  if(title) title.textContent=list.length>1?('⚠ SPECI ACTIVE · '+list.length+' stations'):('⚠ SPECI '+list[0].split(' ')[1]);
  if(text) text.textContent=list.join('\n');
  banner.classList.add('active');
  document.body.classList.add('speci-on');
}
function triggerSpeci(icao,raw){
  refreshSpeciBanner();
  playSpeciAlarm();
  const t=document.createElement('div');
  t.className='toast';
  t.textContent='SPECI '+icao+' — '+raw;
  document.body.appendChild(t);
  setTimeout(function(){t.remove();},12000);
}
function dismissSpeciBanner(){
  const banner=$('speciBanner');
  if(banner) banner.classList.remove('active');
  document.body.classList.remove('speci-on');
}
window.dismissSpeciBanner=dismissSpeciBanner;

/* ── METAR FETCH ── */
function extractMetarLine(text, icao){
  if(!text) return null;
  const cleaned=sanitize(text).replace(/<[^>]+>/g,' ');
  const lines=cleaned.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const blob=cleaned.replace(/\s+/g,' ').trim();
  const candidates=lines.slice();
  if(blob.length) candidates.push(blob);
  for(let i=candidates.length-1;i>=0;i--){
    let ln=candidates[i];
    // Keep optional SPECI/METAR prefix immediately before ICAO
    const m=ln.match(new RegExp('(?:(SPECI|METAR)\\s+)?\\b'+icao+'\\b[^\\n]{0,220}?\\b\\d{6}Z\\b[^\\n]{0,180}','i'));
    if(m) ln=m[0].trim();
    if(ln.startsWith(icao)||/^(?:SPECI|METAR)\s+/.test(ln)||(ln.includes(icao)&&/\b\d{6}Z\b/.test(ln))){
      if((icao==='SVMI'||icao==='SVVA')&&/\bAUTO\b/i.test(ln)) continue;
      const speci=/SPECI/i.test(ln);
      ln=ln.replace(/^(?:METAR|SPECI)\s+/i,'').trim();
      if(!/\b\d{6}Z\b/.test(ln)) continue;
      if(!ln.startsWith(icao)) ln=icao+' '+ln;
      return speci?('SPECI '+ln):ln;
    }
  }
  const any=cleaned.match(new RegExp('(?:SPECI\\s+)?'+icao+'\\s+\\d{6}Z[\\s\\S]{0,160}','i'));
  if(any){
    const s=any[0].replace(/\s+/g,' ').trim();
    return /SPECI/i.test(s)?normalizeSpeciLine(icao,s):s.replace(/^SPECI\s+/i,'');
  }
  return null;
}
async function fetchMetarFor(icao){
  try{
    const urls=[METAR_TPL.replace('{ICAO}',icao)];
    if(SPECI_ICAOS.indexOf(icao)>=0){
      urls.push(AWC_METAR.replace('{IDS}',icao));
    }
    let picked=null;
    for(const url of urls){
      const out=await fetchRetry(url);
      if(!out.ok) continue;
      const ln=extractMetarLine(out.text, icao);
      if(!ln) continue;
      if(isSpeciText(ln)){picked=ln;break;}
      if(!picked) picked=ln;
    }
    if(picked){renderMetar(icao,picked);return true;}
  }catch(e){console.error('METAR',icao,e);}
  return false;
}
async function refreshAllMetars(){
  const results=await Promise.all(STATIONS.map(async icao=>{
    const ok=await fetchMetarFor(icao);
    if(!ok){
      const st=metarState[icao];
      if(st&&st.card&&!st.lastRaw){
        const sub=st.card.querySelector('.mc-raw, .loading-msg, .mc-await');
        // show soft failure without wiping structure
        const foot=st.card.querySelector('.mc-foot')||st.card;
        let msg=st.card.querySelector('.mc-fail');
        if(!msg){
          msg=document.createElement('div');
          msg.className='mc-fail';
          msg.style.cssText='font-family:var(--cond);font-size:11px;color:var(--warn);padding:6px 10px;';
          st.card.appendChild(msg);
        }
        msg.textContent='No data — check network / ⚙ proxy';
      }
    }else{
      const st=metarState[icao];
      const msg=st&&st.card&&st.card.querySelector('.mc-fail');
      if(msg) msg.remove();
    }
    return ok;
  }));
  const lu=$('last-updated');if(lu)lu.textContent=nowStamp();
  return results.some(Boolean);
}

/* ── TAF PARSE ── */
function parseTafSeg(seg){
  const tok=seg.trim().split(/\s+/);
  const wb=tok.find(x=>/^(?:VRB|\d{3})\d{2}(?:G\d{2,3})?KT$/.test(x))||'--';
  const vt=tok.filter(x=>/^\d{4}(?:[NSEW]{1,2})?$/.test(x)||x==='9999'||/^P\d+SM$/.test(x));
  const vis=vt.length?vt[0]:'--';
  const visN=vis==='9999'||/^P/.test(vis)?9999:(parseInt(vis)||NaN);
  const wx=tok.filter(x=>/^(?:\+|-)?(?:VC)?(?:TS|VCTS|VCSH|TSRA|SH|SHRA|RA|DZ|SN|FG|BR|HZ|SQ|PO)/.test(x)).join(' ')||'--';
  const cm=seg.match(/((?:FEW|SCT|BKN|OVC)(?:\d{3}|\/{3})(?:TCU|CB)?)/gi)||[];
  const cld=cm.join(' ')||'--';
  const qp=tok.find(x=>/^Q\d{4}$/.test(x));
  let qnh='—';if(qp){const h=qp.slice(1);qnh=`${h}/${(parseInt(h)*0.029529983).toFixed(2)}`;}
  return{wind:wb==='--'?'--':wb,windBase:wb,vis,visN,wx,cld,qnh};
}