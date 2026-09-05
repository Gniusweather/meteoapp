
function sanitize(t){
  if(!t)return'';
  return String(t).split('\n').map(l=>l.trim()).filter(l=>{
    if(/^\s*URL\s*Source\s*:/i.test(l))return false;
    if(/^\s*Published\s*Time\s*:/i.test(l))return false;
    if(/^\s*Markdown\s*Content\s*:/i.test(l))return false;
    if(/^https?:\/\//i.test(l))return false;
    return l.length>0;
  }).join('\n');
}
function parseTaf(rawText){
  if(!rawText)return null;
  const full=rawText.replace(/\r?\n/g,' ').replace(/\s{2,}/g,' ').trim();
  const valid=(full.match(/\b(\d{4}\/\d{4})\b/)||[])[1]||'--';
  const RE=/\b(TEMPO|BECMG|PROB\d{2}(?:\s+TEMPO)?|FM\d{6})\b/g;
  const sp=[];let m;
  while((m=RE.exec(full))!==null)sp.push({idx:m.index,kw:m[1]});
  const base=parseTafSeg(full.slice(0,sp.length?sp[0].idx:full.length));
  const changes=[];
  for(let i=0;i<sp.length;i++){
    const{idx,kw}=sp[i];
    const segEnd=i+1<sp.length?sp[i+1].idx:full.length;
    const body=full.slice(idx+kw.length,segEnd).trim();
    const seg=parseTafSeg(body);
    let type='TEMPO',label=kw;
    if(/^FM/.test(kw)){type='FM';const h=kw.slice(4,8);label=`FM ${h.slice(0,2)}:${h.slice(2)}`;}
    else if(/^BECMG/.test(kw)){type='BECMG';label='BECMG';}
    else if(/^PROB\d{2}\s+TEMPO/.test(kw)){type='TEMPO';}
    else if(/^PROB\d{2}/.test(kw)){type='PROB';}
    const pm=body.match(/^(\d{4}\/\d{4})/);
    changes.push({type,label,period:pm?pm[1]:'',...seg});
  }
  return{valid,base,changes,rawFull:full};
}

/* ── TAF BUILD ── */
var tafTbody=$('taf');
function buildTafTable(){
  if(!tafTbody)return;
  tafTbody.innerHTML='';
  TAF_ICAOS.forEach(icao=>{
    const tr=document.createElement('tr');
    tr.dataset.icao=icao;tr.dataset.tafBase='1';
    tr.innerHTML=`<td class="station"><span class="icao-flag">${ICAO_FLAGS[icao]||''}</span>${icao}</td><td>--</td><td>--</td><td>--</td><td>--</td><td>--</td>`;
    const rr=document.createElement('tr');rr.className='taf-raw-row';rr.dataset.icao=icao;
    rr.innerHTML='<td colspan="6"><span class="taf-raw-text"></span></td>';
    tafTbody.appendChild(tr);tafTbody.appendChild(rr);
  });
}
function applyTafAlerts(tds,seg){
  [2,3,4,5].forEach(i=>tds[i].classList.remove('alert','cloud-critical','wx-critical'));
  if(/G\d{2,3}KT/i.test(seg.windBase))tds[2].classList.add('alert');
  if(!isNaN(seg.visN)&&seg.visN<=5000)tds[3].classList.add('alert');
  if(isWxCrit(seg.wx))tds[4].classList.add('alert','wx-critical');
  if(isCB(seg.cld))tds[5].classList.add('cloud-critical');
}
function renderTafRow(icao,rawText){
  if(!rawText||!tafTbody)return;
  const parsed=parseTaf(sanitize(rawText));if(!parsed)return;
  cacheSet('t_'+icao,rawText);
  const tr=tafTbody.querySelector(`tr[data-taf-base][data-icao="${icao}"]`);if(!tr)return;
  const tds=tr.querySelectorAll('td');
  tds[1].textContent=parsed.valid;tds[2].textContent=parsed.base.wind;
  tds[3].textContent=parsed.base.vis;tds[4].textContent=parsed.base.wx;
  tds[5].textContent=parsed.base.cld;
  applyTafAlerts(tds,parsed.base);
  const rr=tafTbody.querySelector(`tr.taf-raw-row[data-icao="${icao}"]`);
  if(rr){const s=rr.querySelector('.taf-raw-text');if(s)s.textContent=parsed.rawFull;}
  tafTbody.querySelectorAll(`tr.taf-change-row[data-icao="${icao}"]`).forEach(r=>r.remove());
  parsed.changes.forEach(ch=>{
    const cr=document.createElement('tr');cr.className=`taf-change-row type-${ch.type}`;cr.dataset.icao=icao;
    cr.innerHTML=`<td>${ch.label}</td><td>${ch.period||'--'}</td><td>${ch.wind}</td><td>${ch.vis}</td><td>${ch.wx}</td><td>${ch.cld}</td>`;
    applyTafAlerts(cr.querySelectorAll('td'),ch);
    if(rr)tafTbody.insertBefore(cr,rr);else tafTbody.appendChild(cr);
  });
}
async function loadTaf(icao){
  const out=await fetchRetry(TAF_TPL.replace('{ICAO}',icao));
  if(out.ok)renderTafRow(icao,out.text);
}
async function loadAllTafs(){
  TAF_ICAOS.forEach(icao=>{const c=cacheGet('t_'+icao);if(c)renderTafRow(icao,c);});
  await Promise.all(TAF_ICAOS.map(loadTaf));
  const e=$('taf-updated');if(e)e.textContent=nowStamp();
}

/* ── SYNOP ENCODER ── */
function encStnChange(){
  const v=document.getElementById('enc-stn').value;
  const wrap=document.getElementById('enc-custom-wrap');
  if(v==='custom'){wrap.style.display='';} else {wrap.style.display='none';}
  encRefreshHints();
  if(encMode==='auto') encLoadFromSynop();
  else encUpdate();
}
function encGetIIIII(){
  const v=document.getElementById('enc-stn').value;
  if(v==='custom') return (document.getElementById('enc-custom').value||'00000').padStart(5,'0');
  return v; // 78988 Hato · 78982 Beatrix · 78990 Flamingo
}
function encVV(km){
  // WMO Code Table 4377 — horizontal visibility at the surface
  const k=parseFloat(km);
  if(isNaN(k)||k<0) return '//';
  if(k<0.1) return '00';                                       // < 0.1 km
  if(k<=5) return String(Math.round(k*10)).padStart(2,'0');    // 01–50: 0.1–5.0 km in 0.1 km steps
  if(k<=30){                                                   // 56–80: 6–30 km in 1 km steps
    let kk=Math.round(k);
    if(kk<=5) return '50';                                     // 5.x rounding down (51–55 are unused)
    return String(kk+50).padStart(2,'0');
  }
  if(k<=70) return String(Math.round((k-30)/5)+80).padStart(2,'0'); // 81–88: 35–70 km in 5 km steps
  return '89';                                                 // > 70 km
}
function encT(val){
  const v=parseFloat(val);
  if(isNaN(v)) return null;
  const sn=v<0?'1':'0';
  return sn+String(Math.round(Math.abs(v)*10)).padStart(3,'0');
}
function encP(val){
  const v=parseFloat(val);
  if(isNaN(v)) return null;
  return String(Math.round(v*10)%10000).padStart(4,'0');
}
function encRRR(val){
  const v=parseFloat(val);
  if(isNaN(v)) return null;
  if(v===0) return '000';
  if(v<0.05) return '990'; // trace
  if(v<1) return String(Math.round(v*10)+990).padStart(3,'0'); // 991-999
  if(v>=989) return '989';
  return String(Math.round(v)).padStart(3,'0');
}
function encUpdate(){
  const p=n=>document.getElementById(n);
  const v=n=>p(n)?p(n).value:'';

  const yy=String(parseInt(v('enc-yy'))||0).padStart(2,'0');
  const gg=String(parseInt(v('enc-gg'))||0).padStart(2,'0');
  const iw=v('enc-iw')||'3';
  const ix=v('enc-ix')||'1';
  const ir=v('enc-ir')||'1';
  const h=v('enc-h')||'5';
  const N=v('enc-n')||'0';
  const iiiii=encGetIIIII();

  const vvCode=encVV(v('enc-vis'));

  const ddRaw=v('enc-dd');
  const ffRaw=v('enc-ff');
  const ffInt=parseInt(ffRaw);
  const vrb=p('enc-vrb')&&p('enc-vrb').checked;
  let dd='//';
  let ff='//';
  let needExt=false;
  if(ffRaw!==''&&ffInt===0){
    dd='00';                                  // calm → dd=00 regardless of direction
  }else if(vrb){
    dd='99';                                  // variable direction
  }else if(ddRaw!==''){
    const deg=parseInt(ddRaw);
    if(!isNaN(deg)){
      let t=Math.round(deg/10)%36;            // tens of degrees, 0–35
      if(t===0) t=36;                          // 360° (and 0°) → 36; never 00 for moving air
      dd=String(t).padStart(2,'0');
    }
  }
  if(ffRaw!==''){
    if(isNaN(ffInt)||ffInt<0){ff='//';}
    else if(ffInt===0){ff='00';needExt=false;}
    else{ff=ffInt>=99?'99':String(ffInt).padStart(2,'0');needExt=ffInt>=99;}
  }

  const tEnc=encT(v('enc-t'));
  const tdEnc=encT(v('enc-td'));
  const pstnEnc=encP(v('enc-pstn'));
  const pmslEnc=encP(v('enc-pmsl'));

  const aVal=v('enc-a');
  const pppRaw=v('enc-ppp');
  const rrrRaw=v('enc-rrr');
  const trVal=v('enc-tr');
  const wwVal=v('enc-ww');
  const w1Val=v('enc-w1');
  const w2Val=v('enc-w2');
  const wawaVal=v('enc-wawa');
  const wa1Val=v('enc-wa1');
  const wa2Val=v('enc-wa2');
  const rhRaw=v('enc-rh');
  const minVal=v('enc-min');
  const incl9=p('enc-incl9')&&p('enc-incl9').checked;
  const nhVal=v('enc-nh');
  const clVal=v('enc-cl');
  const cmVal=v('enc-cm');
  const chVal=v('enc-ch');
  const tmaxRaw=v('enc-tmax');
  const tminRaw=v('enc-tmin');
  const s3_5raw=v('enc-s3-5');
  const r24Raw=v('enc-r24');
  // Up to 4 Sec-3 cloud layers 8NsChshs
  const s3Clouds=[];
  for(let i=1;i<=4;i++){
    const ns=v('enc-s3-ns'+i), c=v('enc-s3-c'+i), hs=v('enc-s3-hs'+i);
    if(ns!==''&&c!==''&&hs!=='') s3Clouds.push({ns,c,hs:hs.replace(/\D/g,'').padStart(2,'0').slice(-2),i});
  }

  const groups=[];
  const bdwn=[];

  // AAXX header
  const aaxxLine=`AAXX ${yy}${gg}${iw}`;
  bdwn.push([aaxxLine, `SYNOP header · Day ${yy} · ${gg}:00Z · wind in ${iw==='3'||iw==='4'?'kn':'m/s'}`]);

  // Station
  groups.push(iiiii);
  bdwn.push([iiiii, `WMO station number`]);

  // Group 1: iRiXhVV
  const g1=ir+ix+h+vvCode;
  groups.push(g1);
  bdwn.push([g1, `iR=${ir} iX=${ix} h=${h} VV=${vvCode} → vis ${v('enc-vis')||'?'} km`]);

  // Group 2: Nddff
  let g2=N+dd+ff;
  groups.push(g2);
  const wuLabel=iw==='3'||iw==='4'?'kn':'m/s';
  const dirTxt=dd==='00'?'calm':dd==='99'?'variable':dd==='//'?'—':dd+'0°';
  bdwn.push([g2, `N=${N} dd=${dd} ff=${ff} → cover ${N}/8, dir ${dirTxt}, ${ffInt||0} ${wuLabel}`]);
  if(needExt){
    const ext='00'+String(ffInt).padStart(3,'0');
    groups.push(ext);
    bdwn.push([ext, `Wind extension: ${ffInt} ${wuLabel}`]);
  }

  // Temperature
  if(tEnc){const g='1'+tEnc;groups.push(g);bdwn.push([g,`Temperature: ${v('enc-t')}°C`]);}
  // Dew point 2SnTdTdTd — or relative humidity as 29UUU when no dew point given
  if(tdEnc){const g='2'+tdEnc;groups.push(g);bdwn.push([g,`Dew point: ${v('enc-td')}°C`]);}
  else if(rhRaw!==''){
    const rh=Math.min(100,Math.max(0,Math.round(parseFloat(rhRaw))));
    if(!isNaN(rh)){const g='29'+String(rh).padStart(3,'0');groups.push(g);bdwn.push([g,`Relative humidity: ${rh}% (29UUU, no dew point)`]);}
  }
  // Station pressure
  if(pstnEnc){const g='3'+pstnEnc;groups.push(g);bdwn.push([g,`Station pressure: ${v('enc-pstn')} hPa`]);}
  // MSL pressure (reduced to mean sea level)
  if(pmslEnc){const g='4'+pmslEnc;groups.push(g);bdwn.push([g,`MSL pressure (reduced): ${v('enc-pmsl')} hPa`]);}
  // Tendency (FM-12 5appp — ppp is absolute 1/10 hPa; sign is in a)
  if(aVal!==''&&pppRaw!==''){
    const pppNum=parseFloat(pppRaw);
    if(!isNaN(pppNum)){
      const ppp=String(Math.min(999,Math.round(Math.abs(pppNum)*10))).padStart(3,'0');
      const g='5'+aVal+ppp;
      groups.push(g);
      bdwn.push([g,`Pres tendency: char ${aVal}, change ${pppNum>=0?'+':''}${pppRaw} hPa/3h`]);
    }
  }
  // Precipitation 6RRRt — Sec 1 when iR=0 or 1; Sec 3 when iR=0 or 2
  let precipGroup=null,precipDesc='';
  if((ir==='0'||ir==='1'||ir==='2')&&rrrRaw!==''&&trVal!==''){
    const rrrCode=encRRR(rrrRaw);
    if(rrrCode){
      precipGroup='6'+rrrCode+trVal;
      const pDesc=['','6h','12h','18h','24h','1h','2h','3h','9h','15h'][parseInt(trVal)]||trVal+'h';
      precipDesc=`Precipitation: ${rrrRaw} mm / ${pDesc}`;
    }
  }
  if(precipGroup&&(ir==='0'||ir==='1')){groups.push(precipGroup);bdwn.push([precipGroup,precipDesc+(ir==='0'?' (Sec 1)':'')]);}
  // Present & past weather 7wwW1W2 (manned) or 7wawaWa1Wa2 (automatic).
  // Automatic stations (iX 4/5/7) use Table 4680 (wawa) + Table 4531 (Wa).
  const isAuto=ix==='4'||ix==='5'||ix==='7';
  const wxMode=document.getElementById('enc-wx-mode');
  const mannedBox=document.getElementById('enc-wx-manned');
  const autoBox=document.getElementById('enc-wx-auto');
  if(mannedBox)mannedBox.style.display=isAuto?'none':'';
  if(autoBox)autoBox.style.display=isAuto?'':'none';
  if(wxMode)wxMode.textContent=isAuto?'automatic · wawa (Table 4680)':'manned · ww (Table 4677)';
  // ww group is included for iX 1 (manned) and iX 4 (automatic with weather)
  if(ix==='1'&&wwVal!==''&&w1Val!==''&&w2Val!==''){
    const g='7'+wwVal.padStart(2,'0')+w1Val+w2Val;
    groups.push(g);
    bdwn.push([g,`ww=${wwVal} W1=${w1Val} W2=${w2Val} (manned)`]);
  }else if(ix==='4'&&wawaVal!==''&&wa1Val!==''&&wa2Val!==''){
    const g='7'+wawaVal.padStart(2,'0')+wa1Val+wa2Val;
    groups.push(g);
    bdwn.push([g,`wawa=${wawaVal} Wa1=${wa1Val} Wa2=${wa2Val} (automatic)`]);
  }
  // Cloud types
  if(nhVal!==''&&clVal!==''&&cmVal!==''&&chVal!==''){
    const g='8'+nhVal+clVal+cmVal+chVal;
    groups.push(g);
    bdwn.push([g,`Nh=${nhVal} CL=${clVal} CM=${cmVal} CH=${chVal}`]);
  }
  // Time of observation 9GGgg (exact hour + minutes)
  if(incl9){
    const ggm=String(Math.min(59,Math.max(0,parseInt(minVal)||0))).padStart(2,'0');
    const g='9'+gg+ggm;
    groups.push(g);
    bdwn.push([g,`Obs time: ${gg}:${ggm} UTC`]);
  }

  // Section 3 — order follows FM-12 / 78988 practice:
  // 1SnTxTxTx  2SnTnTnTn  5jjjjj  6RRRt  7R24R24R24R24  8NsChshs
  const sec3=[];
  const s3bdwn=[];
  const tmaxEnc=encT(tmaxRaw);
  const tminEnc=encT(tminRaw);
  if(tmaxEnc){const g='1'+tmaxEnc;sec3.push(g);s3bdwn.push([g,`T max: ${tmaxRaw}°C`]);}
  if(tminEnc){const g='2'+tminEnc;sec3.push(g);s3bdwn.push([g,`T min: ${tminRaw}°C`]);}
  // Supplementary group 5jjjjj (regional / national — e.g. 59001 at 78988)
  if(s3_5raw!==''){
    const j4=s3_5raw.replace(/\D/g,'').padStart(4,'0').slice(-4);
    if(j4.length===4){
      const g='5'+j4;
      sec3.push(g);
      s3bdwn.push([g,`Sec 3 group 5 (suppl./regional): ${j4}`]);
    }
  }
  // Precip in Sec 3 when iR=0 or iR=2
  if(precipGroup&&(ir==='0'||ir==='2')){sec3.push(precipGroup);s3bdwn.push([precipGroup,precipDesc+(ir==='0'?' (Sec 3)':'' )]);}
  // 24-hour precipitation total 7R24R24R24R24
  if(r24Raw!==''){
    const r24=parseFloat(r24Raw);
    if(!isNaN(r24)){
      let r24code;
      if(r24===0) r24code='0000';
      else if(r24<1) r24code=String(Math.round(r24*10)+9900).padStart(4,'0'); // rare; usually whole mm
      else r24code=String(Math.min(9999,Math.round(r24))).padStart(4,'0');
      const g='7'+r24code;
      sec3.push(g);
      s3bdwn.push([g,`24 h precip: ${r24Raw} mm`]);
    }
  }
  // Cloud layers 8NsChshs (up to 4 — significant cloud, common on 78988)
  s3Clouds.forEach(cl=>{
    const g='8'+cl.ns+cl.c+cl.hs;
    sec3.push(g);
    s3bdwn.push([g,`Cloud layer ${cl.i}: Ns=${cl.ns} C=${cl.c} hshs=${cl.hs}`]);
  });

  let body=groups.join(' ');
  if(sec3.length){body+=' 333 '+sec3.join(' ');bdwn.push(['333','Section 3 separator']);s3bdwn.forEach(r=>bdwn.push(r));}
  body+='=';

  const full=aaxxLine+'\n'+body;
  const outEl=document.getElementById('enc-out');
  const bdwnEl=document.getElementById('enc-bdwn');
  if(outEl) outEl.textContent=full;
  if(bdwnEl){
    bdwnEl.innerHTML=bdwn.map(([code,desc])=>`<div class="enc-row"><span class="enc-row-code">${escHtml(code)}</span><span class="enc-row-desc">${escHtml(desc)}</span></div>`).join('');
  }

  // Encode↔decode cross-check: round-trip the generated bulletin through the
  // same decoder the app uses for live SYNOPs, and echo the key values back.
  const verEl=document.getElementById('enc-verify');
  if(verEl){
    try{
      const parsed=parseSynopBulletin(full);
      const r=parsed.reports&&parsed.reports[0];
      if(r){
        const rows=[];
        if(r.visText) rows.push(`Vis <b>${escHtml(r.visText)}</b>`);
        let wind=r.dir==='Calm'?'Calm':(r.dir==='VRB'?'VRB':(r.dir==null?'—':r.dir+'°'));
        if(r.windSp!=null) wind+=` @ ${r.windSp} ${parsed.windUnits}`;
        rows.push(`Wind <b>${escHtml(wind)}</b>`);
        if(r.N!=null) rows.push(`Cloud <b>${escHtml(T_N[r.N]||r.N)}</b>`);
        if(r.T!=null) rows.push(`Temp <b>${r.T}°C</b>`);
        if(r.Td!=null) rows.push(`Dew <b>${r.Td}°C</b>`);
        else if(r.RH!=null) rows.push(`RH <b>${r.RH}%</b>`);
        if(r.Pmsl!=null) rows.push(`MSLP <b>${r.Pmsl} hPa</b>`);
        else if(r.Pstn!=null) rows.push(`QFE <b>${r.Pstn} hPa</b>`);
        if(r.ww!=null) rows.push(`Wx <b>${escHtml(T_WW[r.ww]||r.ww)}</b>`);
        if(r.precip&&r.precip.amount!=null) rows.push(`Precip <b>${escHtml(String(r.precip.amount))} mm/${escHtml(r.precip.pDesc||r.precip.period||'')}</b>`);
        if(r.Tmax!=null) rows.push(`Tmax <b>${r.Tmax}°C</b>`);
        if(r.Tmin!=null) rows.push(`Tmin <b>${r.Tmin}°C</b>`);
        verEl.style.display='';
        verEl.innerHTML=`<div class="ev-hdr">✓ Decoded back — round-trip check</div>${rows.join(' &nbsp;·&nbsp; ')}`;
      }else{verEl.style.display='none';}
    }catch(e){verEl.style.display='none';}
  }
}
function encCopy(){
  const el=document.getElementById('enc-out');
  if(!el||el.textContent.startsWith('Fill')) return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=document.querySelector('#synop-sub-encode .enc-copy-btn');
    if(btn){const t=btn.textContent;btn.textContent='Copied!';setTimeout(()=>btn.textContent=t,1500);}
  }).catch(()=>{});
}
// Auto-fill current UTC time when encoder tab opens
function encInitTime(){
  const d=new Date();
  const yyEl=document.getElementById('enc-yy');
  const ggEl=document.getElementById('enc-gg');
  if(yyEl&&!yyEl.value) yyEl.value=d.getUTCDate();
  if(ggEl&&!ggEl.value) ggEl.value=d.getUTCHours();
  encUpdate();
  encRefreshHints();
}

