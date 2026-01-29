/**
 * THE NEST - AVATAR ANCHOR SYSTEM
 * Erstellt die visuelle Verbindung zwischen Avataren und Ausrüstung.
 */

// 1. FullLootPool global verfügbar machen (als flache Liste für schnellen Zugriff)
window.allItems = {};

(function prepareGlobalLoot() {
    // Wir iterieren durch den komplexen FullLootPool aus loot.js
    // Struktur: FullLootPool[Kategorie][Tier][Pfad]
    for (const category in FullLootPool) {
        for (const tier in FullLootPool[category]) {
            ['light', 'dark'].forEach(path => {
                FullLootPool[category][tier][path].forEach(item => {
                    // Mapping nach Item-Name für inventar.js
                    window.allItems[item.name] = item;
                });
            });
        }
    }
    console.log(`[Anchor-System] ${Object.keys(window.allItems).length} Items in globalen Pool geladen.`);
})();

// 2. Zentrale Datenbank für Avatar-Ankerpunkte
// Hier definierst du einmal pro Avatar die Offsets für Waffentypen.
const AvatarAnchors = {
    "Warrior_Male": {
        "weapon": { x: 12, y: -5, rotation: 45 },
        "shield": { x: -10, y: 5, rotation: 0 }
    },
    "Mage_Female": {
        "weapon": { x: 8, y: -12, rotation: 90 },
        "shield": { x: -8, y: 0, rotation: 0 }
    },
    // Hier werden die restlichen der 98 Avatare ergänzt...
    "Default": {
        "weapon": { x: 0, y: 0, rotation: 0 },
        "shield": { x: 0, y: 0, rotation: 0 }
    }
};

/**
 * 3. Injektions-Funktion
 * Speist die Anker-Daten in das 'offsets' Feld jedes Items ein.
 */
function injectAvatarAnchors() {
    const allAvatarIDs = Object.keys(AvatarAnchors);
    let injectionCount = 0;

    for (const itemName in window.allItems) {
        const item = window.allItems[itemName];
        
        // Wir gehen jeden Avatar durch und setzen den passenden Slot-Offset
        allAvatarIDs.forEach(avatarID => {
            const slot = item.slot; // "weapon" oder "shield"
            
            if (AvatarAnchors[avatarID] && AvatarAnchors[avatarID][slot]) {
                // Weise dem Item den spezifischen Offset für diesen Avatar zu
                item.offsets[avatarID] = AvatarAnchors[avatarID][slot];
            } else {
                // Fallback auf Default, falls Avatar/Slot nicht definiert
                item.offsets[avatarID] = AvatarAnchors["Default"][slot] || { x:0, y:0, rotation:0 };
            }
        });
        injectionCount++;
    }
    console.log(`[Anchor-System] Offsets für ${injectionCount} Items erfolgreich injiziert.`);
}

// Ausführung der Injektion beim Laden
injectAvatarAnchors();
