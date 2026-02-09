// --- SESSION REHYDRATION ---
const savedID = sessionStorage.getItem("verifiedID");
if (!window.isIdentified && savedID) {
    window.verifiedID = savedID;
    window.isIdentified = true;
    window.isAdmin = sessionStorage.getItem("isAdmin") === "true";
    console.log("Session rehydrated:", savedID);
}

// --- CORE CONFIG ---
const TWITCH_CLIENT_ID = "futhxsgrshkh2h6cqywavg5cous3q0";
const BROADCASTER_ID = "573773653";
const REDIRECT_URI = "https://noverato.github.io/System";

window.isIdentified = window.isIdentified || false;
window.verifiedID = window.verifiedID || "";
window.onlinePlayers = window.onlinePlayers || {};
window.isAdmin = window.isAdmin || false;
window.data = window.data || { name: "Held", x: 960, y: 540, lxp: 0, hp: 100, maxHp: 100, stats: { atk: 10, def: 10, currentLevel: 1, className: "Ei" }, inventar: {}, equipment: {}, lxpBuffer: 0 };
let twitchToken = "";

// --- RENDERING ENGINE ---
function renderPlayers(players) {
    const layer = document.getElementById('charLayer');
    if (!layer) return;
    window._playerNodes = window._playerNodes || {};
    window._playerInterp = window._playerInterp || {};
    window._playerLast = window._playerLast || {};

    const lp = { ...players };
    if (window.verifiedID) {
        lp[window.verifiedID] = { ...(players[window.verifiedID] || {}), ...window.data, name: window.data.name, x: window.data.x, y: window.data.y, lastSeen: Date.now() };
    }

    const present = {};
    Object.keys(lp).forEach(id => {
        const p = lp[id];
        if (p.hidden || (Date.now() - (p.lastSeen || 0) > 60000)) return;
        present[id] = true;

        let node = window._playerNodes[id];
        const imgSrc = (typeof getCreatureSprite === 'function') ? getCreatureSprite(p, id === BROADCASTER_ID) : 'Ei.png';

        if (!node) {
            const div = document.createElement('div');
            div.className = 'creature';
            div.style.left = p.x + "px";
            div.style.top = p.y + "px";
            div.innerHTML = `<img src="${imgSrc}"><div class="name-tag ${id === BROADCASTER_ID ? 'boss-aura' : ''}">${p.name}</div>`;
            layer.appendChild(div);
            window._playerNodes[id] = div;
            window._playerInterp[id] = { x: p.x, y: p.y, tx: p.x, ty: p.y };
            window._playerLast[id] = p.lastSeen || window._playerLast[id] || 0;
        } else {
            const currentImg = node.querySelector('img');
            const nameTag = node.querySelector('.name-tag');
            if (currentImg && currentImg.getAttribute('src') !== imgSrc) currentImg.setAttribute('src', imgSrc);
            if (nameTag && nameTag.textContent !== p.name) nameTag.textContent = p.name;
            const st = window._playerInterp[id] || { x: p.x, y: p.y, tx: p.x, ty: p.y };
            const incoming = p.lastSeen || 0;
            const known = window._playerLast[id] || 0;
            if (incoming >= known) {
                st.tx = p.x; st.ty = p.y; window._playerLast[id] = incoming;
            }
            window._playerInterp[id] = st;
        }
    });

    Object.keys(window._playerNodes).forEach(id => {
        if (!present[id]) {
            const el = window._playerNodes[id];
            if (el && el.parentNode === layer) layer.removeChild(el);
            delete window._playerNodes[id];
            delete window._playerInterp[id];
        }
    });
}

function updateUI() {
    const nameEl = document.getElementById('playerName');
    if (nameEl) nameEl.innerText = window.isAdmin ? "OVERLORD " + window.data.name : window.data.name;
    const classEl = document.getElementById('hudClass');
    if (classEl) classEl.innerText = window.data.stats.className;
    const lxpEl = document.getElementById('lxpC');
    if (lxpEl) lxpEl.innerText = window.data.lxp;
    const lvlEl = document.getElementById('lvlTotal');
    if (lvlEl) lvlEl.innerText = window.data.stats.currentLevel;

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        if (window.isIdentified) {
            loginBtn.style.display = 'none';
            if (typeof startForestIfReady === 'function') startForestIfReady();
        } else {
            loginBtn.style.display = 'block';
        }
    }

    const adminPanel = document.getElementById('adminHud');
    if (adminPanel) adminPanel.style.display = window.isAdmin ? 'block' : 'none';
}

