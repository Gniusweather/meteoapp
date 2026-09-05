
function buildKnmiGridHtml(parsed){
  if(!parsed) return null;
  var FIELDS=[
    {match:'Temperature (',     lbl:'Temperature', unit:'°C'},
    {match:'Dewpoint',          lbl:'Dew Point',   unit:'°C'},
    {match:'Relative humidity', lbl:'Humidity',    unit:'%'},
    {match:'Winddirection',     lbl:'Wind Dir',    unit:'', dirExtra:true},
    {match:'Windspeed',         lbl:'Wind Speed',  unit:'kt', msToKt:true},
    {match:'Gusts',             lbl:'Gusts',       unit:'kt', msToKt:true},
    {match:'Cloud cover',       lbl:'Cloud Cover', unit:'octa'},
    {match:'Radiation',         lbl:'Solar Rad',   unit:'W/m²'},
    {match:'Visibility',        lbl:'Visibility',  unit:'km', mToKm:true},
    {match:'Precipitation',     lbl:'Precip',      unit:'mm/10m'},
    {match:'Pressure',          lbl:'Pressure',    unit:'hPa'}
  ];
  function findKey(sub){ for(var k in parsed){ if(k.indexOf(sub)>=0) return k; } return null; }
  var html='<div class="knmi-station">🇧🇶 Bonaire (KNMI)'+(parsed.time?' · '+parsed.time:'')+'</div>';
  var shown=0;
  FIELDS.forEach(function(f){
    var key=findKey(f.match);
    if(!key) return;
    var rec=parsed[key];
    if(!rec||rec.value===undefined||rec.value==='') return;
    var disp=rec.value, unit=f.unit;
    var num=parseFloat(rec.value);
    if(f.msToKt&&isFinite(num)) disp=Math.round(num*1.94384);
    else if(f.mToKm&&isFinite(num)) disp=(num/1000).toFixed(2);
    if(f.dirExtra){ disp=rec.value+(rec.extra?' '+rec.extra+'°':''); unit=''; }
    var dnum=parseFloat(disp), colorClass='';
    function band(v,warnLo,badLo,warnHi,badHi){
      if(!isFinite(v)) return '';
      if((badLo!=null&&v<=badLo)||(badHi!=null&&v>=badHi)) return 'knmi-bad';
      if((warnLo!=null&&v<=warnLo)||(warnHi!=null&&v>=warnHi)) return 'knmi-warn';
      return '';
    }
    switch(f.lbl){
      case 'Temperature': colorClass=band(dnum,22,18,32,35); break;
      case 'Dew Point':   colorClass=band(dnum,null,null,24,26); break;
      case 'Humidity':    colorClass=band(dnum,35,25,85,92); break;
      case 'Wind Speed':  colorClass=band(dnum,null,null,22,33); break;
      case 'Gusts':       colorClass=band(dnum,null,null,28,40); break;
      case 'Pressure':    colorClass=band(dnum,1009,1005,1018,1021); break;
      case 'Precip':      colorClass=band(dnum,null,null,1,5); break;
      case 'Visibility':  colorClass=band(dnum,5,2,null,null); break;
      case 'Cloud Cover': colorClass=band(dnum,null,null,7,null); break;
    }
    html+='<div class="knmi-tile '+colorClass+'"><div class="knmi-tile-lbl">'+f.lbl+'</div>'+
          '<div class="knmi-tile-val">'+disp+(unit?' <small>'+unit+'</small>':'')+'</div></div>';
    shown++;
  });
  return shown?html:null;
}

