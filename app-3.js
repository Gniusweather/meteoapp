
function decodeVV(vv){
  // WMO Code Table 4377 — horizontal visibility at the surface
  if(!vv||vv==='//') return null;
  const n=parseInt(vv);
  if(isNaN(n)) return null;
  if(n===0) return '<100 m';
  if(n<=50){const m=n*100;return m>=1000?`${(m/1000).toFixed(1)} km`:`${m} m`;}
  if(n<=55) return null;                       // 51–55 not used
  if(n<=80) return`${n-50} km`;                // 56–80 → 6–30 km
  if(n<=88) return`${(n-80)*5+30} km`;         // 81–88 → 35–70 km
  if(n===89) return'>70 km';
  const a={'90':'<0.05 km','91':'0.05 km','92':'0.2 km','93':'0.5 km','94':'1 km','95':'2 km','96':'4 km','97':'10 km','98':'20 km','99':'≥50 km'};
  return a[vv]||null;
}
function decTemp(g){if(g.length!==5)return null;const sn=g[1],t=g.slice(2);if(t==='///')return null;const s=sn==='1'?-1:1;const v=parseInt(t);return isNaN(v)?null:+(s*v/10).toFixed(1);}
function decPres(g){if(g.length!==5)return null;const p=g.slice(1);if(p==='////')return null;let v=parseInt(p.replace('/',''));if(isNaN(v))return null;v=v/10;if(v<500)v+=1000;return+v.toFixed(1);}
function decTend(g){if(g.length!==5)return null;const a=g[1],p=g.slice(2);const ch=parseInt(p);return{a,change:isNaN(ch)?null:+((a>='5'?-1:1)*ch/10).toFixed(1),desc:T_A[a]||null};}
function decPrecip(g){if(g.length!==5)return null;const rrr=g.slice(1,4),tr=g[4];let amt=null;if(rrr!=='///'){const n=parseInt(rrr);if(!isNaN(n)){if(n<=988)amt=n;else if(n===989)amt='≥989';else if(n===990)amt='trace';else if(n>=991)amt=+((n-990)/10).toFixed(1);}}return{amount:amt,period:tr,pDesc:T_TR[tr]||null};}
function dirCard(deg){if(typeof deg!=='number')return deg||'—';const c=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return c[Math.round(deg/22.5)%16]+' '+deg+'°';}

