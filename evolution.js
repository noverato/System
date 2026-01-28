/**
 * THE NEST: EVOLUTION SYSTEM (evolution.js)
 * Master-Struktur für die Overlord Edition 2026
 */

// 1. DIE DATEN-MATRIX (Konstanten bleiben hier, da sie global für alle gelten)
const EVO_DATA = {
    "Ei": { hp: 50, atk: 5, def: 5, img: 'Ei.png' },
    "Sprössling": { hp: 55, atk: 10, def: 10, img: 'Schleim.png' },
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
    "Krieger": {
        "Licht": [
            { name: "Knappe des Lichts", hp: 80, atk: 50, def: 60, img: 'Skelett.png' },
            { name: "Strahlender Soldat", hp: 100, atk: 65, def: 80, img: 'Skelett.png' },
            { name: "Sonnen-Ritter", hp: 130, atk: 85, def: 110, img: 'Goblin.png' },
            { name: "Paladin der Morgenröte", hp: 170, atk: 110, def: 150, img: 'Oger.png' },
            { name: "Heiliger Champion", hp: 220, atk: 140, def: 200, img: 'Oger.png' },
            { name: "Göttlicher Kriegsfürst", hp: 280, atk: 180, def: 260, img: 'Lich.png' },
            { name: "Legendärer Sonnen-Souverän", hp: 350, atk: 230, def: 350, img: 'HoeheresWesen.png' }
        ],
        "Dunkel": [
            { name: "Schatten-Klinge", hp: 70, atk: 70, def: 40, img: 'Skelett.png' },
            { name: "Finsterer Rebell", hp: 90, atk: 95, def: 55, img: 'Skelett.png' },
            { name: "Chaos-Ritter", hp: 110, atk: 130, def: 75, img: 'Goblin.png' },
            { name: "Dunkler Eroberer", hp: 140, atk: 175, def: 100, img: 'Oger.png' },
            { name: "Schatten-Berserker", hp: 180, atk: 230, def: 130, img: 'Oger.png' },
            { name: "Fürst der Finsternis", hp: 230, atk: 300, def: 170, img: 'Lich.png' },
            { name: "Legendärer Schatten-Souverän", hp: 300, atk: 415, def: 220, img: 'HoeheresWesen.png' }
        ]
    }
};

// 2. LOGIK-FUNKTIONEN

/**
 * Zieht das richtige Sprite-Bild basierend auf der Evolutionsebene.
 * Wird direkt von renderPlayers() in der HTML aufgerufen.
 */
function getCreatureSprite(player, isBoss = false) {
    const evo = player.stats.totalEvoLevel || 0;
    const path = player.stats.path || "Licht";
    const className = player.stats.baseClass || "Waldläufer";

    if (evo === 0) return EVO_DATA["Ei"].img;
    if (evo === 1) return EVO_DATA["Sprössling"].img;

    // Klassen-Logik
    const classSet = EVO_DATA[className];
    if (classSet && classSet[path]) {
        const tierIndex = Math.min(evo - 2, 6);
        return classSet[path][tierIndex].img;
    }

    return 'Ei.png'; // Fallback
}

/**
 * Öffnet das Evolutions-Menü im modalLeft Panel.
 */
function renderEvoMenu() {
    const leftPanel = document.getElementById('modalLeft');
    const evoLevel = data.stats.totalEvoLevel;
    const days = data.followDays || 0;
    const level = data.stats.currentLevel || 0;

    let html = `<div style="padding:20px; text-align:center;">
                <h1 style="color:var(--gold);">HALLE DER EVOLUTION</h1>`;

    if (evoLevel === 0 && level >= 1) {
        html += `<p>Du bist bereit für das Schlüpfen!</p>
                 <button class="btn-action" onclick="evolveTo(1)">VOM EI ZUM SPRÖSSLING</button>`;
    } else if (evoLevel === 1 && level >= 2) {
        html += `<p>Wähle deinen Pfad für die Ewigkeit:</p>
                 <div style="display:flex; gap:20px; justify-content:center; margin-top:20px;">
                    <div class="evo-card" onclick="evolveTo(2, 'Krieger', 'Licht')" style="border:1px solid var(--warrior); padding:10px; cursor:pointer;">
                        <h3>Licht-Krieger</h3><small>DEF-Bonus</small>
                    </div>
                    <div class="evo-card" onclick="evolveTo(2, 'Waldläufer', 'Dunkel')" style="border:1px solid var(--shadow-path); padding:10px; cursor:pointer;">
                        <h3>Schatten-Waldläufer</h3><small>ATK-Bonus</small>
                    </div>
                 </div>`;
    } else if (evoLevel >= 2) {
        const nextReq = (evoLevel + 1) * 30;
        html += `<h3>Aktuelle Stufe: ${data.stats.className}</h3>
                 <p>Nächste Evolution bei <b>${nextReq} Tagen</b> und <b>Level ${nextReq}</b>.</p>
                 <p>Fortschritt: ${days}/${nextReq} Tage | ${level}/${nextReq} Level</p>`;
        
        if (days >= nextReq && level >= nextReq) {
            html += `<button class="btn-action" onclick="evolveTo(${evoLevel + 1})">NÄCHSTE STUFE AUFSTEIGEN</button>`;
        }
    } else {
        html += `<p>Du bist noch ein unschuldiges Ei. Sammle LXP und steige im Level auf!</p>`;
    }

    html += `</div>`;
    leftPanel.innerHTML = html;
    document.getElementById('gameModal').style.display = 'flex';
}

/**
 * Führt die Evolution durch und speichert in Firebase.
 */
function evolveTo(newTier, chosenClass = null, chosenPath = null) {
    data.stats.totalEvoLevel = newTier;
    if (chosenClass) data.stats.baseClass = chosenClass;
    if (chosenPath) data.stats.path = chosenPath;

    // Stats aktualisieren
    if (newTier === 1) {
        data.stats.className = "Sprössling";
        data.maxHp = EVO_DATA["Sprössling"].hp;
    } else {
        const tierIndex = Math.min(newTier - 2, 6);
        const entry = EVO_DATA[data.stats.baseClass][data.stats.path][tierIndex];
        data.stats.className = entry.name;
        data.maxHp = entry.hp;
    }

    save(); // Firebase-Sync aus der Master-HTML
    updateUI(); // UI-Refresh aus der Master-HTML
    renderEvoMenu(); // Menü-Refresh
}