/* Marine: KNMI page is a multi-day table + prose (not Current-style key/value). */
function parseKnmiMarine(raw){
  if(!raw) return null;
  var html=String(raw).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&deg;/g,'°').replace(/&#176;/g,'°');
  html=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  var text=html.replace(/<\s*br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi,'\n').replace(/<[^>]+>/g,' ');
  text=text.replace(/[ \t]+/g,' ').replace(/\n+/g,'\n');
  var out={text:'',waves:null};
  // Capture prose outlook near "Waves:" or "Partly cloudy"
  var wm=text.match(/Waves?\s*:\s*([^\n]{5,160})/i);
  if(wm) out.waves=wm[1].replace(/\s+/g,' ').trim().replace(/\.\s*$/,'');
  // Also "around N ft" wave height lines
  if(!out.waves){
    var wm2=text.match(/(?:mainly\s+)?(?:moderate|slight|rough|high)[^\n.]{0,40}(?:around\s+)?\d+(?:\.\d+)?\s*ft/i);
    if(wm2) out.waves=wm2[0].replace(/\s+/g,' ').trim();
  }
  var prose=text.match(/((?:Partly|Mostly)\s+cloudy[^\n]{10,200}?force\s+\d[^.]*\.)/i);
  if(prose) out.text=prose[1].replace(/\s+/g,' ').trim();
  else{
    var p2=text.match(/((?:Partly|Mostly|Cloudy|Sunny|Fair)[^]{20,280}?(?:kt|force\s+\d)[^.]*\.)/i);
    if(p2) out.text=p2[1].replace(/\s+/g,' ').trim();
  }
  // English daily table headers "Max. Temperature"
  var days=[];
  var hdr=html.match(/Max\.\s*Temperature[\s\S]{0,80}/i);
  // Extract sequences of 6 day numbers after Max Temperature row
  var maxRow=html.match(/Max\.\s*Temperature<\/th>([\s\S]*?)<\/tr>/i);
  var minRow=html.match(/(?:Min\.\s*Temperature|Temperatura minimo)<\/th>([\s\S]*?)<\/tr>/i);
  var windRow=html.match(/(?:Wind|Bientu)<\/th>([\s\S]*?)<\/tr>/i);
  function cells(rowHtml){
    if(!rowHtml) return [];
    var a=[],re=/<td[^>]*>([\s\S]*?)<\/td>/gi,m;
    while((m=re.exec(rowHtml))&&a.length<6){
      var t=m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      a.push(t);
    }
    return a;
  }
  var maxs=cells(maxRow?maxRow[1]:'');
  var mins=cells(minRow?minRow[1]:'');
  // Day labels from first English date row
  var dateRow=html.match(/<td>\s*(Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\s+\d{1,2},\s*\d{4}\s*<\/td>/i);
  var dateCells=[];
  var dr=html.match(/(?:Max\.\s*Temperature[\s\S]*?)^/i);
  // simpler: pull first 6 "Mon DD, YYYY" style from English block
  var dre=/(Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\s+(\d{1,2}),\s*(\d{4})/gi,dm;
  while((dm=dre.exec(html))&&dateCells.length<6) dateCells.push(dm[1]+' '+dm[2]);
  for(var i=0;i<Math.max(maxs.length,dateCells.length)&&i<6;i++){
    days.push({day:dateCells[i]||('D+'+(i+1)), tmax:maxs[i]||'—', tmin:mins[i]||'—'});
  }
  out.days=days;
  return (out.text||out.waves||days.length)?out:null;
}

function buildKnmiMarineHtml(parsed){
  // Legacy path: Current-style key/value (rarely used by ?Marine now)
  if(!parsed) return null;
  var html='<div class="knmi-station">🇧🇶 Bonaire Marine (KNMI)'+(parsed.time?' · '+parsed.time:'')+'</div>';
  var shown=0;
  for(var key in parsed){
    if(key==='time'||key==='text'||key==='waves'||key==='days') continue;
    var rec=parsed[key];
    if(!rec||rec.value===undefined||rec.value==='') continue;
    var lbl=key.replace(/\s*\([^)]*\)\s*$/,'').trim();
    var unitM=key.match(/\(([^)]*)\)\s*$/);
    var unit=unitM?unitM[1]:'';
    var disp=rec.value;
    var num=parseFloat(rec.value);
    if(/wind\s*speed|gust/i.test(key)&&isFinite(num)){disp=Math.round(num*1.94384);unit='kt';}
    if(/winddirection/i.test(key)){disp=rec.value+(rec.extra?' '+rec.extra+'°':'');unit='';}
    html+='<div class="knmi-tile"><div class="knmi-tile-lbl">'+escHtml(lbl)+'</div>'+
          '<div class="knmi-tile-val">'+escHtml(String(disp))+(unit?' <small>'+escHtml(unit)+'</small>':'')+'</div></div>';
    shown++;
  }
  return shown?html:null;
}

