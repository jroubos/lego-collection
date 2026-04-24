"""
LEGO Tracker Server + Generator
================================
Run this script to start a local server that the dashboard can talk to.

  python make_tracker.py

Then open your dashboard at https://lego-collection.pages.dev
Click the "Build Tracker" button, enter a set number, and it runs automatically.

You can also run it directly from command line:
  python make_tracker.py 21309
  python make_tracker.py 21309 42096 75300
"""

import sys, json, os, requests, time, base64
from http.server import HTTPServer, BaseHTTPRequestHandler

# Load config from config.json (keeps secrets out of GitHub)
import pathlib
_cfg_path = pathlib.Path(__file__).parent / 'tracker_config.json'
if not _cfg_path.exists():
    print("ERROR: tracker_config.json not found!")
    print("Create it in your Lego folder with your API keys.")
    sys.exit(1)
with open(_cfg_path) as _f:
    _cfg = json.load(_f)

API_KEY        = _cfg['rebrickable_api_key']
GITHUB_TOKEN   = _cfg['github_token']
GITHUB_OWNER   = _cfg['github_owner']
GITHUB_REPO    = _cfg['github_repo']
GITHUB_BRANCH  = _cfg.get('github_branch', 'main')
SERVER_PORT    = _cfg.get('server_port', 7845)

# Rebrickable color ID → BrickLink color ID (fallback when external_ids missing)
RB_TO_BL_COLOR = {
    0: 11,   # Black
    1: 7,    # Blue
    2: 6,    # Green
    3: 6,    # Dark Turquoise → Green (approx)
    4: 5,    # Red
    5: 2,    # Tan (RB) → Tan (BL)
    6: 8,    # Brown
    7: 10,   # Dark Gray
    9: 9,    # Light Gray
    10: 0,   # Dark Brown → Black (approx)
    11: 3,   # Medium Blue
    12: 12,  # Trans-Clear
    13: 4,   # Orange
    14: 3,   # Yellow
    15: 1,   # White
    17: 20,  # Trans-Green
    19: 2,   # Tan
    25: 88,  # Dark Orange
    27: 6,   # Green
    28: 6,   # Dark Green
    36: 5,   # Red
    46: 3,   # Yellow
    47: 3,   # Bright Yellow
    70: 70,  # Reddish Brown
    71: 9,   # Light Gray
    72: 10,  # Dark Gray
    84: 91,  # Reddish Orange
    85: 85,  # Dark Bluish Gray
    86: 86,  # Light Bluish Gray
    89: 7,   # Blue
    110: 110, # Dark Blue
    115: 2,  # Yellowish Green
    117: 12, # Trans-Clear
    151: 86, # Sand Blue → LBG approx
    154: 5,  # Dark Red
    191: 3,  # Bright Light Orange → Yellow
    212: 7,  # Light Blue → Blue
    226: 3,  # Bright Light Yellow → Yellow
    272: 85, # Dark Blue → DBG approx
    297: 115, # Pearl Gold
    315: 67,  # Flat Silver
    320: 154, # Dark Red
    321: 110, # Dark Azure → Dark Blue
    322: 7,   # Medium Azure → Blue
    323: 12,  # Aqua → Trans-Clear approx
    326: 6,   # Spring Yellowish Green
    378: 6,   # Sand Green → Green
    379: 7,   # Sand Blue → Blue
    380: 8,   # Sand Purple → Brown
}


RB_HEADERS = {"Authorization": f"key {API_KEY}"}
GH_HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
}

THEME_MAP = {
    1:"Technic",4:"Star Wars",7:"Castle",14:"Town",16:"Space",
    18:"Pirates",22:"Adventurers",52:"Ideas",55:"City",
    143:"Speed Champions",158:"Icons Botanical",186:"Ideas",
    246:"Marvel",253:"Ninjago",258:"DC Batman",263:"Minecraft",
    266:"Sonic",270:"Architecture",271:"Creator",273:"Jurassic World",
    501:"Ideas",
}

# ── REBRICKABLE ────────────────────────────────────────────────
def fetch_set_info(set_num):
    r = requests.get(f"https://rebrickable.com/api/v3/lego/sets/{set_num}-1/", headers=RB_HEADERS)
    r.raise_for_status()
    return r.json()

def fetch_set_parts(set_num):
    parts = []
    url = f"https://rebrickable.com/api/v3/lego/sets/{set_num}-1/parts/?page_size=500&inc_color_details=1"
    while url:
        r = requests.get(url, headers=RB_HEADERS)
        r.raise_for_status()
        data = r.json()
        parts.extend(data['results'])
        url = data.get('next')
        if url: time.sleep(0.5)
    return parts