function clearPanels() {
    const left = document.getElementById('modalLeft');
    const side = document.getElementById('sideContent');
    if (left) left.innerHTML = '';
    if (side) side.innerHTML = '';
}

// --- LOGIC ---
function cleanURL() { if (window.location.hash) window.history.replaceState({}, document.title, window.location.pathname); }

let forestStarted = false;
function startForestIfReady() {
    if (forestStarted) return;
    if (window.isIdentified && window.FPWald) {
        console.log("🌲 Automatischer Start im 3D-Wald...");
        FPWald.open();
        forestStarted = true;
    }
}

function loginWithTwitch() {
    window.location.href = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=user:read:email`;
}

window.onload = async () => {
    if (typeof MARKT_WAREN === 'undefined') window.MARKT_WAREN = {};
    const params = new URLSearchParams(window.location.hash.substring(1));

    if (params.has("access_token")) {
        twitchToken = params.get("access_token");
        cleanURL();
        try {
            const resp = await fetch(`https://api.twitch.tv/helix/users`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchToken}` } });
            const result = await resp.json();
            if (result.data && result.data.length > 0) {
                window.verifiedID = result.data[0].id;
                window.data.name = result.data[0].display_name;
                window.isIdentified = true;
                window.isAdmin = (window.verifiedID === BROADCASTER_ID);
                
                sessionStorage.setItem("verifiedID", window.verifiedID);
                sessionStorage.setItem("isIdentified", "true");
                sessionStorage.setItem("isAdmin", window.isAdmin ? "true" : "false");

                if (typeof window.loadUserData === 'function') {
                    await window.loadUserData();
                }
                startForestIfReady();
                setupPlayerSync();
                setupEnvHud();
                setupEventListeners();
            }
        } catch (e) { console.error("Twitch Login Error:", e); }
    } else {
        if (window.isIdentified) {
            if (typeof window.loadUserData === 'function') {
                await window.loadUserData();
            }
            setupPlayerSync();
        }
        setupEventListeners();
        console.log("System bereit.");
        updateUI();
    }
};

function setupEventListeners() {
    const world = document.getElementById('world');
    if (world) world.addEventListener('click', handleWorldClick);

    // Globale Event-Delegation für dynamische Inhalte (CSP-konform)
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const args = target.getAttribute('data-args') ? JSON.parse(target.getAttribute('data-args')) : [];

        console.log("Action triggered:", action, args);

        switch (action) {
            case 'loginWithTwitch':
                loginWithTwitch();
                break;
            case 'openInventory':
                if (typeof openInventory === 'function') openInventory();
                break;
            case 'openAdminPanel':
                if (typeof openAdminPanel === 'function') openAdminPanel();
                break;
            case 'closeGeneralModal':
                closeGeneralModal();
                break;
            case 'openBuilding':
                if (typeof openBuilding === 'function') openBuilding(args[0]);
                break;
            case 'adminAction':
                if (window.AdminConsole && typeof window.AdminConsole[args[0]] === 'function') {
                    window.AdminConsole[args[0]](...args.slice(1));
                }
                break;
            case 'mineAction':
                if (typeof window.mineAction === 'function') window.mineAction(...args);
                break;
            case 'renderShopTab':
                if (typeof window.renderShopTab === 'function') window.renderShopTab(...args);
                break;
            case 'renderSellTab':
                if (typeof window.renderSellTab === 'function') window.renderSellTab(...args);
                break;
            case 'buyItem':
                if (typeof window.buyItem === 'function') window.buyItem(...args);
                break;
            case 'sellItem':
                if (typeof window.sellItem === 'function') window.sellItem(...args);
                break;
            case 'chooseClass':
                if (typeof window.chooseClass === 'function') window.chooseClass(...args);
                break;
            case 'choosePath':
                if (typeof window.choosePath === 'function') window.choosePath(...args);
                break;
            case 'evolveTo':
                if (typeof window.evolveTo === 'function') window.evolveTo(...args);
                break;
            case 'executeCombatAction':
                if (typeof window.executeCombatAction === 'function') window.executeCombatAction(...args);
                break;
            case 'escapeCombat':
                if (typeof window.escapeCombat === 'function') window.escapeCombat(...args);
                break;
            case 'battleAction':
                if (window.BattleEngine && typeof window.BattleEngine[args[0]] === 'function') {
                    window.BattleEngine[args[0]](...args.slice(1));
                }
                break;
            case 'pvpAction':
                if (window.PvPEvents && typeof window.PvPEvents[args[0]] === 'function') {
                    window.PvPEvents[args[0]](...args.slice(1));
                }
                break;
            case 'craftingAction':
                if (window.CraftingUI && typeof window.CraftingUI[args[0]] === 'function') {
                    window.CraftingUI[args[0]](...args.slice(1));
                }
                break;
            case 'arenaAction':
                if (window.Arena && typeof window.Arena[args[0]] === 'function') {
                    window.Arena[args[0]](...args.slice(1));
                }
                break;
            case 'closeParent':
                if (target.parentElement) target.parentElement.style.display = 'none';
                break;
            case 'closeChat':
                const houseOverlay = document.getElementById('houseOverlay');
                if (houseOverlay) houseOverlay.style.display = 'none';
                break;
        }
    });

    // Spezielle Listener für statische Elemente (falls nötig)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', loginWithTwitch);

    const inventoryBtn = document.getElementById('inventoryBtn');
    if (inventoryBtn) inventoryBtn.addEventListener('click', () => {
        if (typeof openInventory === 'function') openInventory();
    });

    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) adminPanelBtn.addEventListener('click', () => {
        if (typeof openAdminPanel === 'function') openAdminPanel();
    });

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeGeneralModal);

    const fpAdmin = document.getElementById('fpAdmin');
    if (fpAdmin) fpAdmin.addEventListener('click', () => {
        if (typeof openAdminPanel === 'function') openAdminPanel();
    });
}

