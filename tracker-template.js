
/* tracker-template.js — shared LEGO tracker UI
   Edit this one file to update ALL trackers at once */

(function() {
let currentFilter = 'all';

const GITHUB_CONFIG = {
  owner:'jroubos', repo:'lego-collection',
  file:'data.json', branch:'main',
  get token(){ return localStorage.getItem('gh_token')||''; }
};

const GitHubSync = {
  _timer:null,
  async _sha(){
    if(!GITHUB_CONFIG.token) return null;
    try{
      const r=await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.file}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`,
        {headers:{Authorization:`token ${GITHUB_CONFIG.token}`,Accept:'application/vnd.github.v3+json'}});
      return r.ok?(await r.json()).sha:null;
    }catch(e){return null;}
  },
  async load(){
    if(!GITHUB_CONFIG.token){this.status('no-token');return null;}
    this.status('loading');
    try{
      const r=await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.file}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`,
        {headers:{Authorization:`token ${GITHUB_CONFIG.token}`,Accept:'application/vnd.github.v3+json'}});
      if(!r.ok){this.status('error');return null;}
      const d=await r.json();
      const content=JSON.parse(atob(d.content.replace(/\n/g,'')));
      if(content.collection&&content.collection.length>0)
        localStorage.setItem('legoCollection',JSON.stringify(content.collection));
      if(content.trackers)
        Object.entries(content.trackers).forEach(([k,v])=>{
          if(v&&Object.keys(v).length>0) localStorage.setItem(k,JSON.stringify(v));
        });
      this.status('saved',content.lastSaved);
      return content;
    }catch(e){this.status('error');return null;}
  },
  payload(){
    const col=(()=>{try{return JSON.parse(localStorage.getItem('legoCollection')||'[]');}catch(e){return[];}})();
    const tr={};
    ['6264tracker','6939tracker','6544tracker'].forEach(k=>{
      try{tr[k]=JSON.parse(localStorage.getItem(k)||'{}');}catch(e){tr[k]={};}
    });
    return{collection:col,trackers:tr,lastSaved:new Date().toISOString()};
  },
  async save(){
    if(!GITHUB_CONFIG.token){this.status('no-token');return false;}
    this.status('saving');
    try{
      const content=btoa(unescape(encodeURIComponent(JSON.stringify(this.payload(),null,2))));
      const sha=await this._sha();
      const body={message:`[skip ci] data: ${new Date().toLocaleString()}`,content,branch:GITHUB_CONFIG.branch};
      if(sha) body.sha=sha;
      const r=await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.file}`,
        {method:'PUT',headers:{Authorization:`token ${GITHUB_CONFIG.token}`,Accept:'application/vnd.github.v3+json','Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok){this.status('error');return false;}
      this.status('saved',new Date().toISOString());
      return true;
    }catch(e){this.status('error');return false;}
  },
  scheduleSave(){
    clearTimeout(this._timer);
    this.status('pending');
    this._timer=setTimeout(()=>this.save(),2500);
  },
  status(s,ts){
    const el=document.getElementById('syncStatus');
    if(!el) return;
    const t=ts?' · '+new Date(ts).toLocaleTimeString():'';
    const m={loading:['↓ Loading…','#FFD700'],pending:['● Unsaved','#FF6B35'],saving:['↑ Saving…','#FFD700'],
      saved:['✓ Saved'+t,'#64ffda'],error:['✕ Error','#ff5370'],'no-token':['⚠ Set token','#FF6B35']};
    const[text,color]=m[s]||['● —','#8892b0'];
    el.textContent=text; el.style.color=color;
  },
  async promptToken(){
    const t=prompt('Enter your GitHub Personal Access Token (repo scope):',GITHUB_CONFIG.token);
    if(t&&t.trim()){
      localStorage.setItem('gh_token',t.trim());
      await this.load();
      renderTracker();
    }
  }
};

// ── COLOR SWATCHES ─────────────────────────────────────────────────────────
const COLOR_SWATCHES = {
  "0":"#111111","1":"#e8e8e8","3":"#FFD700","5":"#C91A09","6":"#237841",
  "7":"#0055BF","8":"#6B3F0A","9":"#9B9B9B","10":"#595959","11":"#1a1a1a",
  "14":"#0D69AB","15":"#ADD8E6","16":"#AAFF00","17":"#EE0000","19":"#FFD700",
  "20":"#00CC00","21":"#CFB53B","":"#555555"
};

function colorSwatch(colorId, colorName) {
  const bg = COLOR_SWATCHES[colorId] || '#555';
  const border = colorId === '1' ? 'border:1px solid #aaa;' : '';
  return `<span style="background:${bg};${border}padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:${colorId==='1'||colorId==='3'||colorId==='19'?'#333':'#fff'}">${colorName}</span>`;
}

function imgUrl(p) {
  if (p.isMinifig) return p.imgUrl || `https://img.bricklink.com/ItemImage/MN/0/${p.partNo}.png`;
  return `https://img.bricklink.com/ItemImage/PN/${p.colorId}/${p.partNo}.png`;
}

function imgFallback(img, p) {
  // Try alternate BrickLink URLs then fall back to Rebrickable
  const tried = parseInt(img.dataset.tried || '0');
  const fallbacks = [
    `https://img.bricklink.com/ItemImage/PL/${p.partNo}.png`,
    p.imgUrl || '',
  ].filter(Boolean);
  if (tried < fallbacks.length) {
    img.dataset.tried = tried + 1;
    img.src = fallbacks[tried];
  } else {
    img.parentElement.innerHTML = '<div style="font-size:20px;opacity:0.2;display:flex;align-items:center;justify-content:center;height:100%">🧱</div>';
  }
}

function blUrl(p) {
  if (p.isMinifig) return `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${p.partNo}`;
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${p.partNo}&idColor=${p.colorId}`;
}

// ── STATE ──────────────────────────────────────────────────────────────────
let state = {};

function loadState() {
  try { state = JSON.parse(localStorage.getItem(SET_DATA.storageKey) || '{}'); }
  catch(e) { state = {}; }
}

function saveState() {
  localStorage.setItem(SET_DATA.storageKey, JSON.stringify(state));
  GitHubSync.scheduleSave();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function renderTracker() {
  loadState();
  const parts = SET_DATA.parts;
  const total = parts.length;
  const found = parts.filter(p => parseInt(state[p.row] ?? 0) >= p.needed).length;
  const pct = total > 0 ? Math.round(found/total*100) : 0;
  const fillColor = pct === 100 ? '#64ffda' : pct < 30 ? '#ff5370' : '#FFD700';

  // Update progress
  const progBar = document.getElementById('progressFill');
  const progLabel = document.getElementById('progressLabel');
  if (progBar) { progBar.style.width = pct+'%'; progBar.style.background = fillColor; }
  if (progLabel) progLabel.textContent = `${found} of ${total} lots marked as found (${pct}%)`;

  // Filter
  const q = (document.getElementById('searchBox')?.value || '').toLowerCase();
  const filter = currentFilter;
  const hideMinifigs = document.getElementById('hideMinifigs')?.checked;

  // Apply filters first, then group
  let rows = '';
  let visibleCount = 0;
  let currentSection = '';

  // Filter parts first
  // Sort: minifigs first, then group by color
  const sortedParts = [...parts].sort((a, b) => {
    if (a.isMinifig && !b.isMinifig) return -1;
    if (!a.isMinifig && b.isMinifig) return 1;
    if (a.colorName < b.colorName) return -1;
    if (a.colorName > b.colorName) return 1;
    return a.row - b.row;
  });

  const filteredParts = sortedParts.filter(p => {
    const foundQty = parseInt(state[p.row] ?? 0);
    const isFound = foundQty >= p.needed;
    if (hideMinifigs && p.isMinifig) return false;
    if (filter === 'missing' && isFound) return false;
    if (filter === 'found' && !isFound) return false;
    if (q && !(p.desc+' '+p.partNo+' '+p.colorName).toLowerCase().includes(q)) return false;
    return true;
  });

  filteredParts.forEach(p => {
    const foundQty = parseInt(state[p.row] ?? 0);
    const isFound = foundQty >= p.needed;
    const isMinifig = p.isMinifig;
    visibleCount++;

    // Section headers — only add when section changes
    let sectionHeader = '';
    const section = isMinifig ? 'MINIFIGS' : p.colorName.toUpperCase() + ' PARTS';
    if (section !== currentSection) {
      currentSection = section;
      const icon = isMinifig ? '👤' : '🧱';
      sectionHeader = `<tr class="section-row"><td colspan="5" style="padding:16px 14px 6px;font-size:11px;font-weight:800;letter-spacing:2px;color:${isMinifig?'#FFD700':'#8892b0'};text-transform:uppercase;border-top:1px solid #2d3250">${icon} ${section}</td></tr>`;
    }
    const rowBg = isFound ? 'background:rgba(100,255,218,0.04)' : '';
    const checkStyle = isFound
      ? 'background:#64ffda;border-color:#64ffda;color:#000'
      : 'background:transparent;border-color:#2d3250;color:transparent';

    rows += sectionHeader + `<tr style="${rowBg};border-bottom:1px solid #2d3250;transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='${isFound?'rgba(100,255,218,0.04)':'transparent'}'">
      <td style="width:68px;padding:6px 8px">
        <a href="${blUrl(p)}" target="_blank">
          <img src="${imgUrl(p)}" alt="${p.desc}" loading="lazy" style="width:56px;height:42px;object-fit:contain;background:#111520;border-radius:4px;border:1px solid #2d3250;display:block;transition:transform 0.2s" onmouseover="this.style.transform='scale(2.5)';this.style.zIndex='99';this.style.position='relative'" onmouseout="this.style.transform='scale(1)';this.style.zIndex='1'" onerror="this.style.opacity='0.2'">
        </a>
      </td>
      <td style="padding:8px 14px">
        <div style="font-weight:600;color:#e8eaf6;font-size:13px">${p.desc}</div>
        <div style="font-size:10px;color:#8892b0;margin-top:2px">${p.partNo} · ${colorSwatch(p.colorId, p.colorName)}</div>
      </td>
      <td style="text-align:center;font-family:'Bebas Neue',sans-serif;font-size:22px;color:#e8eaf6;width:60px">${p.needed}</td>
      <td style="text-align:center;width:80px;padding:6px">
        <input type="number" min="0" max="${p.needed}" value="${Math.max(0,Math.min(foundQty,p.needed))}"
          style="width:56px;background:#0f1117;border:1px solid #2d3250;color:#e8eaf6;border-radius:6px;padding:5px 8px;font-size:13px;text-align:center;font-family:'DM Sans',sans-serif;outline:none"
          oninput="updateFound(${p.row}, ${p.needed}, this)"
          onfocus="this.style.borderColor='#FFD700'"
          onblur="this.style.borderColor='#2d3250'">
      </td>
      <td style="text-align:center;width:48px">
        <button onclick="toggleFound(${p.row}, ${p.needed}, this)"
          style="width:30px;height:30px;border-radius:50%;border:2px solid;cursor:pointer;font-size:14px;font-weight:700;transition:all 0.2s;${checkStyle}">✓</button>
      </td>
    </tr>`;
  });

  const tbody = document.getElementById('trackerBody');
  if (tbody) tbody.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;padding:40px;color:#8892b0">No parts match your filters</td></tr>';

  const countEl = document.getElementById('visibleCount');
  if (countEl) countEl.textContent = visibleCount + ' parts shown';
}

function updateFound(row, needed, input) {
  let val = parseInt(input.value);
  if (isNaN(val) || val < 0) val = 0;
  if (val > needed) val = needed;
  input.value = val;
  state[row] = val;
  saveState();
  renderTracker();
}

function toggleFound(row, needed, btn) {
  const current = parseInt(state[row] ?? 0);
  state[row] = current >= needed ? 0 : needed;
  saveState();
  renderTracker();
}

// ── BUILD PAGE HTML ─────────────────────────────────────────────────────────
function buildPage() {
  const themeColor = SET_DATA.themeColor || '#555';
  document.title = `LEGO ${SET_DATA.setId} — ${SET_DATA.setName}`;

  document.body.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'DM Sans',sans-serif;background:#0f1117;color:#e8eaf6;min-height:100vh}
      .filter-btn{border:1px solid #2d3250;background:transparent;color:#8892b0;border-radius:20px;padding:5px 14px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:700;transition:all 0.2s}
      .filter-btn.active{background:#FFD700;color:#000;border-color:#FFD700}
      .filter-btn:hover:not(.active){border-color:#FFD700;color:#FFD700}
      table{width:100%;border-collapse:collapse}
      input[type=number]::-webkit-inner-spin-button{opacity:1}
      .sync-bar{display:flex;align-items:center;gap:6px;background:#1a1d27;border:1px solid #2d3250;border-radius:8px;padding:5px 10px}
      .sync-btn{border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;border:1px solid}
    </style>

    <!-- HERO -->
    <div style="background:linear-gradient(135deg,#0f1117,#1a1d27);border-bottom:1px solid #2d3250;padding:28px 40px 20px;position:relative;overflow:hidden">
      <div style="position:absolute;top:-60px;right:-60px;width:300px;height:300px;background:radial-gradient(circle,${themeColor}15 0%,transparent 70%);pointer-events:none"></div>
      <a href="LEGO_Collection_Dashboard.html" style="display:inline-flex;align-items:center;gap:6px;color:#8892b0;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:0.5px;margin-bottom:14px;transition:color 0.2s" onmouseover="this.style.color='#FFD700'" onmouseout="this.style.color='#8892b0'">← Back to Collection</a>
      <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">
        <img src="https://img.bricklink.com/ItemImage/SN/0/${SET_DATA.setId}-1.png" alt="${SET_DATA.setName}" style="width:100px;height:75px;object-fit:contain;background:#111520;border-radius:8px;border:1px solid #2d3250;flex-shrink:0" onerror="this.style.display='none'">
        <div style="flex:1">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:3px;background:linear-gradient(90deg,#FFD700,#FF6B35);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1">LEGO Set ${SET_DATA.setId} — ${SET_DATA.setName} (${SET_DATA.year})</div>
          <div style="font-size:12px;color:#8892b0;margin-top:4px">Parts tracker · ${SET_DATA.parts.length} unique lots · <span style="color:${themeColor};font-weight:700">${SET_DATA.theme}</span> theme · Hover images to zoom · Links open BrickLink</div>
          <!-- Progress -->
          <div style="margin-top:14px">
            <div style="background:#1a1d27;border-radius:20px;height:8px;overflow:hidden;border:1px solid #2d3250;margin-bottom:6px">
              <div id="progressFill" style="height:100%;border-radius:20px;transition:width 0.4s ease,background 0.4s ease;width:0%"></div>
            </div>
            <div id="progressLabel" style="font-size:12px;color:#8892b0"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- CONTROLS -->
    <div style="padding:12px 40px;background:#1a1d27;border-bottom:1px solid #2d3250;display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:100">
      <div style="position:relative;flex:1;min-width:160px;max-width:260px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#8892b0;font-size:12px">🔍</span>
        <input id="searchBox" type="text" placeholder="Search part name or number..."
          style="width:100%;background:#0f1117;border:1px solid #2d3250;color:#e8eaf6;border-radius:8px;padding:7px 11px 7px 30px;font-size:12px;font-family:'DM Sans',sans-serif;outline:none">
      </div>
      <button id="filter-all" onclick="setF('all')" style="border:1px solid #FFD700;background:#FFD700;color:#000;border-radius:20px;padding:5px 14px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:700">All</button>
      <button id="filter-missing" onclick="setF('missing')" style="border:1px solid #2d3250;background:transparent;color:#8892b0;border-radius:20px;padding:5px 14px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:700">Missing only</button>
      <button id="filter-found" onclick="setF('found')" style="border:1px solid #2d3250;background:transparent;color:#8892b0;border-radius:20px;padding:5px 14px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;font-weight:700">Found only</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8892b0;cursor:pointer">
        <input id="hideMinifigs" type="checkbox"> Hide minifigs
      </label>
      <span id="visibleCount" style="font-size:11px;color:#8892b0;margin-left:auto"></span>
      <!-- Sync -->
      <div class="sync-bar">
        <span id="syncStatus" style="font-size:10px;font-weight:700;color:#8892b0;white-space:nowrap;min-width:76px">● —</span>
        <button class="sync-btn" onclick="GitHubSync.save()" style="background:rgba(100,255,218,0.1);border-color:rgba(100,255,218,0.25);color:#64ffda">↑</button>
        <button class="sync-btn" onclick="GitHubSync.load().then(()=>renderTracker())" style="background:rgba(255,215,0,0.1);border-color:rgba(255,215,0,0.25);color:#FFD700">↓</button>
        <button class="sync-btn" onclick="GitHubSync.promptToken()" style="background:transparent;border-color:#2d3250;color:#8892b0">🔑</button>
      </div>
    </div>

    <!-- TABLE -->
    <div style="padding:0 40px 80px">
      <table>
        <thead style="background:#0d1020;position:sticky;top:57px;z-index:5">
          <tr>
            <th style="padding:10px 14px;text-align:left;font-size:10px;color:#8892b0;font-weight:700;letter-spacing:1px;border-bottom:2px solid #2d3250;width:68px">Image</th>
            <th style="padding:10px 14px;text-align:left;font-size:10px;color:#8892b0;font-weight:700;letter-spacing:1px;border-bottom:2px solid #2d3250">Part Description</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;color:#8892b0;font-weight:700;letter-spacing:1px;border-bottom:2px solid #2d3250;width:60px">Need</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;color:#8892b0;font-weight:700;letter-spacing:1px;border-bottom:2px solid #2d3250;width:80px">Found</th>
            <th style="padding:10px 14px;text-align:center;font-size:10px;color:#8892b0;font-weight:700;letter-spacing:1px;border-bottom:2px solid #2d3250;width:48px">✓</th>
          </tr>
        </thead>
        <tbody id="trackerBody"></tbody>
      </table>
    </div>`;

  renderTracker();
}

function setFilter(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Attach event listeners after DOM is built
  document.getElementById('searchBox')?.addEventListener('input', renderTracker);
  document.getElementById('hideMinifigs')?.addEventListener('change', renderTracker);

  renderTracker();
}

function setF(f) {
  currentFilter = f;
  ['all','missing','found'].forEach(x => {
    const btn = document.getElementById('filter-'+x);
    if(!btn) return;
    if(x===f) {
      btn.style.background='#FFD700'; btn.style.color='#000'; btn.style.borderColor='#FFD700';
    } else {
      btn.style.background='transparent'; btn.style.color='#8892b0'; btn.style.borderColor='#2d3250';
    }
  });
  renderTracker();
}

// ── INIT ───────────────────────────────────────────────────────────────────
loadState();
buildPage();

// Auto-load from GitHub
(async()=>{
  try{
    if(GITHUB_CONFIG.token){ await GitHubSync.load(); renderTracker(); }
    else GitHubSync.status('no-token');
  }catch(e){console.warn('sync:',e);}
})();

// Expose functions to global scope so onclick attributes can reach them
window.setF = setF;
window.setFilter = setFilter;
window.renderTracker = renderTracker;
window.updateFound = updateFound;
window.toggleFound = toggleFound;

})(); // end IIFE