function parseSynopBulletin(text){
  const out={header:null,bulletinTime:null,windUnits:'m/s',reports:[]};
  if(!text)return out;
  const hm=text.match(/\b(S[IM][A-Z]{2}\d{2})\s+([A-Z]{4})\s+(\d{6})/);
  if(hm){const tt=hm[3];out.bulletinTime=`Day ${tt.slice(0,2)} ${tt.slice(2,4)}:${tt.slice(4,6)}Z`;}
  const aaxxIdx=text.search(/\bAAXX\s+\d{5}\b/);if(aaxxIdx<0)return out;
  const yyM=text.slice(aaxxIdx).match(/AAXX\s+\d{2}(\d{2})(\d)/);
  if(yyM){const iw=yyM[2];out.windUnits=(iw==='3'||iw==='4')?'kn':'m/s';}
  const after=text.slice(aaxxIdx).replace(/^AAXX\s+\d{5}\s*/,'');
  after.split('=').map(s=>s.trim()).filter(Boolean).forEach(seg=>{
    const tok=seg.split(/\s+/).filter(Boolean);
    if(!tok.length||!/^\d{5}$/.test(tok[0]))return;
    const rep=decodeReport(tok,out.windUnits);if(rep)out.reports.push(rep);
  });
  return out;
}
function decodeReport(tok,wu){
  const r={iiiii:tok[0],raw:tok.join(' '),windUnits:wu,iR:null,iX:null,h:null,VV:null,visText:null,N:null,dir:null,windSp:null,T:null,Td:null,RH:null,Pstn:null,Pmsl:null,tendency:null,precip:null,ww:null,W1:null,W2:null,Nh:null,CL:null,CM:null,CH:null,Tmax:null,Tmin:null};
  let i=1;
  if(i<tok.length&&/^\d{5}$/.test(tok[i])){const g=tok[i];r.iR=g[0];r.iX=g[1];r.h=g[2];r.VV=g.slice(3);r.visText=decodeVV(r.VV);i++;}
  if(i<tok.length&&/^\d{5}$/.test(tok[i])){const g=tok[i];r.N=g[0];const dd=parseInt(g.slice(1,3));const ff=parseInt(g.slice(3,5));r.dir=isNaN(dd)?null:(dd===0?'Calm':dd===99?'VRB':dd*10);r.windSp=isNaN(ff)?null:ff;i++;}
  if(r.windSp===99&&i<tok.length&&/^00\d{3}$/.test(tok[i])){r.windSp=parseInt(tok[i].slice(2));i++;}
  while(i<tok.length){
    const t=tok[i];
    if(t==='333'||t==='222'||t==='444'||t==='555')break;
    if(!/^\d{5}$/.test(t)){i++;continue;}
    const k=t[0];
    if(k==='1')r.T=decTemp(t);
    else if(k==='2'){if(t[1]==='9'){const rh=parseInt(t.slice(2));if(!isNaN(rh))r.RH=rh;}else r.Td=decTemp(t);}
    else if(k==='3')r.Pstn=decPres(t);
    else if(k==='4')r.Pmsl=decPres(t);
    else if(k==='5')r.tendency=decTend(t);
    else if(k==='6')r.precip=decPrecip(t);
    else if(k==='7'){r.ww=t.slice(1,3);r.W1=t[3];r.W2=t[4];}
    else if(k==='8'){r.Nh=t[1];r.CL=t[2];r.CM=t[3];r.CH=t[4];}
    i++;
  }
  if(i<tok.length&&tok[i]==='333'){i++;while(i<tok.length){const t=tok[i];if(t==='222'||t==='444'||t==='555')break;if(/^1\d{4}$/.test(t))r.Tmax=decTemp(t);else if(/^2\d{4}$/.test(t))r.Tmin=decTemp(t);i++;}}
  return r;
}
function renderSynopReport(rep){
  const CLOUD_AMT={'0':'SKC','1':'FEW','2':'FEW','3':'SCT','4':'SCT','5':'BKN','6':'BKN','7':'BKN','8':'OVC','9':'SKX','/':'—'};
  const H_FT={'0':'0–165 ft','1':'165–330 ft','2':'330–660 ft','3':'660–985 ft','4':'985–1970 ft','5':'1970–3300 ft','6':'3300–4920 ft','7':'4920–6560 ft','8':'6560–8200 ft','9':'≥8200 ft'};
  const CARD=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

  const wCl=rep.windSp>=25?' alert':(rep.windSp>=15?' warn':'');
  const vkm=rep.visText&&/^\d/.test(rep.visText)?parseFloat(rep.visText):null;
  const vCl=vkm!=null?(vkm<3?' alert':(vkm<8?' warn':'')):'';
  const tCl=rep.T!=null&&rep.T>=35?' alert':(rep.T!=null&&rep.T<=5?' warn':'');
  const pres=rep.Pmsl!=null?rep.Pmsl:(rep.Pstn!=null?rep.Pstn:null);
  const presLbl=rep.Pmsl!=null?'QNH':'QFE';
  const stype=rep.iX?(rep.iX>='4'?'AUTO':'MAN'):'';

  const nCode=rep.N||'/';
  const cAmt=CLOUD_AMT[nCode]||'—';
  const cOktas=T_N[nCode]||'—';

  let wDirStr='—', wSpdStr='', wCardStr='';
  if(rep.dir==='Calm'){wDirStr='Calm';}
  else if(rep.dir!=null){wDirStr=rep.dir+'°';wCardStr=CARD[Math.round(rep.dir/22.5)%16]||'';}
  if(rep.windSp!=null) wSpdStr=rep.windSp+' '+(rep.windUnits||'m/s');

  const tiles=[];

  // Wind
  tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Wind</div>
<div class="sy-val${wCl}">${wDirStr}</div>
<div class="sy-sub">${wSpdStr}${wCardStr?' · '+wCardStr:''}</div>
</div>`);

  // Visibility
  tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Visibility</div>
<div class="sy-val${vCl}">${rep.visText||'—'}</div>
</div>`);

  // Cloud
  tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Cloud Cover</div>
<div class="sy-val">${cAmt}</div>
<div class="sy-sub">${cOktas} oktas${rep.h&&rep.h!=='/'?' · '+H_FT[rep.h]:''}</div>
</div>`);

  // Temperature
  if(rep.T!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Temperature</div>
<div class="sy-val${tCl}">${rep.T}°C</div>
</div>`);

  // Dew / RH
  if(rep.Td!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Dew Point</div>
<div class="sy-val">${rep.Td}°C</div>
</div>`);
  else if(rep.RH!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Rel. Humidity</div>
<div class="sy-val">${rep.RH}%</div>
</div>`);

  // QNH / QFE
  if(pres!=null){
    const tendStr=rep.tendency&&rep.tendency.change!=null?`${rep.tendency.change>=0?'+':''}${rep.tendency.change.toFixed(1)} hPa/3h`:'';
    tiles.push(`<div class="sy-tile">
<div class="sy-lbl">${presLbl}</div>
<div class="sy-val">${pres.toFixed(1)} hPa</div>
${tendStr?`<div class="sy-sub">${tendStr}</div>`:''}
</div>`);
  }

  // Precipitation
  if(rep.precip&&rep.precip.amount!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">Precipitation</div>
<div class="sy-val">${rep.precip.amount} mm</div>
${rep.precip.pDesc?`<div class="sy-sub">/ ${rep.precip.pDesc}</div>`:''}
</div>`);

  // Tmax / Tmin
  if(rep.Tmax!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">T Max</div>
<div class="sy-val">${rep.Tmax}°C</div>
</div>`);
  if(rep.Tmin!=null) tiles.push(`<div class="sy-tile">
<div class="sy-lbl">T Min</div>
<div class="sy-val">${rep.Tmin}°C</div>
</div>`);

  const wx=[];
  if(rep.ww&&T_WW[rep.ww])wx.push(T_WW[rep.ww]);
  if(rep.W1&&T_W[rep.W1]&&rep.W1!=='/')wx.push('Past: '+T_W[rep.W1]);
  if(rep.CL&&T_CL[rep.CL]&&rep.CL!=='0'&&rep.CL!=='/')wx.push('Low: '+T_CL[rep.CL]);
  if(rep.CM&&T_CM[rep.CM]&&rep.CM!=='0'&&rep.CM!=='/')wx.push('Mid: '+T_CM[rep.CM]);
  if(rep.CH&&T_CH[rep.CH]&&rep.CH!=='0'&&rep.CH!=='/')wx.push('High: '+T_CH[rep.CH]);

  const wxBlock=wx.length?`<div class="sy-wx">${wx.join(' · ')}</div>`:'';

  return`<div class="sy-report">
<div class="sy-report-head"><span class="sy-wmo">WMO ${rep.iiiii}</span>${stype?`<span class="sy-stype">${stype}</span>`:''}</div>
<div class="sy-grid">${tiles.join('')}</div>
${wxBlock}
<div class="sy-raw">${escHtml(rep.raw)}</div>
</div>`;
}

