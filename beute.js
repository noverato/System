/**
 * 🧺 beute.js (Optimiert)
 * Beute-Interpreter für THE NEST
 */

const Beute = (() => {

    /* ==============================
       🔍 DATEN AUS MONSTER-LIBRARY
    ============================== */
    // Wir ziehen uns die Namen direkt, um Tippfehler zu vermeiden
    const PREFIXES = MONSTER_PREFIXES.map(p => p.name);
    const SUFFIXES = MONSTER_SUFFIXES.slice();

    /* ==============================
       🧠 KERN-MAPPING
       (Monsterkern → Beute-Kategorie)
    ============================== */
    const CORE_TO_LOOT = [
        { key: "wolf", match: ["wolf"], label: "Fell" },
        { key: "bär", match: ["bär"], label: "Fell" },
        { key: "spinne", match: ["spinne"], label: "Chitin" },
        { key: "skelett", match: ["skelett", "knochen", "gigant"], label: "Knochen" },
        { key: "slime", match: ["slime"], label: "Schleim" },
        { key: "golem", match: ["golem"], label: "Kern" },
        { key: "geist", match: ["geist"], label: "Essenz" },
        { key: "bandit", match: ["bandit", "meister", "monarch"], label: "Habseligkeiten" },
        { key: "goblin", match: ["goblin"], label: "Ohr" }, // Neu hinzugefügt
        { key: "vampir", match: ["vampir"], label: "Zahn" }, // Neu hinzugefügt
        { key: "minotaurus", match: ["minotaurus"], label: "Horn" } // Neu hinzugefügt
    ];

    /* ==============================
       🧪 HELFER (Optimiert)
    ============================== */

    function findPrefix(monsterName) {
        // Wir suchen das Präfix am Anfang. 
        // Wichtig: Bosse fangen mit "BOSS: " an, das ignorieren wir oder schneiden es ab.
        const cleanName = monsterName.replace("BOSS: ", "");
        return PREFIXES.find(p => cleanName.startsWith(p)) || null;
    }

    function findSuffix(monsterName) {
        return SUFFIXES.find(s => monsterName.endsWith(s)) || null;
    }

    function findCoreLabel(monsterName) {
        const lower = monsterName.toLowerCase();
        const entry = CORE_TO_LOOT.find(e =>
            e.match.some(m => lower.includes(m))
        );
        return entry ? entry.label : "Überrest"; // Fallback statt null
    }

    /* ==============================
       🎁 HAUPTFUNKTION
    ============================== */

    function applyBeuteFlavor(baseItem, monster) {
        if (!baseItem || !monster || !monster.name) return baseItem;

        const monsterName = monster.name;
        const prefix = findPrefix(monsterName);
        const suffix = findSuffix(monsterName);
        const coreLabel = findCoreLabel(monsterName);

        let nameParts = [];

        // 1. Präfix (z.B. "Riesiges")
        if (prefix) nameParts.push(prefix);

        // 2. Kern + Basis-Item (z.B. "Wolf-Fell")
        // Wir nutzen den coreLabel und verbinden ihn mit dem Item-Namen (z.B. Gold)
        nameParts.push(`${coreLabel}-${baseItem.display_name}`);

        // 3. Suffix (z.B. "des Schreckens")
        if (suffix) nameParts.push(suffix);

        return {
            ...baseItem,
            display_name: nameParts.join(" ")
        };
    }

    return {
        applyBeuteFlavor
    };

})();

window.Beute = Beute;