function avgNums(arr){
  var v=arr.filter(function(x){return x!=null&&isFinite(x);});
  if(!v.length) return null;
  return v.reduce(function(a,b){return a+b;},0)/v.length;
}
function dirAvg(degs){
  var v=degs.filter(function(x){return x!=null&&isFinite(x);});
  if(!v.length) return null;
  var x=0,y=0;
  v.forEach(function(d){var r=d*Math.PI/180;x+=Math.cos(r);y+=Math.sin(r);});
  var a=Math.atan2(y/v.length,x/v.length)*180/Math.PI;
  if(a<0) a+=360;
  return Math.round(a);
}
function kmhToKt(kmh){return kmh==null?null:Math.round(kmh*0.539957);}

/** Weather icon from PoP + precip + temp (simple Caribbean-tuned) */
function wxIcon(pop,precip,tmax){
  var p=pop||0, r=precip||0, t=tmax||30;
  if(r>=5||p>=70) return '🌧';
  if(r>=1||p>=40) return '🌦';
  if(p>=20) return '⛅';
  if(t>=33) return '🔥';
  return '☀️';
}
function dirArrow(deg){
  if(deg==null||!isFinite(deg)) return '';
  var dirs=['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(((deg%360)/45))%8];
}
function dayLabel(iso,i){
  try{
    var dt=new Date(iso+'T12:00:00Z');
    var names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var tag=i===0?'Today':(i===1?'Tomorrow':names[dt.getUTCDay()]);
    return tag+' · '+iso.slice(5);
  }catch(e){return iso.slice(5);}
}

/** Build consensus forecast HTML from Open-Meteo multi-model daily JSON */
function buildConsensusHtml(data){
  if(!data||!data.daily||!data.daily.time) return null;
  var d=data.daily;
  // knmi_seamless ≈ KNMI HARMONIE suite; meteofrance_seamless ≈ MF AROME suite (Open-Meteo seamless blends)
  var models=[
    {id:'gfs_seamless',label:'GFS',core:true},
    {id:'icon_seamless',label:'ICON',core:true},
    {id:'ecmwf_ifs025',label:'ECMWF',core:true},
    {id:'knmi_seamless',label:'HARMONIE',core:true,title:'KNMI seamless (HARMONIE suite)'},
    {id:'meteofrance_seamless',label:'AROME',core:true,title:'Météo-France seamless (AROME suite)'}
  ];
  var days=d.time.slice(0,5);
  var html='';
  html+='<div class="wx-model-badges">'+
    '<span class="wx-model-badge">GFS</span>'+
    '<span class="wx-model-badge">ICON</span>'+
    '<span class="wx-model-badge">ECMWF</span>'+
    '<span class="wx-model-badge" title="KNMI seamless / HARMONIE suite">HARMONIE</span>'+
    '<span class="wx-model-badge" title="Météo-France seamless / AROME suite">AROME</span></div>';
  html+='<p class="wx-model-note">Consensus = mean of <b>GFS · ICON · ECMWF · HARMONIE (KNMI) · AROME (MF)</b>. Regional Caribbean domains may differ slightly from these seamless blends.</p>';

  // Day cards strip
  html+='<div class="wx-cons-strip">';
  days.forEach(function(day,i){
    var tmax=[],tmin=[],pr=[],pop=[],wspd=[],wdir=[];
    models.forEach(function(m){
      var a=d['temperature_2m_max_'+m.id]; if(a&&a[i]!=null&&isFinite(a[i])) tmax.push(a[i]);
      var b=d['temperature_2m_min_'+m.id]; if(b&&b[i]!=null&&isFinite(b[i])) tmin.push(b[i]);
      var c=d['precipitation_sum_'+m.id]; if(c&&c[i]!=null&&isFinite(c[i])) pr.push(c[i]);
      var e=d['precipitation_probability_max_'+m.id]; if(e&&e[i]!=null&&isFinite(e[i])) pop.push(e[i]);
      var f=d['wind_speed_10m_max_'+m.id]; if(f&&f[i]!=null&&isFinite(f[i])) wspd.push(f[i]);
      var g=d['wind_direction_10m_dominant_'+m.id]; if(g&&g[i]!=null&&isFinite(g[i])) wdir.push(g[i]);
    });
    var at=avgNums(tmax), an=avgNums(tmin), ap=avgNums(pr), ao=avgNums(pop), aw=avgNums(wspd), ad=dirAvg(wdir);
    var spread=(tmax.length>=2)?(Math.max.apply(null,tmax)-Math.min.apply(null,tmax)):null;
    var icon=wxIcon(ao,ap,at);
    var cls='wx-cons-card';
    if(at!=null&&at>=33) cls+=' hot';
    else if((ao!=null&&ao>=45)||(ap!=null&&ap>=2)) cls+=' wet';
    var kt=aw!=null?kmhToKt(aw):null;
    html+='<div class="'+cls+'">'+
      '<div class="cd-day">'+escHtml(dayLabel(day,i))+'</div>'+
      '<div class="cd-icon">'+icon+'</div>'+
      '<div class="cd-temps"><span class="cd-tmax">'+(at!=null?Math.round(at):'—')+'°</span>'+
      '<span class="cd-tmin">/ '+(an!=null?Math.round(an):'—')+'°</span></div>'+
      '<div class="cd-row">'+
        '<span class="cd-pill'+(ao!=null&&ao>=40?' pop-hi':'')+'">💧 '+(ao!=null?Math.round(ao)+'%':'—')+'</span>'+
        '<span class="cd-pill">🌧 '+(ap!=null?ap.toFixed(1)+' mm':'—')+'</span>'+
      '</div>'+
      '<div class="cd-row">'+
        '<span class="cd-pill wind">💨 '+(kt!=null?kt+' kt':'—')+(ad!=null?' '+dirArrow(ad):'')+'</span>'+
      '</div>'+
      (spread!=null?'<div class="cd-spread">'+tmax.length+' models · spread ±'+(spread/2).toFixed(1)+'°</div>':'')+
    '</div>';
  });
  html+='</div>';

  // Per-model grid panel (5 models)
  html+='<div class="wx-model-panel"><h4>Model detail · max / min · wind</h4><div class="wx-model-grid" style="grid-template-columns:88px repeat('+days.length+',minmax(52px,1fr))">';
  html+='<div class="mh"></div>';
  days.forEach(function(day){html+='<div class="mh">'+escHtml(day.slice(5))+'</div>';});
  models.forEach(function(m){
    html+='<div class="ml" title="'+(m.title||m.label)+'">'+m.label+'</div>';
    days.forEach(function(_,i){
      var tx=d['temperature_2m_max_'+m.id]?d['temperature_2m_max_'+m.id][i]:null;
      var tn=d['temperature_2m_min_'+m.id]?d['temperature_2m_min_'+m.id][i]:null;
      var ws=d['wind_speed_10m_max_'+m.id]?d['wind_speed_10m_max_'+m.id][i]:null;
      var has=tx!=null&&isFinite(tx);
      html+='<div class="mc">'+(has?Math.round(tx):'—')+'/'+(tn!=null&&isFinite(tn)?Math.round(tn):'—')+'°'+(ws!=null&&isFinite(ws)?'<br><span style="opacity:.7">'+kmhToKt(ws)+'kt</span>':'')+'</div>';
    });
  });
  html+='</div></div>';
  return html;
}

function waveIcon(hs){
  if(hs==null) return '🌊';
  if(hs>=2.0) return '🌊';
  if(hs>=1.2) return '🌊';
  return '💧';
}

function buildOpenMarineHtml(data){
  if(!data||!data.daily||!data.daily.time) return null;
  var d=data.daily;
  var html='<div class="wx-marine-head"><div class="knmi-station">🌊 Marine · ABC waters</div></div>';
  html+='<div class="wx-marine-days">';
  for(var i=0;i<d.time.length&&i<5;i++){
    var hs=d.wave_height_max?d.wave_height_max[i]:null;
    var sw=d.swell_wave_height_max?d.swell_wave_height_max[i]:null;
    var ww=d.wind_wave_height_max?d.wind_wave_height_max[i]:null;
    var per=d.wave_period_max?d.wave_period_max[i]:null;
    var dir=d.wave_direction_dominant?d.wave_direction_dominant[i]:null;
    var ft=hs!=null?(hs*3.28084):null;
    var rough=hs!=null&&hs>=1.5;
    var cls='wx-marine-day'+(rough?' rough':'');
    html+='<div class="'+cls+'">'+
      '<div class="d">'+escHtml(dayLabel(d.time[i],i))+'</div>'+
      '<div class="cd-icon">'+waveIcon(hs)+'</div>'+
      '<div class="v">'+(hs!=null?hs.toFixed(1):'—')+' <small>m</small></div>'+
      '<div class="s">'+(ft!=null?ft.toFixed(1)+' ft significant':'')+'</div>'+
      '<div class="cd-row">'+
        '<span class="cd-pill">↗ '+(dir!=null?Math.round(dir)+'° '+(dirArrow(dir)||''):'—')+'</span>'+
        '<span class="cd-pill">T '+(per!=null?per.toFixed(1)+'s':'—')+'</span>'+
      '</div>'+
      '<div class="cd-row">'+
        (sw!=null?'<span class="cd-pill">Swell '+sw.toFixed(1)+' m</span>':'')+
        (ww!=null?'<span class="cd-pill">Wind wv '+ww.toFixed(1)+' m</span>':'')+
      '</div></div>';
  }
  html+='</div>';
  return html;
}

function buildKnmiMarineProseHtml(mar){
  if(!mar) return '';
  var html='<div class="wx-marine-block"><div class="wx-marine-head"><div class="knmi-station">🇧🇶 KNMI Bonaire · marine outlook</div></div>';
  if(mar.text) html+='<div class="wx-marine-txt">'+escHtml(mar.text)+'</div>';
  if(mar.waves) html+='<div class="wx-marine-txt"><b>Waves:</b> '+escHtml(mar.waves)+'</div>';
  if(mar.days&&mar.days.length){
    html+='<div class="wx-marine-days">';
    mar.days.forEach(function(dd,i){
      html+='<div class="wx-marine-day"><div class="d">'+escHtml(dd.day||('D+'+i))+'</div>'+
        '<div class="cd-icon">🌡</div>'+
        '<div class="v">'+escHtml(String(dd.tmax))+'° <small>/ '+escHtml(String(dd.tmin))+'°</small></div>'+
        '<div class="s">max / min air</div></div>';
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}

function fcHtml(raw){
  if(!raw) return null;
  var html=String(raw).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&deg;/g,'°').replace(/&amp;/g,'&');
  html=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ');
  var text=html.replace(/<\s*br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi,'\n').replace(/<[^>]+>/g,' ');
  var rawLines=text.replace(/[ \t ]+/g,' ').split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);
  var CODEY=/[{};]|\bfunction\s*\(|\bdocument\.|\$\(\s*["'#.]|\bvar\s+\w+\s*=|:\s*[\w#.%]+;\s*$/;
  var WXWORD=/\b(cloud(?:y|s)?|rain(?:y|ing|s)?|wind(?!ow)(?:y|s)?|shower(?:s|y)?|sun(?:ny|shine)?|clear(?:ing)?|fair|storm(?:y|s)?|humid(?:ity)?|pressure|visibility)\b/i;
  var lines=rawLines.filter(function(ln){
    if(CODEY.test(ln)) return false;
    if(ln.length<3) return false;
    if(ln.length<25 && !/\d/.test(ln) && !WXWORD.test(ln)) return false;
    return true;
  });
  var PERIOD=/^(Today|Tonight|This (?:morning|afternoon|evening)|Tomorrow(?:\s*night)?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Day\s*\d|Outlook|Synopsis|Situation)\b[:.–-]?\s*/i;
  var periods=[],curP=null;
  lines.forEach(function(ln){
    var m=ln.match(PERIOD);
    if(m){
      if(curP) periods.push(curP);
      curP={when:m[1].replace(/\s+/g,' ').trim(), body:ln.slice(m[0].length).trim()};
    }else if(curP){ curP.body+=(curP.body?' ':'')+ln; }
  });
  if(curP) periods.push(curP);
  periods=periods.filter(function(p){return p.body&&p.body.length>1&&!CODEY.test(p.body);});
  if(periods.length){
    return '<div class="wx-fc-list">'+periods.slice(0,6).map(function(p){
      return '<div class="wx-fc-period"><div class="fc-when">'+escHtml(p.when)+'</div><div class="fc-txt">'+escHtml(p.body)+'</div></div>';
    }).join('')+'</div>';
  }
  var cleanText=lines.join('\n');
  var wxHits=(cleanText.match(new RegExp(WXWORD.source,'gi'))||[]);
  var distinctHits=new Set(wxHits.map(function(w){return w.toLowerCase();}));
  if(distinctHits.size>=2 && !CODEY.test(cleanText) && cleanText.length>20)
    return '<div class="wx-fc-text">'+escHtml(cleanText.slice(0,900))+'</div>';
  return null;
}

async function loadWeather(){
  try{refreshNhcChart();}catch(e){}
  const cur=$('wxCurrent'),fc=$('wxForecast'),mar=$('wxMarine');
  if(cur){const c=cacheGet('wxpage');const p=c?parseKnmiBonaire(c):null;const h=p?buildKnmiGridHtml(p):null;cur.innerHTML=h||'<div class="loading-msg" style="grid-column:1/-1">Loading…</div>';}
  if(fc){const c=cacheGet('wxcons');let h=null;try{const j=extractJson(c);h=j?buildConsensusHtml(j):null;}catch(e){}fc.innerHTML=h||'<div class="loading-msg">Loading multi-model consensus…</div>';}
  if(mar){const c=cacheGet('wxommar');let h=null;try{const j=extractJson(c);h=j?buildOpenMarineHtml(j):null;}catch(e){}mar.innerHTML=h||'<div class="loading-msg">Loading marine…</div>';}

  // Run Current / Forecast / Marine in parallel so one slow source cannot block others
  await Promise.all([
    // Current — KNMI Bonaire observation table
    (async function(){
      try{
        const out=await fetchRetry(KNMI_URL);
        if(out.ok&&cur){
          const parsed=parseKnmiBonaire(out.text);
          const fields=parsed?Object.keys(parsed).filter(k=>k!=='time').length:0;
          const html=fields?buildKnmiGridHtml(parsed):null;
          if(html){cacheSet('wxpage',out.text);cur.innerHTML=html;}
          else if(!cacheGet('wxpage'))cur.innerHTML=`<div class="loading-msg" style="grid-column:1/-1">No data parsed. <a href="${KNMI_URL}" target="_blank">Open KNMI →</a></div>`;
        }else if(cur&&!cacheGet('wxpage')){
          cur.innerHTML=`<div class="loading-msg" style="grid-column:1/-1">Failed. <a href="${KNMI_URL}" target="_blank">Open KNMI →</a></div>`;
        }
      }catch(e){console.error('wx current',e);}
    })(),

    // Forecast — Open-Meteo multi-model + KNMI text
    (async function(){
      try{
        let consHtml=null;
        const om=await fetchJson(OM_FC);
        if(om.ok&&om.json){
          consHtml=buildConsensusHtml(om.json);
          if(consHtml) cacheSet('wxcons',om.text||JSON.stringify(om.json));
        }
        let knmiTxt='';
        try{
          const out=await fetchRetry(KNMI_FC);
          if(out.ok){
            const th=fcHtml(sanitize(out.text));
            if(th){cacheSet('wxfc',out.text);knmiTxt='<div class="wx-knmi-block"><p class="wx-model-note"><b>KNMI regional outlook</b> · HARMONIE-CAR / AROME-Antilles guidance</p>'+th+'</div>';}
          }
        }catch(e){}
        if(fc){
          if(consHtml||knmiTxt) fc.innerHTML=(consHtml||'')+knmiTxt;
          else fc.innerHTML=`<div class="loading-msg">Forecast unavailable. <a href="${KNMI_FC}" target="_blank">KNMI →</a></div>`;
        }
      }catch(e){console.error('wx forecast',e);}
    })(),

    // Marine — Open-Meteo waves (direct CORS) + KNMI prose
    (async function(){
      try{
        let html='';
        const om=await fetchJson(OM_MAR);
        if(om.ok&&om.json){
          const h=buildOpenMarineHtml(om.json);
          if(h){cacheSet('wxommar',om.text||JSON.stringify(om.json));html+=h;}
        }
        // Fallback: slightly different marine query if first failed
        if(!html){
          const alt='https://marine-api.open-meteo.com/v1/marine?latitude=12.15&longitude=-68.98&daily=wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max&forecast_days=5&timezone=auto';
          const om2=await fetchJson(alt);
          if(om2.ok&&om2.json){
            const h=buildOpenMarineHtml(om2.json);
            if(h){cacheSet('wxommar',om2.text||JSON.stringify(om2.json));html+=h;}
          }
        }
        try{
          const out=await fetchRetry(KNMI_MAR);
          if(out.ok){
            const marP=parseKnmiMarine(out.text);
            const prose=buildKnmiMarineProseHtml(marP);
            if(prose){cacheSet('wxmar',out.text);html+=prose;}
            else{
              const parsed=parseKnmiBonaire(out.text);
              const h2=buildKnmiMarineHtml(parsed);
              if(h2) html+=h2;
            }
          }
        }catch(e){}
        if(mar){
          if(html) mar.innerHTML=html;
          else mar.innerHTML=`<div class="loading-msg">Marine unavailable. Check network / proxy (⚙). <a href="${KNMI_MAR}" target="_blank">KNMI Marine →</a> · <a href="${OM_MAR}" target="_blank">Open-Meteo →</a></div>`;
        }
      }catch(e){
        console.error('wx marine',e);
        if(mar&&!cacheGet('wxommar')) mar.innerHTML=`<div class="loading-msg">Marine error. <a href="${OM_MAR}" target="_blank">Open-Meteo Marine →</a></div>`;
      }
    })()
  ]);
}

/* ── TABS ── */
function switchSubTab(panel,name){
  const bar=document.getElementById(panel+'-sub-bar');
  if(bar)bar.querySelectorAll('.sub-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.sub===name));
  document.querySelectorAll('[id^="'+panel+'-sub-"]').forEach(p=>p.classList.toggle('active',p.id===panel+'-sub-'+name));
  if(panel==='synop'&&name==='encode') encInitTime();

}
window.switchSubTab=switchSubTab;
var loadedTabs={metar:true,taf:false,synop:false,stations:false,atc:false,weather:false,lessons:false};
function loadLessonsPanel(){
  var mount=document.getElementById('lessons-mount');
  var panel=document.getElementById('tab-lessons');
  if(!panel) return;
  if(panel.getAttribute('data-loaded')==='1') return;
  fetch('lessons.html',{cache:'no-store'}).then(function(r){return r.text();}).then(function(t){
    panel.outerHTML=t;
    var p=document.getElementById('tab-lessons');
    if(p){ p.classList.add('active'); p.setAttribute('data-loaded','1'); }
  }).catch(function(){
    if(mount) mount.textContent='Could not load lessons.html';
  });
}
function switchTab(name){
  document.querySelectorAll('.nav-btn').forEach(b=>{
    const on=b.dataset.tab===name;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
  const sa=$('scrollArea');if(sa)sa.scrollTop=0;
  if(!loadedTabs[name]){
    loadedTabs[name]=true;
    if(name==='taf')loadAllTafs();
    else if(name==='synop')loadAllSynops();
    else if(name==='stations')fetchStationsData();
    else if(name==='weather')loadWeather();
    else if(name==='lessons')loadLessonsPanel();
  }
  if(name==='atc'){
    try{atcInitMap();}catch(e){}
    setTimeout(function(){if(atcMap)try{atcMap.invalidateSize();}catch(e){}},250);
  }
  if(name==='stations'){
    setTimeout(()=>{
      if(map&&$('stationsMapCard')&&!$('stationsMapCard').classList.contains('hidden'))map.invalidateSize();
    },250);
  }
}
window.switchTab=switchTab;

/* ── BUTTON HANDLERS ── */
var mbtn=$('mute-btn');
if(mbtn)mbtn.addEventListener('click',()=>{mute=!mute;mbtn.textContent=mute?'🔇':'🔊';});

var rbtn=$('refresh-btn');
if(rbtn)rbtn.addEventListener('click',()=>{
  updateVis();
  refreshAllMetars();
  if(loadedTabs.taf)loadAllTafs();
  if(loadedTabs.synop)loadAllSynops();
  if(loadedTabs.weather)loadWeather();
  if(loadedTabs.atc)atcTrafficRefresh();
});

var mrbtn=$('metar-refresh-btn');
if(mrbtn)mrbtn.addEventListener('click',refreshAllMetars);

var trbtn=$('taf-refresh-btn');
if(trbtn)trbtn.addEventListener('click',loadAllTafs);

var srbtn=$('synop-refresh-btn');
if(srbtn)srbtn.addEventListener('click',loadAllSynops);

var wrbtn=$('weather-refresh-btn');
if(wrbtn)wrbtn.addEventListener('click',loadWeather);

var toggleMap=$('toggleMap');
if(toggleMap)toggleMap.addEventListener('click',()=>{
  const mc=$('stationsMapCard');if(!mc)return;
  const hidden=mc.classList.contains('hidden');
  if(hidden){mc.classList.remove('hidden');initMap();addMarkers(currentData);setTimeout(()=>map&&map.invalidateSize(),200);}
  else mc.classList.add('hidden');
});

// Click to copy on METAR cells
var mc=$('metar');
if(mc)mc.addEventListener('click',async e=>{
  const cell=e.target.closest('.mc-cell');if(!cell)return;
  const vEl=cell.querySelector('.mc-val');
  const text=(vEl||cell).textContent.trim();
  if(!text||text==='--'||text==='—')return;
  try{await navigator.clipboard.writeText(text);cell.style.outline='1px solid var(--acc)';setTimeout(()=>cell.style.outline='',700);}catch(e){}
});

/* ── HIDDEN CLASSES ── */
if(!document.querySelector('style[data-rwc-hidden]')){
  const s=document.createElement('style');s.dataset.rwcHidden='1';
  s.textContent='.hidden{display:none!important;}';
  document.head.appendChild(s);
}

/* ── ACCESSIBILITY ── */
function applyA11y(){
  // Decorative emoji/glyphs should not be announced by screen readers
  document.querySelectorAll('.nav-btn .ic, .mc-flag, .hdr-clock .lbl').forEach(e=>e.setAttribute('aria-hidden','true'));
  // Icon-only buttons need accessible names
  const labels={'mute-btn':'Toggle alert sound','refresh-btn':'Refresh all data','metar-refresh-btn':'Refresh METARs','taf-refresh-btn':'Refresh TAFs','synop-refresh-btn':'Refresh SYNOPs','weather-refresh-btn':'Refresh weather','toggleMap':'Toggle station map'};
  Object.keys(labels).forEach(id=>{const el=document.getElementById(id);if(el&&!el.getAttribute('aria-label'))el.setAttribute('aria-label',labels[id]);});
  // Mark the nav as a tablist and reflect the active tab
  const nav=document.querySelector('.nav');if(nav)nav.setAttribute('role','tablist');
  document.querySelectorAll('.nav-btn').forEach(b=>{b.setAttribute('role','tab');b.setAttribute('aria-selected',b.classList.contains('active')?'true':'false');});
}
// aria-selected on click is kept in sync inside switchTab() itself — see above.

/* ── INIT (fast first paint) ── */
buildMetarTable();
buildTafTable();
// ATC audio players only (map starts when ATC tab opens)
buildATC();
applyA11y();

(async function init(){
  // 1) Instant paint from cache — no network
  const cv=cacheGet('vis');if(cv!=null)paintVis(cv);
  STATIONS.forEach(icao=>{const c=cacheGet('m_'+icao);if(c)renderMetar(icao,c);});

  // 2) Yield to browser so first paint can happen, then fetch
  await new Promise(function(r){ setTimeout(r,0); });

  // 3) Priority: ABC METARs first, then visibility; rest of stations after
  const priority=['TNCC','TNCA','TNCB'];
  const rest=STATIONS.filter(function(s){return priority.indexOf(s)<0;});
  await Promise.all(priority.map(fetchMetarFor));
  // non-blocking follow-ups
  Promise.all(rest.map(fetchMetarFor)).catch(function(){});
  updateVis().catch(function(){});

  const lu=$('last-updated');if(lu)lu.textContent=nowStamp();

  // Soft placeholders only if still empty after live attempt
  const any=STATIONS.some(icao=>metarState[icao]&&metarState[icao].lastRaw);
  if(!any){
    const d=new Date();
    const t=`${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(Math.floor(d.getUTCMinutes()/10)*10)}Z`;
    renderMetar('TNCA',`TNCA ${t} 35025G38KT 9999 FEW018CB 28/24 Q1011`);
    renderMetar('TNCB',`TNCB ${t} 34018KT 8000 -SHRA SCT020 27/24 Q1009`);
    renderMetar('TNCC',`TNCC ${t} 12020G30KT 9999 SCT022 29/25 Q1012`);
  }
})();

// Longer intervals = less background work on mobile
setInterval(function(){refreshAllMetars();}, METAR_MS);
setInterval(function(){updateVis();}, VIS_MS);

})();


/* GITHUB PAGES SAFETY NET: ensure METAR is showing and the nav bar is
   visible once the DOM is fully parsed. The real switchTab (with lazy
   data loading, scroll reset, and map invalidation) is defined and
   exposed on window by the main app script above — this just re-asserts
   the default state defensively. */
document.addEventListener('DOMContentLoaded', function(){

  if (typeof window.switchTab === 'function') window.switchTab('metar');

  var nav = document.querySelector('.nav');
  if(nav){
    nav.style.display = 'flex';
    nav.style.visibility = 'visible';
    nav.style.opacity = '1';
  }

});


/* PWA: register service worker for offline app shell. file:// has no SW. */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW registration failed', e);
    });
  });
}