var SYNOP_SOURCES=[
  {key:'tnca-si',station:'tnca',flag:ICAO_FLAGS.TNCA,label:'SINU50 · TNCA',type:'SI',url:'https://tgftp.nws.noaa.gov/data/raw/si/sinu50.tnca..txt'},
  {key:'tnca-sm',station:'tnca',flag:ICAO_FLAGS.TNCA,label:'SMNU50 · TNCA',type:'SM',url:'https://tgftp.nws.noaa.gov/data/raw/sm/smnu50.tnca..txt'},
  {key:'tncb-si',station:'tncb',flag:ICAO_FLAGS.TNCB,label:'SINU50 · TNCB',type:'SI',url:'https://tgftp.nws.noaa.gov/data/raw/si/sinu50.tncb..txt'},
  {key:'tncb-sm',station:'tncb',flag:ICAO_FLAGS.TNCB,label:'SMNU50 · TNCB',type:'SM',url:'https://tgftp.nws.noaa.gov/data/raw/sm/smnu50.tncb..txt'},
  {key:'tncc-si',station:'tncc',flag:ICAO_FLAGS.TNCC,label:'SICA20 · TNCC',type:'SI',url:'https://tgftp.nws.noaa.gov/data/raw/si/sica20.tncc..txt'},
  {key:'tncc-sm',station:'tncc',flag:ICAO_FLAGS.TNCC,label:'SMCA01 · TNCC',type:'SM',url:'https://tgftp.nws.noaa.gov/data/raw/sm/smca01.tncc..txt'},
];
var synopStationData={tnca:{},tncb:{},tncc:{}};