/* ── Encoder modes, SAVE snapshot, RH & tendency helpers ── */
var encMode='local'; // 'local' | 'auto'
var ENC_SNAP_KEY='rwcapp_enc_snap_';

function encWmoToStationKey(wmo){
  const m={'78988':'tncc','78982':'tnca','78990':'tncb'};
  return m[wmo]||null;
}

/** Magnus formula → RH % from T and Td (°C) */
function encCalcRH(t,td){
  if(t==null||td==null||isNaN(t)||isNaN(td)) return null;
  const a=17.625,b=243.04;
  const es=Math.exp((a*t)/(b+t));
  const e=Math.exp((a*td)/(b+td));
  const rh=100*(e/es);
  if(!isFinite(rh)) return null;
  return Math.max(0,Math.min(100,Math.round(rh)));
}

/** Simple characteristic a from signed 3h change (hPa) */
function encCharFromDelta(d){
  if(d==null||isNaN(d)) return '';
  if(Math.abs(d)<0.1) return '4'; // steady
  if(d>0) return '2';            // rising
  return '7';                    // falling
}

function encGetSnapshot(){
  const stn=encGetIIIII();
  try{
    const s=localStorage.getItem(ENC_SNAP_KEY+stn);
    return s?JSON.parse(s):null;
  }catch(e){return null;}
}