function setupPlayerSync() {
    if (!window.db) return;
    window.db.ref('players').on('value', snap => {
        window.onlinePlayers = snap.val() || {};
        renderPlayers(window.onlinePlayers);
    });
    window.db.ref('players').on('child_added', snap => {
        const id = snap.key;
        const p = snap.val() || {};
        window.onlinePlayers = window.onlinePlayers || {};
        window.onlinePlayers[id] = p;
        window._playerLast = window._playerLast || {}; 
        if (p && typeof p.lastSeen === 'number') window._playerLast[id] = Math.max(p.lastSeen, window._playerLast[id] || 0);
        renderPlayers(window.onlinePlayers);
    });
    window.db.ref('players').on('child_changed', snap => {
        const id = snap.key;
        const p = snap.val() || {};
        window.onlinePlayers = window.onlinePlayers || {};
        window.onlinePlayers[id] = { ...window.onlinePlayers[id], ...p };
        window._playerLast = window._playerLast || {}; 
        const incoming = p.lastSeen || 0;
        const known = window._playerLast[id] || 0;
        if (incoming >= known && window._playerInterp && window._playerInterp[id]) {
            window._playerInterp[id].tx = p.x;
            window._playerInterp[id].ty = p.y;
            window._playerLast[id] = incoming;
        } else {
            renderPlayers(window.onlinePlayers);
        }
    });
    window.db.ref('players').on('child_removed', snap => {
        const id = snap.key;
        if (window.onlinePlayers) delete window.onlinePlayers[id];
        if (window._playerLast && window._playerLast[id] != null) delete window._playerLast[id];
        renderPlayers(window.onlinePlayers);
    });
}