// Pull comparable values out of the latest METAR for cross-checking SYNOP
function metarVals(icao){
  const st=metarState[icao];
  if(!st||!st.lastRaw)return null;
  const p=parseMetar(st.lastRaw);
  let dir=null,sp=null;
  const m=(p.windBase||'').match(/^(VRB|\d{3})(\d{2})(?:G\d{2,3})?KT$/);
  if(m){dir=m[1]==='VRB'?'VRB':parseInt(m[1]);sp=parseInt(m[2]);}
  let temp=null;
  const tm=(p.td||'').match(/^(M?\d{2})\//);
  if(tm)temp=parseInt(tm[1].replace('M','-'));
  const vkm=isFinite(p.visMin)?(p.visMin>=9999?10:p.visMin/1000):null;
  return{dir,sp,temp,vkm};
}
// Compare a decoded SYNOP report against the matching METAR; flag discrepancies
function synopMetarQC(stationKey,rep){
  const m=metarVals(stationKey.toUpperCase());
  if(!m||!rep)return '';
  const diffs=[];
  const sv=rep.visText&&/^[\d.]+\s*km/.test(rep.visText)?parseFloat(rep.visText):null;
  if(sv!=null&&m.vkm!=null&&Math.abs(sv-m.vkm)>3) diffs.push(`vis ${sv} vs ${m.vkm.toFixed(0)} km`);
  if(typeof rep.dir==='number'&&typeof m.dir==='number'){
    let dd=Math.abs(rep.dir-m.dir);if(dd>180)dd=360-dd;
    if(dd>30) diffs.push(`wind dir ${rep.dir}° vs ${m.dir}°`);
  }
  if(rep.windSp!=null&&m.sp!=null&&Math.abs(rep.windSp-m.sp)>5) diffs.push(`wind ${rep.windSp} vs ${m.sp} kt`);
  if(rep.T!=null&&m.temp!=null&&Math.abs(rep.T-m.temp)>2) diffs.push(`temp ${rep.T}° vs ${m.temp}°`);
  if(diffs.length) return `<div class="synop-qc warn">⚠ Differs from latest METAR — ${escHtml(diffs.join(' · '))}</div>`;
  return `<div class="synop-qc ok">✓ Consistent with latest METAR</div>`;
}
function updateSynopStationCard(stationKey){
  const cont=$('synop-card-'+stationKey);if(!cont)return;
  const data=synopStationData[stationKey];
  const sources=SYNOP_SOURCES.filter(s=>s.station===stationKey);
  let repForQC=null;
  sources.forEach(src=>{const d=data[src.key];if(d&&d.parsed.reports.length&&!repForQC)repForQC=d.parsed.reports[0];});
  let html=repForQC?synopMetarQC(stationKey,repForQC):'';
  sources.forEach(src=>{
    const d=data[src.key];if(!d)return;
    const parsed=d.parsed;
    html+=`<div class="synop-stn-card">
<div class="synop-stn-head">
  <div style="display:flex;align-items:center;gap:9px;">
    <span class="synop-stn-flag">${src.flag}</span>
    <div><div class="synop-stn-icao">${src.label}</div><div class="synop-stn-sub">${parsed.bulletinTime||'—'}</div></div>
  </div>
</div>
${parsed.reports.length?parsed.reports.map(renderSynopReport).join(''):'<div class="loading-msg" style="padding:12px 14px">No decodable reports in bulletin</div>'}
<div class="synop-src-lbl">${src.label} · ${src.type}</div>
<div class="synop-raw-str">${escHtml((d.rawText||'').slice(0,400))}</div>
</div>`;
  });
  cont.innerHTML=html||'<div class="loading-msg">Awaiting data…</div>';
}
function renderSynopStation(source,rawText){
  const text=sanitize(rawText);
  const parsed=parseSynopBulletin(text);
  cacheSet('s_'+source.station+'_'+source.key,rawText);
  synopStationData[source.station][source.key]={parsed,rawText};
  updateSynopStationCard(source.station);
  const e=$('synop-updated');if(e)e.textContent=nowStamp();
}
async function loadSynopSource(source){
  const out=await fetchRetry(source.url);
  if(out.ok)renderSynopStation(source,out.text);
}
async function loadAllSynops(){
  SYNOP_SOURCES.forEach(s=>{const c=cacheGet('s_'+s.station+'_'+s.key);if(c)renderSynopStation(s,c);});
  await Promise.all(SYNOP_SOURCES.map(loadSynopSource));
}

/* ── STATIONS ── */
var API_BASE='https://curacao-weather-api.generast.workers.dev/';
var COORDS={'Curaçao International Airport':{lat:12.18889,lon:-68.95972},'Curacao International Airport':{lat:12.18889,lon:-68.95972},'Seru Mahuma':{lat:12.1833,lon:-68.9333},'Santa Maria':{lat:12.1672,lon:-68.9392},'Savonet':{lat:12.3506,lon:-69.1061},'Soto':{lat:12.2667,lon:-69.1},'Spaanse Water':{lat:12.0673,lon:-68.8501},'Steenrijk':{lat:12.0979,lon:-68.9121}};
var MAP_EXCL=new Set(['Klein Kwartier','Punda']);
var currentData=[],map=null,markersLayer=null;
var svgN=0;

function safeN(v){return(v===null||v===undefined||v==='')?null:Number(v);}
function islandFlag(name){const n=(name||'').toLowerCase();if(n.includes('aruba')||n.includes('beatrix'))return'🇦🇼';if(n.includes('bonaire')||n.includes('flamingo')||n.includes('rincon'))return'🇧🇶';return'🇨🇼';}
function extractCoords(row){let lat=null,lon=null;for(const k of['latitude','lat','lat_deg']){if(k in row&&row[k]!=null){lat=row[k];break;}}for(const k of['longitude','lon','lon_deg','lng']){if(k in row&&row[k]!=null){lon=row[k];break;}}if(lat==null&&row.location?.lat)lat=row.location.lat;if(lon==null&&row.location?.lon)lon=row.location.lon;lat=lat!=null?Number(lat):null;lon=lon!=null?Number(lon):null;if(!isFinite(lat))lat=null;if(!isFinite(lon))lon=null;if(lat==null||lon==null){const nm=(row.station||'').trim();if(COORDS[nm]){lat=COORDS[nm].lat;lon=COORDS[nm].lon;}}return lat!=null&&lon!=null?{lat,lon}:null;}

function windRoseSvg(dir,sp){
  const id=++svgN;
  if(typeof dir!=='number'||!isFinite(dir))return`<svg viewBox="0 0 60 60" class="wind-rose"><circle cx="30" cy="30" r="22" stroke="rgba(85,193,255,0.15)" stroke-width="1.5" fill="none"/><text x="30" y="35" fill="rgba(106,138,170,0.6)" font-size="11" text-anchor="middle" font-family="Space Mono,monospace">—</text></svg>`;
  const col=(typeof sp==='number'&&sp>=25)?'#ff5f5f':((typeof sp==='number'&&sp>=15)?'#f59e0b':'#3fcf82');
  const len=sp?Math.min(19,Math.max(5,(sp/20)*19)):8;
  const a=((dir+180)%360-90)*Math.PI/180;
  const ax=30+len*Math.cos(a),ay=30+len*Math.sin(a);
  const bx=30-8*Math.cos(a),by=30-8*Math.sin(a);
  return`<svg viewBox="0 0 60 60" class="wind-rose"><circle cx="30" cy="30" r="22" stroke="rgba(85,193,255,0.15)" stroke-width="1.5" fill="none"/><line x1="${bx}" y1="${by}" x2="${ax}" y2="${ay}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><polygon points="${ax+5*Math.cos(a)},${ay+5*Math.sin(a)} ${ax-4*Math.cos(a-1.3)},${ay-4*Math.sin(a-1.3)} ${ax-4*Math.cos(a+1.3)},${ay-4*Math.sin(a+1.3)}" fill="${col}"/><text x="30" y="55" fill="rgba(200,230,255,0.7)" font-size="8" text-anchor="middle" font-family="Space Mono,monospace">${typeof sp==='number'?Math.round(sp)+' kt':'—'}</text></svg>`;}

function renderStations(rows){
  const list=$('stationsList');if(!list)return;
  let alerts=0,stale=0;
  list.innerHTML=rows.map(r=>{
    const last=r.last_updated?new Date(r.last_updated):null;
    const isStale=!last||((Date.now()-last)/60000>180);
    if(isStale)stale++;
    const wkn=r.wind_speed_knots!=null?r.wind_speed_knots:null;
    const wdg=r.wind_direction_deg!=null?Number(r.wind_direction_deg):null;
    const flag=islandFlag(r.station);
    return`<div class="station-row">
<div class="station-name"><span class="station-flag">${flag}</span>${escHtml(r.station||'—')}</div>
<div class="station-time">${escHtml(r.last_updated||'—')}</div>
<div style="display:flex;gap:10px;align-items:center;margin-top:6px;">${windRoseSvg(wdg,wkn)}
<div class="params-row" style="flex:1">
<div class="param"><span class="label">Temp</span><span class="value">${r.temperature_c!=null?r.temperature_c.toFixed(1)+'°C':'—'}</span></div>
<div class="param"><span class="label">Wind</span><span class="value">${wkn!=null?wkn+' kn':'—'}</span></div>
<div class="param"><span class="label">Humidity</span><span class="value">${r.humidity_percent!=null?r.humidity_percent+'%':'—'}</span></div>
<div class="param"><span class="label">Rain</span><span class="value">${r.rain_today_mm!=null?r.rain_today_mm+' mm':'—'}</span></div>
</div></div></div>`;
  }).join('');
  $('totalCount').textContent=rows.length;
  $('alertCount').textContent=alerts;
  $('staleCount').textContent=stale;
}

async function initMap(){
  if(map)return map;
  try{await ensureLeaflet();}catch(e){return null;}
  if(typeof L==='undefined')return null;
  map=L.map('map',{zoomControl:true}).setView([12.169,-68.99],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  markersLayer=L.layerGroup().addTo(map);
  return map;
}
async function addMarkers(rows){
  if(!map)await initMap();
  if(!map||!markersLayer)return;
  markersLayer.clearLayers();
  rows.forEach(r=>{
    if(MAP_EXCL.has((r.station||'').trim()))return;
    const c=extractCoords(r);if(!c)return;
    const sp=r.wind_speed_knots!=null?Number(r.wind_speed_knots):null;
    const col=sp!=null&&sp>=25?'#ef4444':(sp!=null&&sp>=15?'#f59e0b':'#3fcf82');
    const mk=L.circleMarker([c.lat,c.lon],{radius:10,fillColor:col,color:'#00000022',weight:1,fillOpacity:0.9});
    const flag=islandFlag(r.station);
    mk.bindPopup(`<div style="padding:10px;min-width:200px;background:rgba(4,14,28,0.98);font-family:Barlow Condensed,sans-serif;color:#fff;"><strong style="color:#55c1ff;font-size:15px;">${flag} ${escHtml(r.station||'—')}</strong><br/><small style="color:#7a9bbf;">${escHtml(r.last_updated||'—')}</small><hr style="border:none;border-top:1px solid rgba(55,130,200,0.2);margin:7px 0"/><div style="font-size:13px;">Temp: ${r.temperature_c!=null?r.temperature_c.toFixed(1)+' °C':'—'}</div><div style="font-size:13px;">Wind: ${sp!=null?sp+' kn':'—'}</div></div>`,{maxWidth:280});
    mk.addTo(markersLayer);
  });
}

async function fetchStationsData(){
  try{
    let rows=[];
    try{const res=await fetch(API_BASE,{cache:'no-store'});if(!res.ok)throw new Error(res.status);rows=await res.json();}
    catch(err){
      const ts=new Date().toISOString();
      rows=[{station:'Curaçao International Airport',temperature_c:29.1,humidity_percent:74,wind_speed_knots:12,wind_direction_deg:140,rain_today_mm:0,last_updated:ts},{station:'Seru Mahuma',temperature_c:28.4,humidity_percent:70,wind_speed_knots:8,wind_direction_deg:160,rain_today_mm:0,last_updated:ts},{station:'Santa Maria',temperature_c:29.6,humidity_percent:72,wind_speed_knots:10,wind_direction_deg:150,rain_today_mm:0,last_updated:ts}];
    }
    rows.forEach(r=>{r.temperature_c=safeN(r.temperature_c);r.humidity_percent=safeN(r.humidity_percent);r.wind_speed_knots=safeN(r.wind_speed_knots);r.wind_direction_deg=r.wind_direction_deg!=null?safeN(r.wind_direction_deg):null;r.rain_today_mm=safeN(r.rain_today_mm);});
    currentData=rows;
    const ts='Updated: '+nowStamp();
    const slF=$('stationsLastFetched');if(slF)slF.textContent=ts;
    const mlF=$('mapLastFetched');if(mlF)mlF.textContent=ts;
    renderStations(rows);
    if(map)addMarkers(rows);
  }catch(e){console.error('stations',e);}
}

/* ── ATC ── */
/* ── ATC live map (Leaflet + ADS-B, ADS-B Exchange style labels) ── */
var ATC_ADSB_BASE='https://globe.adsbexchange.com/';
var ATC_CENTER=[12.35,-69.40];
var atcMap=null, atcBaseLayer=null, atcSatLayer=null, atcRainLayer=null, atcAcLayer=null, atcTimer=null;

function atcAltClass(alt){
  const a=Number(alt);
  if(!isFinite(a)||a<=0) return 'c-gnd';
  if(a>=28000) return 'c-hi';
  if(a>=10000) return 'c-mid';
  return 'c-lo';
}
function atcPlaneIcon(track, labelHtml, alt){
  const rot=(typeof track==='number'&&isFinite(track))?track:0;
  const cls=atcAltClass(alt);
  const html='<div class="ac-plane '+cls+'" style="transform:rotate('+rot+'deg)">'+
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z"/></svg>'+
    '</div><div class="ac-label">'+labelHtml+'</div>';
  return L.divIcon({className:'ac-marker', html:html, iconSize:[0,0], iconAnchor:[0,0]});
}

function atcFmtAlt(alt, vs){
  if(alt==null||!isFinite(alt)) return '—';
  const a=Math.round(alt);
  let arrow='';
  if(vs!=null&&isFinite(vs)){
    if(vs>100) arrow=' ▲';
    else if(vs<-100) arrow=' ▼';
  }
  return arrow+a+' ft';
}

function atcFrameUrl(lat, lon, zoom){
  return 'https://adsb.lol/?lat='+lat+'&lon='+lon+'&zoom='+zoom+'&hideSidebar&enableLabels&outlineWidth=1';
}
async function atcInitMap(){
  const frame=document.getElementById('atc-live-frame');
  if(frame && !frame.src) frame.src=atcFrameUrl(12.35,-69.40,8.8);
  const el=document.getElementById('atc-live-map');
  if(!el || el.style.display==='none') return;
  try{ await ensureLeaflet(); }catch(e){ const st=document.getElementById('atc-traffic-status'); if(st) st.textContent='Map library failed to load'; return; }
  if(typeof L==='undefined') return;
  if(atcMap){ try{atcMap.invalidateSize();}catch(e){} return; }
  atcMap=L.map(el,{zoomControl:true,attributionControl:true}).setView(ATC_CENTER,9);
  atcBaseLayer=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
    attribution:'© OpenMapTiles © OSM', maxZoom:19, subdomains:'abcd'
  }).addTo(atcMap);
  try{ L.control.scale({imperial:true,metric:false,position:'bottomleft'}).addTo(atcMap); }catch(e){}
  atcSatLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
    attribution:'Tiles &copy; Esri', maxZoom:19
  });
  // RainViewer last frame (best-effort)
  atcRainLayer=L.tileLayer('https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png',{
    opacity:0.55, zIndex:5, attribution:'RainViewer'
  });
  atcAcLayer=L.layerGroup().addTo(atcMap);
  // Airport markers
  [[12.1889,-68.9597,'TNCC Hato'],[12.5014,-70.0152,'TNCA'],[12.1310,-68.2685,'TNCB']].forEach(function(a){
    L.circleMarker([a[0],a[1]],{radius:5,color:'#55c1ff',fillColor:'#55c1ff',fillOpacity:0.7,weight:1})
      .bindTooltip(a[2],{permanent:false,direction:'top'}).addTo(atcMap);
  });
  atcTrafficRefresh();
  if(atcTimer) clearInterval(atcTimer);
  atcTimer=setInterval(atcTrafficRefresh, 15000);
  // Cloud/radar overlay like ADS-B Exchange
  setTimeout(function(){ try{ atcMapMode('rain'); }catch(e){} },400);
  setTimeout(function(){try{atcMap.invalidateSize();}catch(e){}},250);
}