function encSaveSnapshot(){
  const stn=encGetIIIII();
  const v=id=>document.getElementById(id)?document.getElementById(id).value:'';
  const snap={
    t:Date.now(),
    stn,
    yy:v('enc-yy'),gg:v('enc-gg'),
    pstn:v('enc-pstn'),pmsl:v('enc-pmsl'),
    temp:v('enc-t'),td:v('enc-td'),
    full:document.getElementById('enc-out')?document.getElementById('enc-out').textContent:''
  };
  try{localStorage.setItem(ENC_SNAP_KEY+stn,JSON.stringify(snap));}catch(e){}
  encRefreshHints();
  const st=document.getElementById('enc-mode-status');
  if(st) st.innerHTML=`Saved snapshot for <b>${stn}</b> at ${new Date().toUTCString().slice(17,25)}Z — next obs can compute tendency`;
  const btn=document.querySelector('#synop-sub-encode button[onclick="encSaveSnapshot()"]');
  if(btn){const t=btn.textContent;btn.textContent='SAVED';setTimeout(()=>btn.textContent=t,1200);}
}

function encRefreshHints(){
  const snap=encGetSnapshot();
  const th=document.getElementById('enc-tend-hint');
  if(th){
    if(snap&&(snap.pmsl||snap.pstn)){
      const when=snap.yy&&snap.gg?`day ${snap.yy} ${String(snap.gg).padStart(2,'0')}Z`:'earlier';
      const p=snap.pmsl||snap.pstn;
      th.textContent=`· last SAVE: ${p} hPa (${when})`;
    }else th.textContent='· no SAVE yet — press SAVE after an obs to enable auto tendency';
  }
  const rhHint=document.getElementById('enc-rh-hint');
  const t=parseFloat(document.getElementById('enc-t')?.value);
  const td=parseFloat(document.getElementById('enc-td')?.value);
  const rh=encCalcRH(t,td);
  if(rhHint) rhHint.textContent=rh!=null?`· calc ${rh}% from T/Td`:'· enter T & Td to auto-calc';
}

