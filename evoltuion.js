/**
 * THE NEST: EVOLUTION & CLASS SYSTEM (evolution.js)
 * Verantwortlich für: Transformation, Stat-Berechnung & Pfad-Logik.
 */

// ==========================================
// 1. DIE DATEN-MATRIX (EVO_DATA)
// ==========================================
const EVO_DATA = {
    "Ei": { hp: 50, atk: 5, def: 5 },
    "Sprössling": { hp: 55, atk: 10, def: 10 },
    "Waldläufer": {
        "Licht": [
            { name: "Licht-Novize", hp: 45, atk: 65, def: 40 },
            { name: "Pfadfinder des Glanzes", hp: 50, atk: 80, def: 45 },
            { name: "Licht-Bogenschütze", hp: 55, atk: 100, def: 50 },
            { name: "Scharfschütze des Hains", hp: 60, atk: 125, def: 55 },
            { name: "Elite-Waidmann", hp: 65, atk: 150, def: 60 },
            { name: "Meister-Wildläufer", hp: 75, atk: 180, def: 70 },
            { name: "Legendärer Licht-Schütze", hp: 90, atk: 220, def: 80 }
        ],
        "Dunkel": [
            { name: "Schatten-Striezi", hp: 45, atk: 65, def: 40 },
            { name: "Nacht-Schleicher", hp: 50, atk: 90, def: 40 },
            { name: "Gift-Dolch-Adept", hp: 55, atk: 120, def: 40 },
            { name: "Hinterhalt-Assassine", hp: 60, atk: 155, def: 40 },
            { name: "Schatten-Viper", hp: 65, atk: 195, def: 45 },
            { name: "Meister der lautlosen Klinge", hp: 70, atk: 240, def: 45 },
            { name: "Legendärer Nachtschatten-Assassine", hp: 80, atk: 285, def: 50 }
        ]
    },
    "Krieger": {
        "Licht": [
            { name: "Knappe des Lichts", hp: 80, atk: 50, def: 60 },
            { name: "Strahlender Soldat", hp: 100, atk: 65, def: 80 },
            { name: "Sonnen-Ritter", hp: 130, atk: 85, def: 110 },
            { name: "Paladin der Morgenröte", hp: 170, atk: 110, def: 150 },
            { name: "Heiliger Champion", hp: 220, atk: 140, def: 200 },
            { name: "Göttlicher Kriegsfürst", hp: 280, atk: 180, def: 260 },
            { name: "Legendärer Sonnen-Souverän", hp: 350, atk: 230, def: 350 }
        ],
        "Dunkel": [
            { name: "Schatten-Klinge", hp: 70, atk: 70, def: 40 },
            { name: "Finsterer Rebell", hp: 90, atk: 95, def: 55 },
            { name: "Chaos-Ritter", hp: 110, atk: 130, def: 75 },
            { name: "Dunkler Eroberer", hp: 140, atk: 175, def: 100 },
            { name: "Schatten-Berserker", hp: 180, atk: 230, def: 130 },
            { name: "Fürst der Finsternis", hp: 230, atk: 300, def: 170 },
            { name: "Legendärer Schatten-Souverän", hp: 300, atk: 415, def: 220 }
        ]
    }
    // Druide, Hüter, Sucher folgen hier analog...
};

// ==========================================
// 2. LOGIK-FUNKTIONEN
// ==========================================

/**
 * Ermittelt die exakte Form basierend auf Zeit (Monate) und Wahl.
 * @param {Object} user - Das User-Objekt aus storage.js
 */
function calculateCurrentForm(user) {
    const evoLevel = user.stats.totalEvoLevel; // 0 = Ei, 1 = Sprössling, 2-8 = Stufen 1-7
    const path = user.stats.path || "Licht";
    const className = user.stats.baseClass;

    if (evoLevel === 0) return "Ei";
    if (evoLevel === 1) return "Sprössling";

    const classData = EVO_DATA[className];
    if (!classData) return "Unbekanntes Wesen";

    // Index-Berechnung: evoLevel 2 entspricht Index 0 in der Liste
    const tierIndex = Math.min(Math.max(evoLevel - 2, 0), 6);
    return classData[path][tierIndex].name;
}

/**
 * Berechnet den Bonus-Multiplikator für Subscriber.
 * @param {Object} baseStats - Die Basis-Werte aus EVO_DATA
 * @param {string} subTier - "Küken", "Adept", "Göttlicher Avatar", etc.
 */
function applySubBonus(baseStats, subTier) {
    const bonuses = {
        "None": 1.0,
        "Küken": 1.05,
        "Nest-Hüter": 1.25,
        "Phönix-Ritter": 1.50,
        "Göttlicher Avatar": 3.00 // +200% entspricht Faktor 3
    };

    const multiplier = bonuses[subTier] || 1.0;
    return {
        hp: Math.floor(baseStats.hp * multiplier),
        atk: Math.floor(baseStats.atk * multiplier),
        def: Math.floor(baseStats.def * multiplier)
    };
}

/**
 * Aktualisiert die CSS-Klassen für das Frontend.
 */
function updateAvatarVisuals(user) {
    const avatarElement = document.getElementById(`avatar-${user.id}`);
    if (!avatarElement) return;

    // Klassen zurücksetzen
    avatarElement.className = "avatar-sprite";

    // Pfad-Aura zuweisen
    if (user.stats.path === "Dunkel") avatarElement.classList.add("shadow-path");
    else if (user.stats.path === "Licht") avatarElement.classList.add("light-path");

    // Sub-Glühen (Boss-Aura)
    if (user.isSub) avatarElement.classList.add("boss-aura");
}

// ==========================================
// 3. STORAGE & BATTLE INTERFACE
// ==========================================

/**
 * Speichert die Wahl des Users permanent.
 */
function saveEvolutionChoice(userId, chosenClass, chosenPath) {
    const userData = Storage.getUser(userId);
    userData.stats.baseClass = chosenClass;
    userData.stats.path = chosenPath;
    userData.stats.totalEvoLevel = 2; // Erster Aufstieg nach Sprössling
    Storage.saveUser(userData);
}

/**
 * Bereitstellung der finalen Stats für battle.js
 */
function getBattleStats(user) {
    const formName = calculateCurrentForm(user);
    let baseStats;

    if (user.stats.totalEvoLevel < 2) {
        baseStats = EVO_DATA[formName === "Ei" ? "Ei" : "Sprössling"];
    } else {
        const tierIndex = Math.min(user.stats.totalEvoLevel - 2, 6);
        baseStats = EVO_DATA[user.stats.baseClass][user.stats.path][tierIndex];
    }

    return applySubBonus(baseStats, user.subTier);
}

// ==========================================
// 4. UI: EVOLUTIONS-MENÜ
// ==========================================

function openEvoModal(user) {
    if (user.stats.currentLevel < 2) {
        console.log("Du bist noch zu jung zum Evoluieren!");
        return;
    }

    const modalHTML = `
        <div class="evo-modal">
            <h2>Wähle dein Schicksal, Sprössling!</h2>
            <div class="evo-choice-box">
                <div class="evo-card" onclick="confirmEvo('${user.id}', 'Krieger', 'Licht')">
                    <h3>Licht-Krieger</h3>
                    <p>Hohe DEF & HP. Ein Schild für das Nest.</p>
                </div>
                <div class="evo-card" onclick="confirmEvo('${user.id}', 'Waldläufer', 'Dunkel')">
                    <h3>Schatten-Assassine</h3>
                    <p>Massiver ATK. Schlag aus dem Dunkeln zu.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