function atcParseAircraft(j){
  if(!j || j.error) return [];
  if(Array.isArray(j.ac)) return j.ac;
  if(Array.isArray(j.aircraft)) return j.aircraft;
  return [];
}

async function atcTrafficRefresh(){
  const st=document.getElementById('atc-traffic-status');
  if(!atcMap) await atcInitMap();
  if(!atcMap||!atcAcLayer) return;
  if(st) st.textContent='Updating traffic…';
  const lat=(atcMap.getCenter()&&atcMap.getCenter().lat)||ATC_CENTER[0];
  const lon=(atcMap.getCenter()&&atcMap.getCenter().lng)||ATC_CENTER[1];
  const dist=400;
  // Free community feed only — no OpenSky / no paid ADS-B Exchange key
  const urls=[
    'https://api.adsb.lol/v2/point/'+lat.toFixed(4)+'/'+lon.toFixed(4)+'/'+dist,
    'https://api.adsb.lol/v2/lat/'+lat.toFixed(4)+'/lon/'+lon.toFixed(4)+'/dist/'+dist
  ];
  let list=[], via='';
  for(const u of urls){
    try{
      const out=await fetchRetry(u);
      if(!out.ok||!out.text) continue;
      if(/api[\s_-]*key/i.test(out.text)) continue;
      const j=extractJson(out.text);
      const ac=atcParseAircraft(j);
      if(ac.length){ list=ac; via='adsb.lol'; break; }
    }catch(e){}
  }
  atcAcLayer.clearLayers();
  let n=0;
  list.forEach(function(ac){
    const la=ac.lat!=null?Number(ac.lat):Number(ac.latitude);
    const lo=ac.lon!=null?Number(ac.lon):(ac.lng!=null?Number(ac.lng):Number(ac.longitude));
    if(!isFinite(la)||!isFinite(lo)) return;
    const cs=(ac.flight||ac.callsign||ac.r||ac.hex||'????').toString().trim().toUpperCase();
    const alt=ac.alt_baro!=null?ac.alt_baro:(ac.altitude!=null?ac.altitude:ac.alt_geom);
    const gs=ac.gs!=null?ac.gs:(ac.speed!=null?ac.speed:ac.groundspeed);
    const track=ac.track!=null?ac.track:(ac.true_heading!=null?ac.true_heading:ac.heading);
    const vs=ac.baro_rate!=null?ac.baro_rate:ac.vert_rate;
    const spd=gs!=null&&isFinite(gs)?Math.round(gs)+' kt':'—';
    const altN=alt!=null&&isFinite(Number(alt))?Math.round(Number(alt)):'—';
    const label='<div class="ac-meta">'+spd+' '+altN+' ft</div><div class="ac-cs">'+escHtml(cs)+'</div>';
    const m=L.marker([la,lo],{icon:atcPlaneIcon(track,label,alt),interactive:true});
    m.bindPopup('<b>'+escHtml(cs)+'</b><br>'+spd+' · '+atcFmtAlt(alt,vs)+'<br>Track '+(track!=null?Math.round(track)+'°':'—'));
    m.addTo(atcAcLayer);
    n++;
  });
  if(st){
    st.textContent=n
      ? (n+' aircraft nearby · adsb.lol')
      : 'No aircraft in range — open adsb.lol (free)';
  }
}