function setupEnvHud() {
    if (window.EventHub) {
        EventHub.on('env:time:update', (payload) => {
            const timeEl = document.getElementById('envTime');
            if (timeEl) {
                const totalSeconds = Math.floor(payload.time * 3600);
                const minutes = Math.floor(totalSeconds / 60);
                timeEl.innerText = `${minutes.toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
            }
        });

        EventHub.on('env:weather:update', (payload) => {
            const weatherEl = document.getElementById('envWeather');
            if (weatherEl) {
                const names = { 'sunny': 'Sonnig', 'cloudy': 'Bewölkt', 'rainy': 'Regen', 'stormy': 'Sturm' };
                weatherEl.innerText = names[payload.type] || payload.type;
            }
        });
    }
}

window.addEventListener('beforeunload', () => {
    try {
        if (window.db && window.verifiedID) {
            window.db.ref('players/' + window.verifiedID).update({ hidden: true, lastSeen: Date.now() });
        }
    } catch {}
});

// --- Game Navigation & World Clicks ---
function handleWorldClick(e) {
    if (window.isIdentified === false) return;
    if (window.FPWald) { 
        const world = document.getElementById('world');
        if (world) world.style.display = 'none';
        toggleModal('fpModal', true); 
        FPWald.open(); 
        FPWald.bindUI(); 
        const adminHud = document.getElementById('adminHud');
        const fpAdmin = document.getElementById('fpAdmin');
        if (adminHud && adminHud.style.display !== 'none' && fpAdmin) {
            fpAdmin.style.display = 'block';
        }
    }
}

let _moveAnim = null;
let _lastSync = 0;
let _renderAnim = null;

function _tickPlayers() {
    const layer = document.getElementById('charLayer');
    if (!layer) { 
        _renderAnim = requestAnimationFrame(_tickPlayers); 
        return; 
    }
    const interp = window._playerInterp || {};
    const nodes = window._playerNodes || {};

    Object.keys(nodes).forEach(id => {
        const st = interp[id];
        if (!st) return;
        const targetX = (id === String(window.verifiedID)) ? (window.data.x || st.tx) : st.tx;
        const targetY = (id === String(window.verifiedID)) ? (window.data.y || st.ty) : st.ty;
        st.x += (targetX - st.x) * 0.2;
        st.y += (targetY - st.y) * 0.2;
        const el = nodes[id];
        el.style.left = st.x + 'px';
        el.style.top = st.y + 'px';
    });
    _renderAnim = requestAnimationFrame(_tickPlayers);
}
_renderAnim = requestAnimationFrame(_tickPlayers);

function movePlayerTo(tx, ty) {
    if (_moveAnim) cancelAnimationFrame(_moveAnim);
    const sx = window.data.x || 0;
    const sy = window.data.y || 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
        window.data.x = tx; window.data.y = ty;
        if (window.verifiedID && window.onlinePlayers) { 
            window.onlinePlayers[window.verifiedID] = { ...window.data, lastSeen: Date.now() }; 
            renderPlayers(window.onlinePlayers); 
        }
        if (typeof window.save === 'function') window.save();
        return;
    }
    const speed = 600;
    const duration = Math.max(300, Math.floor((dist / speed) * 1000));
    const start = performance.now();
    let traveled = 0;
    const stepSize = 40;
    function step(t) {
        const k = Math.min(1, (t - start) / duration);
        const nx = sx + dx * k;
        const ny = sy + dy * k;
        const inc = Math.hypot(nx - (window.data.x || 0), ny - (window.data.y || 0));
        traveled += inc;
        window.data.x = nx; window.data.y = ny;
        if (window.verifiedID && window.onlinePlayers) { 
            window.onlinePlayers[window.verifiedID] = { ...window.data, lastSeen: Date.now() }; 
            renderPlayers(window.onlinePlayers); 
        }
        if (typeof window.save === 'function') {
            const now = t;
            if (now - _lastSync > 250) { window.save(); _lastSync = now; }
        }
        if (window.db && window.verifiedID) {
            const nowMs = Date.now();
            try { window.db.ref('players/' + window.verifiedID).update({ x: window.data.x, y: window.data.y, lastSeen: nowMs }); } catch {}
        }
        if (traveled >= stepSize) {
            traveled = 0;
            if (window.EventHub && EventHub.EVENTS && EventHub.EVENTS.ENCOUNTER_STEP) {
                EventHub.emit(EventHub.EVENTS.ENCOUNTER_STEP);
            }
        }
        if (k < 1) { _moveAnim = requestAnimationFrame(step); }
        else { if (typeof window.save === 'function') window.save(); }
    }
    _moveAnim = requestAnimationFrame(step);
}

function toggleModal(id, s) { 
    const el = document.getElementById(id);
    if (el) el.style.display = s ? 'flex' : 'none'; 
}

function closeGeneralModal() { toggleModal('gameModal', false); }

function openBuilding(b) {
    toggleModal('gameModal', true);
    if (typeof clearPanels === 'function') clearPanels(); 
    const left = document.getElementById('modalLeft');
    const world = document.getElementById('world');
    const targetEl = document.getElementById('b-' + b);
    if (world && targetEl) {
        const wr = world.getBoundingClientRect();
        const tr = targetEl.getBoundingClientRect();
        window.data.x = (tr.left - wr.left) + tr.width / 2;
        window.data.y = (tr.top - wr.top) + tr.height / 2;
        if (window.verifiedID && window.onlinePlayers) {
            window.onlinePlayers[window.verifiedID] = { ...window.data, lastSeen: Date.now() };
            renderPlayers(window.onlinePlayers);
        }
        if (typeof window.save === 'function') window.save();
    }
    if (b === 'steinbruch' && typeof renderMiningMenu === 'function') renderMiningMenu();
    else if (b === 'rathaus') {
        const template = document.getElementById('evo-hall-template');
        if (template && left) {
            left.appendChild(template.content.cloneNode(true));
            if (typeof initEvoHallDisplay === 'function') initEvoHallDisplay();
        }
    }
    else if (b === 'markt' && typeof renderMarketplace === 'function') renderMarketplace();
    else if (b === 'arena' && window.PvPEvents) {
        PvPEvents.openMenu();
    }
}
