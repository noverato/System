/**
 * AssetsLibrary - Zentrale Verwaltung aller 3D-Assets im animation-Ordner.
 * Diese Bibliothek stellt sicher, dass alle Pfade korrekt kodiert sind (GitHub-kompatibel).
 * Alle Ordner aus dem animation-Verzeichnis sind hier 1:1 abgebildet.
 */

const AssetsLibrary = (() => {
    const BASE_URL = 'animation/';

    const ASSETS = {
        // Medieval Village MegaKit [Standard] - "village" / "häuse"
        VILLAGE: {
            PATH: 'Medieval Village MegaKit[Standard]/glTF/',
            BUILDINGS: {
                WALL_BRICK: 'Wall_Brick.gltf',
                WALL_PLASTER: 'Wall_Plaster.gltf',
                WALL_WINDOW_BRICK: 'Wall_Window_Brick.gltf',
                WALL_WINDOW_PLASTER: 'Wall_Window_Plaster.gltf',
                ROOF_CENTER: 'Roof_Center.gltf',
                ROOF_SIDE: 'Roof_Side.gltf',
                ROOF_CORNER: 'Roof_Corner.gltf',
                FLOOR_BRICK: 'Floor_Brick.gltf',
                FLOOR_WOOD: 'Floor_WoodDark.gltf',
                DOOR_FLAT: 'Door_1_Flat.gltf',
                DOOR_ROUND: 'Door_1_Round.gltf',
                WALL_DOOR: 'Wall_Plaster_Door_Flat.gltf',
                WALL_WINDOW: 'Wall_Plaster_Window_Wide_Flat.gltf',
                WALL_STRAIGHT: 'Wall_Plaster_Straight.gltf',
                CORNER: 'Corner_Exterior_Brick.gltf',
                ROOF_4X4: 'Roof_RoundTiles_4x4.gltf',
                CHIMNEY: 'Prop_Chimney.gltf',
                BALCONY: 'Balcony_Simple_Straight.gltf',
                STAIRS: 'Stairs_Wood.gltf'
            }
        },

        // Bäume Ordner - "bäume" / "büsche"
        TREES: {
            PATH: 'bäume/glTF/',
            LIST: [
                'BirchTree_1.gltf', 'BirchTree_2.gltf', 'BirchTree_3.gltf', 'BirchTree_4.gltf', 'BirchTree_5.gltf',
                'MapleTree_1.gltf', 'MapleTree_2.gltf', 'MapleTree_3.gltf', 'MapleTree_4.gltf', 'MapleTree_5.gltf',
                'DeadTree_1.gltf', 'DeadTree_2.gltf', 'DeadTree_3.gltf', 'DeadTree_4.gltf', 'DeadTree_5.gltf',
                'DeadTree_6.gltf', 'DeadTree_7.gltf', 'DeadTree_8.gltf', 'DeadTree_9.gltf', 'DeadTree_10.gltf'
            ],
            BUSHES: [
                'Bush.gltf', 'Bush_Large.gltf', 'Bush_Small.gltf',
                'Bush_Flowers.gltf', 'Bush_Large_Flowers.gltf', 'Bush_Small_Flowers.gltf'
            ],
            FLOWERS: [
                'Flower_1.gltf', 'Flower_2.gltf', 'Flower_1_Clump.gltf', 'Flower_2_Clump.gltf',
                'Flower_3_Clump.gltf', 'Flower_4_Clump.gltf', 'Flower_5_Clump.gltf'
            ],
            GRASS: ['Grass_Large.gltf', 'Grass_Small.gltf']
        },

        // Nature Ordner - "nature"
        NATURE: {
            PATH: 'Nature/glTF/',
            TREES: [
                'CommonTree_1.gltf', 'CommonTree_2.gltf', 'CommonTree_3.gltf', 'CommonTree_4.gltf', 'CommonTree_5.gltf',
                'Pine_1.gltf', 'Pine_2.gltf', 'Pine_3.gltf', 'Pine_4.gltf', 'Pine_5.gltf',
                'TwistedTree_1.gltf', 'TwistedTree_2.gltf', 'TwistedTree_3.gltf', 'TwistedTree_4.gltf', 'TwistedTree_5.gltf',
                'DeadTree_1.gltf', 'DeadTree_2.gltf', 'DeadTree_3.gltf', 'DeadTree_4.gltf', 'DeadTree_5.gltf'
            ],
            BUSHES: ['Bush_Common.gltf', 'Bush_Common_Flowers.gltf'],
            FLOWERS: [
                'Flower_3_Group.gltf', 'Flower_3_Single.gltf', 
                'Flower_4_Group.gltf', 'Flower_4_Single.gltf'
            ],
            ROCKS: [
                'Rock_Medium_1.gltf', 'Rock_Medium_2.gltf', 'Rock_Medium_3.gltf',
                'Pebble_Round_1.gltf', 'Pebble_Square_1.gltf'
            ],
            GRASS: ['Grass_Common_Short.gltf', 'Grass_Common_Tall.gltf']
        },

        // Fantasy Props - "Fantasy props"
        PROPS: {
            PATH: 'Fantasy props/Exports/glTF/',
            LIST: {
                ANVIL: 'Anvil.gltf',
                BARREL: 'Barrel.gltf',
                BENCH: 'Bench.gltf',
                CHEST: 'Chest_Wood.gltf',
                CRATE: 'Crate_Wooden.gltf',
                TABLE: 'Table_Large.gltf',
                STOOL: 'Stool.gltf',
                BED: 'Bed_Twin1.gltf',
                BOOKCASE: 'Bookcase_2.gltf',
                LANTERN: 'Lantern_Wall.gltf',
                SWORD: 'Sword_Bronze.gltf',
                AXE: 'Axe_Bronze.gltf'
            }
        },

        // Dunge - "Dunge" (Dungeon Assets)
        DUNGEON: {
            PATH: 'Dunge/Assets/gltf/',
            LIST: {
                BARREL: 'barrel_large.gltf',
                CHEST: 'chest.gltf',
                COLUMN: 'column.gltf',
                TORCH: 'torch_mounted.gltf',
                STAIRS: 'stairs.gltf',
                TABLE: 'table_long.gltf',
                CHAIR: 'chair.gltf'
            }
        },

        // Ressourcen - "Ressourcen"
        RESOURCES: {
            PATH: 'Ressourcen/gltf/',
            LIST: {
                GOLD_BAR: 'Gold_Bar.gltf',
                IRON_BAR: 'Iron_Bar.gltf',
                COPPER_BAR: 'Copper_Bar.gltf',
                SILVER_BAR: 'Silver_Bar.gltf',
                WOOD_LOG: 'Wood_Log_A.gltf',
                STONE_BRICK: 'Stone_Brick.gltf',
                GOLD_NUGGET: 'Gold_Nugget_Medium.gltf'
            }
        },

        // Adventures Characters
        CHARACTERS: {
            PATH: 'Adventures/Characters/gltf/',
            MODELS: {
                KNIGHT: 'Knight.glb',
                BARBARIAN: 'Barbarian.glb',
                MAGE: 'Mage.glb',
                RANGER: 'Ranger.glb',
                ROGUE: 'Rogue.glb'
            }
        },

        // Adventures Assets
        ADVENTURE_ASSETS: {
            PATH: 'Adventures/Assets/gltf/',
            LIST: {
                SWORD: 'sword_1handed.gltf',
                SHIELD: 'shield_round.gltf',
                BOW: 'bow.gltf',
                MUG: 'mug_full.gltf'
            }
        },

        // Skellet Ordner - "Skellet"
        SKELETONS: {
            PATH: 'Skellet/characters/gltf/',
            MODELS: {
                WARRIOR: 'Skeleton_Warrior.glb',
                MAGE: 'Skeleton_Mage.glb',
                ROGUE: 'Skeleton_Rogue.glb',
                MINION: 'Skeleton_Minion.glb'
            },
            ANIMATIONS: {
                PATH: 'Skellet/Animation/Rig_Medium/',
                GENERAL: 'Rig_Medium_General.glb',
                MOVEMENT: 'Rig_Medium_MovementBasic.glb'
            },
            ASSETS: {
                PATH: 'Skellet/assets/gltf/',
                AXE: 'Skeleton_Axe.gltf',
                BLADE: 'Skeleton_Blade.gltf',
                CROSSBOW: 'Skeleton_Crossbow.gltf',
                STAFF: 'Skeleton_Staff.gltf',
                SHIELD_A: 'Skeleton_Shield_Large_A.gltf',
                SHIELD_B: 'Skeleton_Shield_Large_B.gltf'
            }
        }
    };

    /**
     * Kodiert einen Pfad GitHub-konform (Leerzeichen -> %20, eckige Klammern bleiben).
     */
    function encodePath(fullPath) {
        return fullPath
            .split('/')
            .map(segment => encodeURIComponent(segment)
                .replace(/%5B/g, '[')
                .replace(/%5D/g, ']')
            )
            .join('/')
            .replace(/%3A/g, ':');
    }

    return {
        /**
         * Kodiert einen beliebigen Pfad GitHub-konform.
         */
        encode(path) {
            return encodePath(path);
        },

        /**
         * Gibt den vollständig kodierten Pfad für ein Asset zurück.
         * @param {string} category - Die Hauptkategorie (z.B. 'VILLAGE')
         * @param {string} subKey - Der Schlüssel oder Dateiname (z.B. 'WALL_BRICK')
         * @returns {string} Der kodierte Pfad
         */
        get(category, subKey) {
            if (!ASSETS[category]) {
                console.error(`Kategorie ${category} nicht in AssetsLibrary gefunden.`);
                return null;
            }

            const cat = ASSETS[category];
            let fileName = '';

            // Suche in verschiedenen Unterstrukturen
            if (cat.BUILDINGS && cat.BUILDINGS[subKey]) fileName = cat.BUILDINGS[subKey];
            else if (cat.MODELS && cat.MODELS[subKey]) fileName = cat.MODELS[subKey];
            else if (cat.LIST && cat.LIST[subKey]) fileName = cat.LIST[subKey];
            else if (cat.ANIMATIONS && cat.ANIMATIONS[subKey]) {
                return encodePath(BASE_URL + cat.ANIMATIONS.PATH + cat.ANIMATIONS[subKey]);
            }
            else if (cat.ASSETS && cat.ASSETS[subKey]) {
                // Prüfe ob es ein verschachtelter Pfad in ASSETS ist
                if (typeof cat.ASSETS === 'object' && cat.ASSETS.PATH) {
                    return encodePath(BASE_URL + cat.ASSETS.PATH + cat.ASSETS[subKey]);
                }
                fileName = cat.ASSETS[subKey];
            }
            else fileName = subKey; // Falls der subKey direkt der Dateiname ist

            return encodePath(BASE_URL + cat.PATH + fileName);
        },

        /**
         * Gibt eine Liste aller Bäume zurück (kombiniert aus Nature und Bäume).
         */
        getAllTrees() {
            const trees = [];
            ASSETS.NATURE.TREES.forEach(t => trees.push(encodePath(BASE_URL + ASSETS.NATURE.PATH + t)));
            ASSETS.TREES.LIST.forEach(t => trees.push(encodePath(BASE_URL + ASSETS.TREES.PATH + t)));
            return trees;
        },

        /**
         * Gibt eine Liste aller Büsche zurück.
         */
        getAllBushes() {
            const bushes = [];
            ASSETS.NATURE.BUSHES.forEach(b => bushes.push(encodePath(BASE_URL + ASSETS.NATURE.PATH + b)));
            ASSETS.TREES.BUSHES.forEach(b => bushes.push(encodePath(BASE_URL + ASSETS.TREES.PATH + b)));
            return bushes;
        },

        /**
         * Gibt eine Liste aller Blumen zurück.
         */
        getAllFlowers() {
            const flowers = [];
            ASSETS.NATURE.FLOWERS.forEach(f => flowers.push(encodePath(BASE_URL + ASSETS.NATURE.PATH + f)));
            ASSETS.TREES.FLOWERS.forEach(f => flowers.push(encodePath(BASE_URL + ASSETS.TREES.PATH + f)));
            return flowers;
        },

        // Zugriff auf das ASSETS Objekt für fortgeschrittene Nutzung
        get ASSETS() { return ASSETS; }
    };
})();

// Exportieren für das globale Fenster
window.AssetsLibrary = AssetsLibrary;