async function atcMapMode(mode){
  const frame=document.getElementById('atc-live-frame');
  if(frame){
    if(mode==='tncc') frame.src=atcFrameUrl(12.1889,-68.9597,11);
    else if(mode==='abc'||mode==='dark') frame.src=atcFrameUrl(12.35,-69.40,8.8);
    else if(mode==='reload'){ const s=frame.src; frame.src='about:blank'; setTimeout(function(){frame.src=s||atcFrameUrl(12.35,-69.40,8.8);},80); }
    return;
  }
  if(!atcMap) await atcInitMap();
  if(!atcMap) return;
  if(mode==='tncc'){ atcMap.setView([12.1889,-68.9597],11); }
  if(mode==='dark'){
    if(atcMap.hasLayer(atcSatLayer)) atcMap.removeLayer(atcSatLayer);
    if(!atcMap.hasLayer(atcBaseLayer)) atcBaseLayer.addTo(atcMap);
  }
  if(mode==='sat'){
    if(atcMap.hasLayer(atcBaseLayer)) atcMap.removeLayer(atcBaseLayer);
    if(!atcMap.hasLayer(atcSatLayer)) atcSatLayer.addTo(atcMap);
  }
  if(mode==='rain'){
    if(atcMap.hasLayer(atcRainLayer)) atcMap.removeLayer(atcRainLayer);
    else {
      // refresh rainviewer timestamp path best-effort
      fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json()).then(j=>{
        try{
          const frames=(j.radar&&j.radar.past)||[];
          const last=frames[frames.length-1];
          if(last&&last.path){
            if(atcRainLayer) atcMap.removeLayer(atcRainLayer);
            atcRainLayer=L.tileLayer('https://tilecache.rainviewer.com'+last.path+'/256/{z}/{x}/{y}/2/1_1.png',{opacity:0.55,zIndex:5});
            atcRainLayer.addTo(atcMap);
          }else atcRainLayer.addTo(atcMap);
        }catch(e){atcRainLayer.addTo(atcMap);}
      }).catch(()=>atcRainLayer.addTo(atcMap));
    }
  }
  const ext=document.getElementById('atc-adsb-ext');
  if(ext){
    const c=atcMap.getCenter();
    ext.href=`${ATC_ADSB_BASE}?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&zoom=${atcMap.getZoom()}`;
  }
  setTimeout(function(){try{atcMap.invalidateSize();}catch(e){}},150);
}
// Back-compat for any leftover callers
function atcMapLoad(mode){ atcMapMode(mode==='base'?'dark':mode); }
window.atcMapLoad=atcMapLoad;
window.atcMapMode=atcMapMode;
window.atcTrafficRefresh=atcTrafficRefresh;
window.atcInitMap=atcInitMap;