function encOnTempChange(){
  const t=parseFloat(document.getElementById('enc-t')?.value);
  const td=parseFloat(document.getElementById('enc-td')?.value);
  const rh=encCalcRH(t,td);
  const rhEl=document.getElementById('enc-rh');
  if(rhEl&&rh!=null) rhEl.value=rh;
  encRefreshHints();
  encUpdate();
}

function encOnPresChange(){
  // Auto-fill ppp and a from last SAVE for this station (3-hour style delta)
  const snap=encGetSnapshot();
  const pmsl=parseFloat(document.getElementById('enc-pmsl')?.value);
  const pstn=parseFloat(document.getElementById('enc-pstn')?.value);
  const cur=(!isNaN(pmsl)?pmsl:(!isNaN(pstn)?pstn:null));
  const prev=snap?(parseFloat(snap.pmsl)||parseFloat(snap.pstn)||null):null;
  const pppEl=document.getElementById('enc-ppp');
  const aEl=document.getElementById('enc-a');
  if(cur!=null&&prev!=null&&pppEl){
    const d=Math.round((cur-prev)*10)/10;
    pppEl.value=d;
    if(aEl&&!aEl.dataset.manual){
      const ch=encCharFromDelta(d);
      if(ch) aEl.value=ch;
    }
  }
  encRefreshHints();
  encUpdate();
}

