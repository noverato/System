/**
 * THE NEST: EVOLUTION SYSTEM (evolution.js)
 * Vollständige Matrix: 7 Klassen, 7 Stufen, 2 Pfade.
 * Master-Struktur inkl. Evo-Halle Integration (.class-tile Fix).
 */

const EVO_DATA = {
    "Ei": { hp: 50, atk: 5, def: 5, img: 'Ei.png' },
    "Sprössling": { hp: 55, atk: 10, def: 10, img: 'sproessling.png' },

    "Waldläufer": {
        "Licht": [
            { name: "Licht-Novize", hp: 45, atk: 65, def: 40, img: 'Skelett.png' },
            { name: "Pfadfinder des Glanzes", hp: 50, atk: 80, def: 45, img: 'Skelett.png' },
            { name: "Licht-Bogenschütze", hp: 55, atk: 100, def: 50, img: 'Goblin.png' },
            { name: "Scharfschütze des Hains", hp: 60, atk: 125, def: 55, img: 'Goblin.png' },
            { name: "Elite-Waidmann", hp: 65, atk: 150, def: 60, img: 'Oger.png' },
            { name: "Meister-Wildläufer", hp: 75, atk: 180, def: 70, img: 'Lich.png' },
            { name: "Legendärer Licht-Schütze", hp: 90, atk: 220, def: 80, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Striezi", hp: 45, atk: 65, def: 40, img: 'Skelett.png' },
            { name: "Nacht-Schleicher", hp: 50, atk: 90, def: 40, img: 'Skelett.png' },
            { name: "Gift-Dolch-Adept", hp: 55, atk: 120, def: 40, img: 'Goblin.png' },
            { name: "Hinterhalt-Assassine", hp: 60, atk: 155, def: 40, img: 'Goblin.png' },
            { name: "Schatten-Viper", hp: 65, atk: 195, def: 45, img: 'Oger.png' },
            { name: "Meister der lautlosen Klinge", hp: 70, atk: 240, def: 45, img: 'Lich.png' },
            { name: "Legendärer Nachtschatten-Assassine", hp: 80, atk: 285, def: 50, img: 'HoeheresWesen.png' }
        ]
    },

    "Natur-Krieger": {
        "Licht": [
            { name: "Wald-Rekrut", hp: 60, atk: 50, def: 40, img: 'Skelett.png' },
            { name: "Grün-Gardist", hp: 75, atk: 55, def: 50, img: 'Skelett.png' },
            { name: "Elfen-Krieger", hp: 95, atk: 65, def: 65, img: 'Goblin.png' },
            { name: "Silberblatt-Kämpfer", hp: 120, atk: 75, def: 80, img: 'Goblin.png' },
            { name: "Elite-Hüter", hp: 150, atk: 90, def: 100, img: 'Oger.png' },
            { name: "Licht-Champion", hp: 190, atk: 105, def: 125, img: 'Lich.png' },
            { name: "Ewiger Licht-Vanguard", hp: 240, atk: 125, def: 150, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Fechter", hp: 60, atk: 50, def: 40, img: 'Skelett.png' },
            { name: "Nacht-Klinge", hp: 65, atk: 70, def: 45, img: 'Skelett.png' },
            { name: "Finster-Duellant", hp: 75, atk: 95, def: 50, img: 'Goblin.png' },
            { name: "Obsidian-Stecher", hp: 85, atk: 125, def: 55, img: 'Goblin.png' },
            { name: "Elite-Exekutor", hp: 100, atk: 165, def: 60, img: 'Oger.png' },
            { name: "Fürst der schwarzen Klingen", hp: 120, atk: 210, def: 70, img: 'Lich.png' },
            { name: "Legendärer Schatten-Vanguard", hp: 150, atk: 265, def: 85, img: 'HoeheresWesen.png' }
        ]
    },

    "Druide": {
        "Licht": [
            { name: "Mystischer Novize", hp: 55, atk: 55, def: 40, img: 'Skelett.png' },
            { name: "Rufer des Wachstums", hp: 65, atk: 70, def: 45, img: 'Skelett.png' },
            { name: "Licht-Alchemist", hp: 80, atk: 90, def: 50, img: 'Goblin.png' },
            { name: "Hüter der Lebensquelle", hp: 100, atk: 115, def: 55, img: 'Goblin.png' },
            { name: "Astral-Schamane", hp: 125, atk: 145, def: 60, img: 'Oger.png' },
            { name: "Hoher Druide des Lichts", hp: 155, atk: 185, def: 70, img: 'Lich.png' },
            { name: "Ewiger Smaragd-Erzmagier", hp: 190, atk: 235, def: 85, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Adept", hp: 55, atk: 55, def: 40, img: 'Skelett.png' },
            { name: "Sporen-Waver", hp: 60, atk: 75, def: 40, img: 'Skelett.png' },
            { name: "Verderber des Grüns", hp: 70, atk: 100, def: 45, img: 'Goblin.png' },
            { name: "Parasiten-Meister", hp: 85, atk: 135, def: 45, img: 'Goblin.png' },
            { name: "Nachtmahr-Schamane", hp: 105, atk: 180, def: 50, img: 'Oger.png' },
            { name: "Hoher Exekutor der Fäulnis", hp: 130, atk: 235, def: 55, img: 'Lich.png' },
            { name: "Legendärer Leeren-Botaniker", hp: 160, atk: 300, def: 65, img: 'HoeheresWesen.png' }
        ]
    },

    "Hüter": {
        "Licht": [
            { name: "Schild-Anwärter", hp: 65, atk: 45, def: 40, img: 'Skelett.png' },
            { name: "Wächter der Pforte", hp: 80, atk: 50, def: 55, img: 'Skelett.png' },
            { name: "Eisenwall-Hüter", hp: 100, atk: 55, def: 75, img: 'Goblin.png' },
            { name: "Bastion des Lichts", hp: 130, atk: 65, def: 100, img: 'Goblin.png' },
            { name: "Paladin d. unerschüttert. Treue", hp: 170, atk: 80, def: 130, img: 'Oger.png' },
            { name: "Sanktum-Großschild", hp: 220, atk: 100, def: 170, img: 'Lich.png' },
            { name: "Legendärer Welten-Beschützer", hp: 300, atk: 120, def: 220, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Stachel-Schild-Novize", hp: 65, atk: 45, def: 40, img: 'Skelett.png' },
            { name: "Dunkle Eisen-Ramme", hp: 75, atk: 60, def: 50, img: 'Skelett.png' },
            { name: "Dornen-Vollstrecker", hp: 90, atk: 85, def: 60, img: 'Goblin.png' },
            { name: "Schwarzer Panzer-Brecher", hp: 110, atk: 120, def: 70, img: 'Goblin.png' },
            { name: "Lord d. schmerzhaften Schutzes", hp: 140, atk: 165, def: 85, img: 'Oger.png' },
            { name: "Titan d. dunklen Stacheln", hp: 180, atk: 220, def: 100, img: 'Lich.png' },
            { name: "Legendärer Dunkel-Hüter d. Leere", hp: 230, atk: 280, def: 120, img: 'HoeheresWesen.png' }
        ]
    },

    "Sucher": {
        "Licht": [
            { name: "Gassen-Läufer", hp: 45, atk: 60, def: 45, img: 'Skelett.png' },
            { name: "Pfad-Entdecker", hp: 55, atk: 75, def: 50, img: 'Skelett.png' },
            { name: "Licht-Vagabund", hp: 65, atk: 95, def: 55, img: 'Goblin.png' },
            { name: "Meister der Akrobatik", hp: 80, atk: 120, def: 60, img: 'Goblin.png' },
            { name: "Schatzjäger des Hains", hp: 100, atk: 155, def: 70, img: 'Oger.png' },
            { name: "Hüter der Verborgenheit", hp: 130, atk: 200, def: 80, img: 'Lich.png' },
            { name: "Legendärer Glücksbringer", hp: 170, atk: 250, def: 95, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Stricher", hp: 45, atk: 60, def: 45, img: 'Skelett.png' },
            { name: "Nacht-Taschendieb", hp: 50, atk: 85, def: 45, img: 'Skelett.png' },
            { name: "Klingen-Beutelschneider", hp: 55, atk: 115, def: 45, img: 'Goblin.png' },
            { name: "Hinterhalt-Plünderer", hp: 60, atk: 155, def: 50, img: 'Goblin.png' },
            { name: "Dunkler Schlitzohr-Meister", hp: 70, atk: 205, def: 50, img: 'Oger.png' },
            { name: "Schatten-Plage des Nests", hp: 85, atk: 260, def: 55, img: 'Lich.png' },
            { name: "Legendärer Meisterdieb", hp: 100, atk: 330, def: 60, img: 'HoeheresWesen.png' }
        ]
    },

    "Einsiedler": {
        "Licht": [
            { name: "Gelehrten-Lehrling", hp: 50, atk: 60, def: 40, img: 'Skelett.png' },
            { name: "Sucher der Wahrheit", hp: 65, atk: 70, def: 45, img: 'Skelett.png' },
            { name: "Licht-Chronist", hp: 85, atk: 85, def: 50, img: 'Goblin.png' },
            { name: "Hoher Gebieter der Reinheit", hp: 110, atk: 110, def: 55, img: 'Goblin.png' },
            { name: "Medium des heiligen Hains", hp: 145, atk: 145, def: 60, img: 'Oger.png' },
            { name: "Licht-Orakel", hp: 190, atk: 190, def: 70, img: 'Lich.png' },
            { name: "Leg. Licht-Avatar d. Weisheit", hp: 250, atk: 250, def: 80, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Schüler", hp: 50, atk: 60, def: 40, img: 'Skelett.png' },
            { name: "Rufer der Finsternis", hp: 60, atk: 80, def: 40, img: 'Skelett.png' },
            { name: "Schwarz-Magier", hp: 75, atk: 110, def: 40, img: 'Goblin.png' },
            { name: "Lord der Gravitation", hp: 95, atk: 150, def: 45, img: 'Goblin.png' },
            { name: "Gebieter des schwarzen Lochs", hp: 120, atk: 200, def: 50, img: 'Oger.png' },
            { name: "Schatten-Eminenz", hp: 150, atk: 260, def: 55, img: 'Lich.png' },
            { name: "Leg. Exekutor der Leere", hp: 190, atk: 330, def: 65, img: 'HoeheresWesen.png' }
        ]
    },

    "Wächter": {
        "Licht": [
            { name: "Heiliger Anwärter", hp: 55, atk: 55, def: 40, img: 'Skelett.png' },
            { name: "Licht-Gardist", hp: 70, atk: 65, def: 50, img: 'Skelett.png' },
            { name: "Ritter des Morgengrauens", hp: 90, atk: 85, def: 65, img: 'Goblin.png' },
            { name: "Heiliger Großritter", hp: 115, atk: 115, def: 80, img: 'Goblin.png' },
            { name: "Klinge der Gerechtigkeit", hp: 150, atk: 150, def: 100, img: 'Oger.png' },
            { name: "Goldener Löwen-Wächter", hp: 200, atk: 195, def: 125, img: 'Lich.png' },
            { name: "Legendärer Licht-Souverän", hp: 260, atk: 250, def: 150, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Anwärter", hp: 55, atk: 55, def: 40, img: 'Skelett.png' },
            { name: "Dunkler Pfadfinder", hp: 65, atk: 75, def: 45, img: 'Skelett.png' },
            { name: "Ritter des Abgrunds", hp: 80, atk: 105, def: 55, img: 'Goblin.png' },
            { name: "Schatten-Kommandant", hp: 105, atk: 145, def: 65, img: 'Goblin.png' },
            { name: "Gebieter der Finsternis", hp: 140, atk: 190, def: 75, img: 'Oger.png' },
            { name: "Monarch-Anwärter", hp: 185, atk: 250, def: 90, img: 'Lich.png' },
            { name: "Leg. Schatten-Souverän", hp: 240, atk: 315, def: 105, img: 'HoeheresWesen.png' }
        ]
    }
};

// ==========================================
// 1. INITIALISIERUNG DER EVO-HALLE
// ==========================================

/**
 * Aktualisiert das Display der Evolutionshalle gemäß Evolutionsplan:
 * 1) Ei → Sprössling bei 5000 LXP
 * 2) Nach 30 Tagen als Sprössling: Klassenwahl
 * 3) Nach weiteren 30 Tagen: Pfadwahl (Licht/Dunkel) und Tier 2
 */
function initEvoHallDisplay() {
    if (!data || !data.stats) return;

    const lxpVal = document.getElementById('evo-lxp-val');
    const lvlVal = document.getElementById('evo-lvl-val');
    const bufferVal = document.getElementById('evo-buffer-val');
    const currentFormVal = document.getElementById('current-form-display');

    if (lxpVal) lxpVal.innerText = data.lxp || 0;
    if (lvlVal) lvlVal.innerText = data.stats.currentLevel || 0;
    if (bufferVal) bufferVal.innerText = data.stats.hiddenXP || 0;
    if (currentFormVal) {
        const emoji = typeof getCreatureEmoji === 'function' ? getCreatureEmoji(data) : '🙂';
        currentFormVal.innerText = `${emoji} ${data.stats.className || "Ei"}`;
    }

    const tier = data.stats.totalEvoLevel || 0;
    const canSprout = canEvolveTo(1);
    const canChooseClass = (tier === 1 && !data.stats.baseClass && canEvolveTo(2));
    const canChoosePath = (tier === 1 && !!data.stats.baseClass && !data.stats.path && canEvolveTo(2));

    const classKacheln = document.querySelectorAll('.class-tile');
    classKacheln.forEach(tile => {
        if (canChooseClass) tile.classList.remove('locked');
        else tile.classList.add('locked');
    });

    if (canChooseClass) {
        const map = {
            'evo-class-waldlaeufer': 'Waldläufer',
            'evo-class-krieger': 'Natur-Krieger',
            'evo-class-druide': 'Druide',
            'evo-class-hueter': 'Hüter',
            'evo-class-sucher': 'Sucher',
            'evo-class-einsiedler': 'Einsiedler',
            'evo-class-waechter': 'Wächter'
        };
        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => chooseClass(map[id]);
        });
    }

    if (canChoosePath) {
        const side = document.getElementById('sideContent');
        if (side) {
            side.innerHTML = `
                <div style="border-top:1px solid var(--gold); padding-top:10px;">
                    <h3 style="color:gold; margin:0 0 8px 0;">Pfad wählen</h3>
                    <button class="btn-action" style="width:100%; margin-bottom:8px;" onclick="choosePath('Licht')">☀️ LICHT</button>
                    <button class="btn-action" style="width:100%; background:#333;" onclick="choosePath('Dunkel')">🌑 DUNKEL</button>
                </div>
            `;
        }
    }

    const side = document.getElementById('sideContent');
    if (side && tier === 0) {
        side.innerHTML = `
            <div style="border-top:1px solid var(--gold); padding-top:10px;">
                <h3 style="color:gold; margin:0 0 8px 0;">Sprössling werden</h3>
                <div style="font-size:13px; color:#aaa;">Benötigt: 5000 LXP</div>
                <button class="btn-action" style="width:100%; margin-top:8px;" ${canSprout ? '' : 'disabled'} onclick="evolveTo(1)">🌱 FREISCHALTEN</button>
            </div>
        `;
    }
}

// ==========================================
// 2. LOGIK: LEVEL-CAP & XP-PUFFER
// ==========================================

function gainLXP(amount) {
    const evo = data.stats.totalEvoLevel || 0;
    const lvl = data.stats.currentLevel || 0;
    
    let cap = 1;
    if (evo === 1) cap = 2;
    if (evo >= 2) cap = (evo - 1) * 30;
    if (evo >= 5) cap = 240; 
    if (evo >= 6) cap = 270;

    if (lvl >= cap) {
        data.stats.hiddenXP = (data.stats.hiddenXP || 0) + amount;
    } else {
        data.lxp += amount;
        checkLevelUp();
    }
    
    if (document.getElementById('modalLeft')) initEvoHallDisplay();
}

function checkLevelUp() {
    const xpPerLevel = 1000;
    while (data.lxp >= xpPerLevel) {
        data.lxp -= xpPerLevel;
        data.stats.currentLevel++;
    }
}

// ==========================================
// 3. TRANSFORMATION & UI
// ==========================================

function renderEvoMenu() {
    // Ruft das Display-Update auf, sobald das Menü gerendert wird
    initEvoHallDisplay();
}

function evolveTo(newTier, chosenClass = null, chosenPath = null) {
    if (newTier === 1) {
        if ((data.stats.totalEvoLevel || 0) !== 0) return;
        if (!canEvolveTo(1)) return;
        data.lxp -= 5000;
        data.stats.totalEvoLevel = 1;
        const entry = EVO_DATA["Sprössling"];
        data.stats.className = "Sprössling";
        data.maxHp = entry.hp;
        data.hp = data.maxHp;
        data.stats.atk = entry.atk;
        data.stats.def = entry.def;
    } else {
        if (!canEvolveTo(newTier)) return;
        if (newTier === 2) {
            if (!data.stats.baseClass) return;
            if (chosenPath) data.stats.path = chosenPath;
            const path = data.stats.path || "Licht";
            data.stats.totalEvoLevel = 2;
            const entry2 = EVO_DATA[data.stats.baseClass][path][0];
            data.stats.className = entry2.name;
            data.maxHp = entry2.hp;
            data.hp = data.maxHp;
            data.stats.atk = entry2.atk;
            data.stats.def = entry2.def;
        } else {
            const path = data.stats.path || "Licht";
            data.stats.totalEvoLevel = newTier;
            const entry = EVO_DATA[data.stats.baseClass][path][Math.min(newTier - 2, 6)];
            data.stats.className = entry.name;
            data.maxHp = entry.hp;
            data.hp = data.maxHp;
            data.stats.atk = entry.atk;
            data.stats.def = entry.def;
        }
    }

    if (data.stats.hiddenXP > 0) {
        let b = data.stats.hiddenXP;
        data.stats.hiddenXP = 0;
        gainLXP(b);
    }

    data.stats.className = data.stats.className || "Ei";
    save();
    updateUI();
    initEvoHallDisplay();
}

function getCreatureSprite(player) {
    function normalize(img) {
        if (img === 'HoeheresWesen.png') return 'HoeherWesen.png';
        return img;
    }
    const evo = player.stats.totalEvoLevel || 0;
    if (evo === 0) return normalize(EVO_DATA["Ei"].img);
    if (evo === 1) return normalize(EVO_DATA["Sprössling"].img);
    const path = player.stats.path || "Licht";
    const cl = player.stats.baseClass || "Waldläufer";
    return normalize(EVO_DATA[cl][path][Math.min(evo - 2, 6)].img);
}

function getCreatureEmoji(player) {
    const evo = player?.stats?.totalEvoLevel || 0;
    if (evo === 0) return '🥚';
    if (evo === 1) return '💧';
    const path = player?.stats?.path || 'Licht';
    const cl = player?.stats?.baseClass || 'Waldläufer';
    const idx = Math.min(evo - 2, 6);
    const entry = EVO_DATA[cl] && EVO_DATA[cl][path] && EVO_DATA[cl][path][idx];
    const img = entry?.img || '';
    const map = {
        'Skelett.png': '💀',
        'Goblin.png': '👹',
        'Oger.png': '👹',
        'Lich.png': '🧙‍♂️',
        'HoeheresWesen.png': '✨',
        'HoeherWesen.png': '✨'
    };
    return map[img] || '🙂';
}

function chooseClass(chosenClass) {
    if ((data.stats.totalEvoLevel || 0) !== 1) return;
    if (data.stats.baseClass) return;
    if (!canEvolveTo(2)) return;
    data.stats.baseClass = chosenClass;
    data.stats.className = data.stats.className || "Ei";
    save();
    updateUI();
    initEvoHallDisplay();
}

function choosePath(chosenPath) {
    if ((data.stats.totalEvoLevel || 0) !== 1) return;
    if (!data.stats.baseClass) return;
    if (!canEvolveTo(2)) return;
    data.stats.path = chosenPath;
    evolveTo(2, null, chosenPath);
}

const EVOLUTION_CAPS = { 2: 30, 3: 60, 4: 90, 5: 120, 6: 150, 7: 180 };
function getEP() {
    const s = data.stats || {};
    return (s.epCount != null ? s.epCount : s.dailyMarkers) || 0;
}
function canEvolveTo(tier) {
    if (tier === 1) return (data.lxp || 0) >= 5000;
    const cap = EVOLUTION_CAPS[tier] || 9999;
    const lvl = data.stats.currentLevel || 0;
    const ep = getEP();
    const hasEPTracking = !!(data.stats && ("epCount" in data.stats || "dailyMarkers" in data.stats));
    return lvl >= cap && (hasEPTracking ? ep >= cap : true);
}

window.EVO_DATA = EVO_DATA;
window.renderEvoMenu = renderEvoMenu;
window.evolveTo = evolveTo;
window.getCreatureSprite = getCreatureSprite;
window.getCreatureEmoji = getCreatureEmoji;
window.gainLXP = gainLXP;
window.checkLevelUp = checkLevelUp;
window.initEvoHallDisplay = initEvoHallDisplay;
window.chooseClass = chooseClass;
window.choosePath = choosePath;
window.canEvolveTo = canEvolveTo;
window.getEP = getEP;