function buildATC(){
  const cont=$('atc-players');if(!cont)return;
  if(cont.dataset.built==='1') return; // prevent duplicate players
  cont.dataset.built='1';
  cont.innerHTML='';
  const streams=[
    ['🇨🇼','TNCC · Hato Tower','118.300 MHz · Curaçao','https://d.liveatc.net/tncc3_twr'],
    ['🇨🇼','TNCC · Hato Approach','APP/RDR · Curaçao','https://d.liveatc.net/tncc3_rdr1'],
    ['🇦🇼','TNCA · Aruba Tower','118.000 MHz · Beatrix','https://d.liveatc.net/tnca'],
    ['🇧🇶','TNCB · Bonaire Tower','118.700 MHz · Flamingo','https://d.liveatc.net/tncb'],
  ];
  streams.forEach(([flag,label,freq,url])=>{
    const card=document.createElement('div');card.className='atc-player';
    card.innerHTML=`<button class="atc-play-btn"><span class="atc-play-icon">▶</span></button><div class="atc-info"><div class="atc-label"><span>${flag}</span>${label}</div><div class="atc-freq">${freq}</div></div><div class="atc-status"><span class="atc-status-dot"></span><span class="atc-status-text">Idle</span></div><div class="vol-row"><span style="font-size:11px;opacity:.6">🔊</span><input type="range" min="0" max="100" value="80" class="vol-slider"/></div>`;
    cont.appendChild(card);
    const btn=card.querySelector('.atc-play-btn'),icon=card.querySelector('.atc-play-icon'),txt=card.querySelector('.atc-status-text'),vol=card.querySelector('.vol-slider');
    const audio=new Audio();audio.preload='none';audio.crossOrigin='anonymous';audio.volume=0.8;
    function setState(s){card.classList.remove('loading','playing','error');if(s)card.classList.add(s);icon.textContent=s==='loading'?'◐':(s==='playing'?'■':'▶');txt.textContent=s==='loading'?'Connecting':(s==='playing'?'Live':(s==='error'?'Error':'Idle'));}
    audio.addEventListener('playing',()=>setState('playing'));
    audio.addEventListener('waiting',()=>setState('loading'));
    audio.addEventListener('pause',()=>{if(!audio.ended)setState(null);});
    audio.addEventListener('error',()=>setState('error'));
    audio.addEventListener('stalled',()=>setState('loading'));
    btn.addEventListener('click',()=>{if(audio.paused){audio.src=url+'?t='+Date.now();setState('loading');audio.play().catch(()=>setState('error'));}else{audio.pause();audio.src='';setState(null);}});
    vol.addEventListener('input',()=>audio.volume=vol.value/100);
  });
}