function encSetMode(mode){
  encMode=mode==='auto'?'auto':'local';
  const lb=document.getElementById('enc-mode-local');
  const ab=document.getElementById('enc-mode-auto');
  if(lb) lb.style.background=encMode==='local'?'rgba(85,193,255,0.2)':'';
  if(ab) ab.style.background=encMode==='auto'?'rgba(85,193,255,0.2)':'';
  const st=document.getElementById('enc-mode-status');
  if(encMode==='auto'){
    if(st) st.textContent='Mode: AUTO — loading latest SYNOP for selected station…';
    encLoadFromSynop();
  }else{
    if(st) st.textContent='Mode: LOCAL — fill fields manually · SAVE stores pressure/time for tendency';
  }
}

function encSetVal(id,val){
  const el=document.getElementById(id);
  if(!el||val==null||val==='') return;
  el.value=val;
}

/** Apply a decoded SYNOP report (+ optional AAXX header string) into the form */
function encApplyReport(rep, rawMsg, srcLabel){
  if(!rep) return;
  const st=document.getElementById('enc-mode-status');
  const m=(rawMsg||'').match(/AAXX\s+(\d{2})(\d{2})(\d)/);
  if(m){
    encSetVal('enc-yy',parseInt(m[1],10));
    encSetVal('enc-gg',parseInt(m[2],10));
    if(m[3]) encSetVal('enc-iw',(m[3]==='3'||m[3]==='4')?m[3]:'3');
  }
  if(rep.iR!=null) encSetVal('enc-ir',rep.iR);
  if(rep.iX!=null) encSetVal('enc-ix',rep.iX);
  if(rep.h!=null) encSetVal('enc-h',rep.h);
  if(rep.N!=null) encSetVal('enc-n',rep.N);
  if(rep.visText){
    const km=parseFloat(rep.visText);
    if(!isNaN(km)) encSetVal('enc-vis',km);
  }
  if(typeof rep.dir==='number'){encSetVal('enc-dd',rep.dir);const vrb=document.getElementById('enc-vrb');if(vrb)vrb.checked=false;}
  else if(rep.dir==='VRB'){const vrb=document.getElementById('enc-vrb');if(vrb)vrb.checked=true;}
  else if(rep.dir==='Calm'){encSetVal('enc-dd',0);encSetVal('enc-ff',0);}
  if(rep.windSp!=null) encSetVal('enc-ff',rep.windSp);
  if(rep.T!=null) encSetVal('enc-t',rep.T);
  if(rep.Td!=null) encSetVal('enc-td',rep.Td);
  if(rep.RH!=null) encSetVal('enc-rh',rep.RH);
  else if(rep.T!=null&&rep.Td!=null){
    const rh=encCalcRH(rep.T,rep.Td);
    if(rh!=null) encSetVal('enc-rh',rh);
  }
  if(rep.Pstn!=null) encSetVal('enc-pstn',rep.Pstn);
  if(rep.Pmsl!=null) encSetVal('enc-pmsl',rep.Pmsl);
  if(rep.tendency){
    if(rep.tendency.a!=null) encSetVal('enc-a',String(rep.tendency.a));
    if(rep.tendency.change!=null) encSetVal('enc-ppp',rep.tendency.change);
  }else{
    encOnPresChange();
  }
  if(rep.ww!=null) encSetVal('enc-ww',rep.ww);
  if(rep.W1!=null) encSetVal('enc-w1',rep.W1);
  if(rep.W2!=null) encSetVal('enc-w2',rep.W2);
  if(rep.Nh!=null) encSetVal('enc-nh',rep.Nh);
  if(rep.CL!=null) encSetVal('enc-cl',rep.CL);
  if(rep.CM!=null) encSetVal('enc-cm',rep.CM);
  if(rep.CH!=null) encSetVal('enc-ch',rep.CH);
  if(rep.Tmax!=null) encSetVal('enc-tmax',rep.Tmax);
  if(rep.Tmin!=null) encSetVal('enc-tmin',rep.Tmin);
  if(rep.precip&&rep.precip.amount!=null){
    encSetVal('enc-rrr',rep.precip.amount);
    if(rep.precip.period!=null) encSetVal('enc-tr',rep.precip.period);
  }
  // Sec 3 extras from raw body: 5jjjj, 7R24, 8NsChshs layers
  const body=(rawMsg||'').replace(/\n/g,' ');
  const sec3=body.split(/\b333\b/)[1]||'';
  if(sec3){
    const g5=sec3.match(/\b5(\d{4})\b/);
    if(g5) encSetVal('enc-s3-5',g5[1]);
    const g7=sec3.match(/\b7(\d{4})\b/);
    if(g7&&!/^7\d{2}\d\d$/.test('7'+g7[1])){ /* 24h precip */ encSetVal('enc-r24',parseInt(g7[1],10)); }
    // Prefer pure 7R24 (all digits after 7 are amount) — set if looks like precip total
    const r24m=sec3.match(/\b7(\d{4})\b/g);
    if(r24m){
      // last 7xxxx that is not weather-like; for Sec3 7R24 is 4-digit amount
      const last=r24m[r24m.length-1].slice(1);
      const n=parseInt(last,10);
      if(!isNaN(n)) encSetVal('enc-r24',n>=9000?((n-9900)/10):n); // crude; 0000→0
      if(last==='0000') encSetVal('enc-r24',0);
    }
    const clouds=[...sec3.matchAll(/\b8(\d)(\d)(\d{2})\b/g)];
    clouds.slice(0,4).forEach((cm,idx)=>{
      const i=idx+1;
      encSetVal('enc-s3-ns'+i,cm[1]);
      encSetVal('enc-s3-c'+i,cm[2]);
      encSetVal('enc-s3-hs'+i,cm[3]);
    });
  }
  encRefreshHints();
  encUpdate();
  if(st) st.innerHTML=`Mode: ${encMode.toUpperCase()} — <b>${escHtml(srcLabel||'source')}</b> · T ${rep.T??'—'}° · Td ${rep.Td??'—'}° · QNH ${rep.Pmsl??'—'}`;
}

