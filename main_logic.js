// --- Game Logic & UI Bindings ---

// Wenn wir nicht auf ein Gebäude klicken, öffnen wir den 3D-Wald
// Dies ersetzt die 2D-Bewegung durch die 3D-Wald-Navigation
function handleWorldClick(e) {
    if (typeof isIdentified !== 'undefined' && !isIdentified) return;
    if (window.FPWald) { 
        // 2D-Welt permanent verstecken, wenn wir in 3D gehen
        const world = document.getElementById('world');
        if (world) world.style.display = 'none';
        
        toggleModal('fpModal', true); 
        FPWald.open(); 
        FPWald.bindUI(); 
        
        // Götter-Button im 3D-Wald anzeigen, wenn Admin
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
        window.data.x = tx; 
        window.data.y = ty;
        if (window.verifiedID && window.onlinePlayers) { 
            window.onlinePlayers[window.verifiedID] = { ...window.data, lastSeen: Date.now() }; 
            if (typeof renderPlayers === 'function') renderPlayers(window.onlinePlayers); 
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
        window.data.x = nx; 
        window.data.y = ny;
        if (window.verifiedID && window.onlinePlayers) { 
            window.onlinePlayers[window.verifiedID] = { ...window.data, lastSeen: Date.now() }; 
            if (typeof renderPlayers === 'function') renderPlayers(window.onlinePlayers); 
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

function closeGeneralModal() { 
    toggleModal('gameModal', false); 
}

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
            if (typeof renderPlayers === 'function') renderPlayers(window.onlinePlayers);
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