/* ── WEATHER (KNMI Bonaire scrape) ── */

/* Parse the KNMI Bonaire page HTML into a label→{value,extra} map */
function parseKnmiBonaire(raw){
  if(!raw) return null;
  // Proxies may HTML-entity-encode the markup — decode first.
  var html=String(raw)
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  // Strip <script>/<style> blocks entirely so embedded JS/CSS source can
  // never leak through the tag-stripped fallback parser below as if it
  // were page data.
  html=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ');
  var out={};
  var tm=html.match(/Bonaire<br\s*\/?>([^<]+UTC)/i);
  if(tm) out.time=tm[1].trim();
  // PRIMARY: parse the HTML table rows
  var rowRe=/<td[^>]*>\s*<smalli>\s*([^<]+?)\s*<\/td>\s*<th[^>]*>\s*<center>\s*([^<]+?)\s*(?:<smalli>\s*([^<]*?)\s*(?:<\/smalli>)?)?\s*<\/th>/gi;
  var m;
  while((m=rowRe.exec(html))!==null){
    var label=m[1].replace(/&deg;/g,'°').replace(/\s+/g,' ').trim();
    var value=(m[2]||'').replace(/&nbsp;/g,' ').trim();
    var extra=(m[3]||'').replace(/[()%]/g,'').trim();
    out[label]={value:value,extra:extra};
  }
  if(Object.keys(out).filter(function(k){return k!=='time';}).length>=3) return out;
  // FALLBACK: tag-stripped text (e.g. Jina markdown)
  var text=html.replace(/<[^>]+>/g,' ').replace(/&deg;/g,'°').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  var pairs=[
    ['Winddirection','Winddirection (Sector/deg)', /Winddirection[^A-Za-z]*\(?Sector\/deg\)?\s*([NESW]{1,3})\s*\(?\s*(\d{1,3})/i, true],
    ['Windspeed','Windspeed (m/s)', /Windspeed\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Gusts','Gusts (m/s)', /Gusts\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Cloud','Cloud cover (Octa / %)', /Cloud cover\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Radiation','Radiation (W/m2)', /Radiation\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Precipitation','Precipitation (mm/10 min)', /Precipitation\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Relative','Relative humidity (%)', /Relative humidity\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Temperature','Temperature (°C)', /Temperature\s*(?:\([^)]*\))?[^\d(-]{0,12}(-?[\d.]+)/i],
    ['Dewpoint','Dewpoint temperature (°C)', /Dewpoint(?:\s+temperature)?\s*(?:\([^)]*\))?[^\d(-]{0,12}(-?[\d.]+)/i],
    ['Visibility','Visibility (m)', /Visibility\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i],
    ['Pressure','Pressure (hPa)', /Pressure\s*(?:\([^)]*\))?[^\d(-]{0,12}([\d.]+)/i]
  ];
  pairs.forEach(function(p){
    var mm=text.match(p[2]);
    if(mm){
      if(p[3]) out[p[1]]={value:mm[1],extra:mm[2]||''};
      else out[p[1]]={value:mm[1],extra:''};
    }
  });
  if(!out.time){
    var tt=text.match(/Bonaire\s+([A-Za-z]{3},?\s+\d{1,2}\s+\w+\s+\d{4}\s+[\d:]+\s*UTC)/);
    if(tt) out.time=tt[1].trim();
  }
  return out;
}

/* Build the tile grid HTML for the KNMI current-observation section */