/** Parse latest message from Ogimet getsynop CSV or HTML page */
function encParseOgimetText(text, wmo){
  if(!text) return null;
  // CSV lines: WMO_ID,ANO,MES,DIA,HORA,MINUTO,PARTE
  const lines=String(text).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let best=null;
  for(const ln of lines){
    if(!ln.includes(wmo)) continue;
    // CSV
    const parts=ln.split(',');
    if(parts.length>=7&&parts[0]===wmo){
      const msg=parts.slice(6).join(',').trim();
      if(/AAXX/i.test(msg)) best=msg; // keep last (latest)
    }
    // free text with AAXX
    const m=ln.match(/AAXX\s+\d{5}[\s\S]*?=/);
    if(m) best=m[0].replace(/\s+/g,' ').trim();
  }
  // HTML page: <pre>AAXX...</pre> + <pre>78988 ...=</pre>
  if(!best&&/<pre/i.test(text)){
    const pres=[...String(text).matchAll(/<pre>([\s\S]*?)<\/pre>/gi)].map(x=>x[1].replace(/\s+/g,' ').trim());
    let aaxx=pres.find(p=>/^AAXX\s+\d{5}/i.test(p));
    let body=pres.find(p=>new RegExp('^'+wmo+'\\b').test(p));
    if(aaxx&&body) best=aaxx+' '+body;
    else if(body&&/AAXX/i.test(body)) best=body;
  }
  // whole-text AAXX ... =
  if(!best){
    const m=String(text).match(new RegExp('AAXX\\s+\\d{5}[\\s\\S]{0,20}'+wmo+'[\\s\\S]*?='));
    if(m) best=m[0].replace(/\s+/g,' ').trim();
  }
  return best;
}