# ── GITHUB ─────────────────────────────────────────────────────
def get_sha(filename):
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{filename}?ref={GITHUB_BRANCH}"
    r = requests.get(url, headers=GH_HEADERS)
    return r.json().get('sha') if r.status_code == 200 else None

def push_to_github(filename, content):
    encoded = base64.b64encode(content.encode('utf-8')).decode('utf-8')
    body = {"message": f"[skip ci] Add tracker for set {filename}", "content": encoded, "branch": GITHUB_BRANCH}
    sha = get_sha(filename)
    if sha: body["sha"] = sha
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{filename}"
    r = requests.put(url, headers=GH_HEADERS, json=body)
    return r.status_code in (200, 201)

# ── TRACKER BUILDER ────────────────────────────────────────────
def build_tracker(set_num):
    print(f"\n[{set_num}] Fetching from Rebrickable...")
    info = fetch_set_info(set_num)
    set_name = info['name']
    year = info['year']
    theme = THEME_MAP.get(info.get('theme_id', 0), 'LEGO')
    print(f"[{set_num}] {set_name} ({year}) — {info.get('num_parts',0)} pieces")

    raw_parts = fetch_set_parts(set_num)
    print(f"[{set_num}] {len(raw_parts)} unique lots fetched")

    parts = []
    for p in raw_parts:
        part = p['part']
        color = p['color']
        cat = str(part.get('part_cat_id', ''))
        pnum = part['part_num']
        is_minifig = 'Minifig' in cat or pnum.startswith('fig')
        # Get BrickLink color ID from external_ids if available, else use map
        bl_color_ids = color.get('external_ids', {}).get('BrickLink', {}).get('ext_ids', [])
        rb_id = color['id']
        if bl_color_ids:
            bl_color_id = str(bl_color_ids[0])
        else:
            bl_color_id = str(RB_TO_BL_COLOR.get(rb_id, rb_id))
        # Debug: print color mapping for LBG
        if color['name'] in ('Light Bluish Gray', 'Dark Bluish Gray'):
            print(f"  COLOR DEBUG: {color['name']} rb_id={rb_id} bl_ids={bl_color_ids} → using {bl_color_id}")
        
        # Get Rebrickable image URL as fallback
        rb_img = part.get('part_img_url') or ''
        
        parts.append({
            'partNo': pnum,
            'colorId': '' if is_minifig else bl_color_id,
            'colorName': '—' if is_minifig else color['name'],
            'desc': part['name'],
            'needed': p['quantity'],
            'isMinifig': is_minifig,
            'imgUrl': rb_img
        })

    parts.sort(key=lambda p: (0 if p['isMinifig'] else 1, p['colorName'], p['desc']))
    for i, p in enumerate(parts): p['row'] = i

    data = {
        'setId': set_num, 'setName': set_name,
        'theme': theme, 'year': year,
        'storageKey': f'{set_num}tracker', 'parts': parts
    }

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LEGO {set_num} — {set_name}</title>
</head>
<body>
<script>
const SET_DATA = {json.dumps(data, indent=2)};
</script>
<script src="tracker-template.js"></script>
</body>
</html>"""

    filename = f"LEGO_{set_num}_Tracker.html"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"[{set_num}] Pushing to GitHub...")
    ok = push_to_github(filename, html)
    if ok:
        print(f"[{set_num}] ✓ Live at https://lego-collection.pages.dev/{filename}")
    else:
        print(f"[{set_num}] ✗ GitHub push failed")

    return {'setId': set_num, 'setName': set_name, 'theme': theme,
            'year': year, 'lots': len(parts), 'filename': filename,
            'url': f'https://lego-collection.pages.dev/{filename}', 'ok': ok}

# ── LOCAL SERVER ───────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress default logs

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/ping':
            self.send_response(200)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/build':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            set_nums = body.get('sets', [])

            results = []
            for set_num in set_nums:
                try:
                    result = build_tracker(str(set_num))
                    results.append(result)
                except Exception as e:
                    print(f"[{set_num}] Error: {e}")
                    results.append({'setId': set_num, 'ok': False, 'error': str(e)})

            self.send_response(200)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(results).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    print(f"""
╔══════════════════════════════════════════════╗
║     LEGO Tracker Server is running!          ║
║                                              ║
║  Open your dashboard and click              ║
║  "Build Tracker" to create new trackers.    ║
║                                              ║
║  Press Ctrl+C to stop.                       ║
╚══════════════════════════════════════════════╝
""")
    server = HTTPServer(('localhost', SERVER_PORT), Handler)
    server.serve_forever()

# ── MAIN ───────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) > 1:
        # CLI mode - build sets directly
        for set_num in sys.argv[1:]:
            try:
                build_tracker(set_num)
            except Exception as e:
                print(f"Error for {set_num}: {e}")
    else:
        # Server mode
        run_server()