function encOgimetUrls(wmo){
  const end=new Date();
  const begin=new Date(end.getTime()-36*3600*1000);
  const fmt=d=>d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0')+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0');
  const urls=[];
  // Primary: Ogimet getsynop CSV for this WMO block
  urls.push(`https://www.ogimet.com/cgi-bin/getsynop?block=${encodeURIComponent(wmo)}&begin=${fmt(begin)}&end=${fmt(end)}&header=yes`);
  // User-requested Curaçao latest HTML page (78988)
  if(wmo==='78988'){
    urls.push('https://www.ogimet.com/ultimos_synops2.php?estado=Cura&fmt=html&Enviar=Ver');
  }
  return urls;
}

/** Fill encoder form from Ogimet (preferred) or in-app SYNOP cache */
async function encLoadFromSynop(){
  const wmo=encGetIIIII();
  const st=document.getElementById('enc-mode-status');
  if(st) st.textContent='AUTO: fetching Ogimet SYNOP for '+wmo+'…';

  // 1) Ogimet
  try{
    const urls=encOgimetUrls(wmo);
    for(const url of urls){
      const out=await fetchRetry(url);
      if(!out.ok||!out.text) continue;
      const msg=encParseOgimetText(out.text,wmo);
      if(!msg) continue;
      const parsed=parseSynopBulletin(msg.includes('AAXX')?msg:('AAXX 00000\n'+msg));
      const rep=parsed.reports&&parsed.reports[0];
      if(rep){
        encApplyReport(rep,msg,'Ogimet '+wmo);
        return;
      }
    }
  }catch(e){console.error('ogimet auto',e);}

  // 2) Fallback: in-app NOAA TGFTP cache
  const key=encWmoToStationKey(wmo);
  const data=key&&typeof synopStationData!=='undefined'?synopStationData[key]:null;
  if(data){
    let rep=null,srcLabel='',raw='';
    const order=Object.keys(data).sort((a,b)=>(a.includes('-sm')?0:1)-(b.includes('-sm')?0:1));
    for(const k of order){
      const d=data[k];
      if(d&&d.parsed&&d.parsed.reports&&d.parsed.reports.length){
        rep=d.parsed.reports[0];srcLabel=k;raw=d.rawText||'';break;
      }
    }
    if(rep){encApplyReport(rep,raw,srcLabel);return;}
  }else if(key&&typeof loadAllSynops==='function'){
    if(st) st.textContent='AUTO: loading NOAA SYNOP cache…';
    loadAllSynops().then(()=>encLoadFromSynop());
    return;
  }
  if(st) st.innerHTML=`AUTO: no SYNOP found for <b>${escHtml(wmo)}</b> — try <a href="https://www.ogimet.com/ultimos_synops2.php?estado=Cura&fmt=html&Enviar=Ver" target="_blank">Ogimet Curaçao</a>`;
}

// Highlight mode buttons on load
setTimeout(()=>{try{encSetMode('local');}catch(e){}},0);

window.encUpdate=encUpdate;
window.encStnChange=encStnChange;
window.encCopy=encCopy;
window.encInitTime=encInitTime;
window.encSetMode=encSetMode;
window.encSaveSnapshot=encSaveSnapshot;
window.encLoadFromSynop=encLoadFromSynop;
window.encOnTempChange=encOnTempChange;
window.encOnPresChange=encOnPresChange;

/* Filter lesson cards by free text */
function lessonSearch(q){
  q=(q||'').trim().toLowerCase();
  const cards=document.querySelectorAll('#lessons-sub-guide .lsn-card, #lessons-sub-guide .lsn-pubs');
  const idx=document.querySelector('#lessons-sub-guide .lsn-idx');
  let shown=0;
  cards.forEach(c=>{
    const match=!q||c.textContent.toLowerCase().indexOf(q)>=0;
    c.style.display=match?'':'none';
    if(match)shown++;
  });
  if(idx)idx.style.display=q?'none':'';
  const none=document.getElementById('lsn-search-none');
  if(none)none.style.display=(q&&shown===0)?'':'none';
}
window.lessonSearch=lessonSearch;

/* ── SYNOP WMO FM-12 ── */
var T_WW={'00':'No significant cloud','01':'Clouds dissolving','02':'Sky unchanged','03':'Clouds developing','04':'Smoke haze','05':'Haze','06':'Dust in suspension','07':'Dust raised by wind','08':'Dust/sand whirl','09':'Duststorm in sight','10':'Mist','11':'Shallow fog patches','12':'Continuous shallow fog','13':'Lightning, no thunder','14':'Precip not reaching ground','15':'Distant precip','16':'Precip near, not at station','17':'Thunderstorm, no precip','18':'Squalls','19':'Funnel cloud','20':'Drizzle/snow (past hr)','21':'Rain (past hr)','22':'Snow (past hr)','23':'Rain & snow (past hr)','24':'Freezing precip (past hr)','25':'Rain showers (past hr)','26':'Snow showers (past hr)','27':'Hail showers (past hr)','28':'Fog (past hr)','29':'Thunderstorm (past hr)','30':'Slight duststorm↓','31':'Slight duststorm=','32':'Slight duststorm↑','33':'Severe duststorm↓','34':'Severe duststorm=','35':'Severe duststorm↑','36':'Slight drifting snow','37':'Heavy drifting snow','38':'Slight blowing snow','39':'Heavy blowing snow','40':'Fog at distance','41':'Fog patches','42':'Fog thinning, sky vis','43':'Fog thinning, sky obs','44':'Fog, sky vis, no change','45':'Fog, sky obs, no change','46':'Fog thickening, sky vis','47':'Fog thickening, sky obs','48':'Fog + rime, sky vis','49':'Fog + rime, sky obs','50':'Drizzle slight intermit','51':'Drizzle slight cont','52':'Drizzle mod intermit','53':'Drizzle mod cont','54':'Drizzle heavy intermit','55':'Drizzle heavy cont','56':'Freezing drizzle slight','57':'Freezing drizzle mod/heavy','58':'Drizzle + rain slight','59':'Drizzle + rain mod/heavy','60':'Rain slight intermit','61':'Rain slight cont','62':'Rain mod intermit','63':'Rain mod cont','64':'Rain heavy intermit','65':'Rain heavy cont','66':'Freezing rain slight','67':'Freezing rain mod/heavy','68':'Rain + snow slight','69':'Rain + snow mod/heavy','70':'Snow slight intermit','71':'Snow slight cont','72':'Snow mod intermit','73':'Snow mod cont','74':'Snow heavy intermit','75':'Snow heavy cont','76':'Diamond dust','77':'Snow grains','78':'Ice crystals','79':'Ice pellets','80':'Rain shower slight','81':'Rain shower mod/heavy','82':'Rain shower violent','83':'Rain+snow shower slight','84':'Rain+snow shower mod/heavy','85':'Snow shower slight','86':'Snow shower mod/heavy','87':'Snow/ice pellet shower slight','88':'Snow/ice pellet shower mod/heavy','89':'Hail shower slight','90':'Hail shower mod/heavy','91':'TS slight rain','92':'TS mod/heavy rain','93':'TS slight snow/hail','94':'TS mod/heavy snow/hail','95':'TS slight/mod rain/snow','96':'TS slight/mod hail','97':'TS heavy rain/snow','98':'TS + duststorm','99':'TS heavy hail'};
var T_W={'0':'Cloud ≤½','1':'Cloud >½ part','2':'Cloud >½ all','3':'Sandstorm/blowing snow','4':'Fog/thick haze','5':'Drizzle','6':'Rain','7':'Snow/rain+snow','8':'Showers','9':'Thunderstorm'};
var T_CL={'0':'No CL','1':'Cu humilis/fractus','2':'Cu med/congestus','3':'Cb calvus','4':'Sc from Cu','5':'Sc not from Cu','6':'St or St fractus','7':'Fractus bad wx','8':'Cu+Sc diff levels','9':'Cb capillatus'};
var T_CM={'0':'No CM','1':'As translucidus','2':'As opacus/Ns','3':'Ac translucidus','4':'Ac patches','5':'Ac in bands','6':'Ac from Cu/Cb','7':'Ac double layer','8':'Ac castellanus','9':'Ac chaotic'};
var T_CH={'0':'No CH','1':'Ci fibratus','2':'Ci spissatus','3':'Ci from Cb','4':'Ci increasing','5':'Ci+Cs <45°','6':'Ci+Cs >45°','7':'Cs whole sky','8':'Cs partial','9':'Cc'};
var T_N={'0':'SKC','1':'1/8','2':'2/8','3':'3/8','4':'4/8','5':'5/8','6':'6/8','7':'7/8','8':'OVC','9':'Obscured','/':'—'};
var T_H={'0':'0–50m','1':'50–100m','2':'100–200m','3':'200–300m','4':'300–600m','5':'600–1000m','6':'1000–1500m','7':'1500–2000m','8':'2000–2500m','9':'≥2500m'};
var T_A={'0':'Rising then falling','1':'Rising then steady','2':'Rising','3':'Falling then rising','4':'Steady','5':'Falling then rising (lower)','6':'Falling then steady','7':'Falling','8':'Steady/rising then falling'};
var T_TR={'1':'6h','2':'12h','3':'18h','4':'24h','5':'1h','6':'2h','7':'3h','8':'9h','9':'15h'};
