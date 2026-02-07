(() => {
    const PALETTE = {
        walls: 0xfdf5e6,
        wood: 0x4a3728,
        roof: 0xa52a2a,
        grass: 0x567d46,
        water: 0x4fa3e1,
        stone: 0x808080,
        trunk: 0x3d2b1f
    };

    const CHUNK_SIZE = 128;
    
    // Basis-Pfad für Assets (Lokal vs. GitHub flexibel)
    // Dieser Pfad wird jetzt zentral in AssetsLibrary.js verwaltet.
    
    let chunks = new Map();
    let villageBuildings = [];
    const VILLAGE_POS = { x: 0, z: 0 };
    
    let isInterior = false;
    let currentInterior = null;
    let lastExteriorPos = null;

    const INTERIOR_POS_SMITHY = { x: 5000, y: 0, z: 5000 };
    const INTERIOR_POS_INN = { x: 5200, y: 0, z: 5200 };
    const INTERIOR_POS_MARKET = { x: 5400, y: 0, z: 5400 };

    let rainParticles = null;
    let grassInst = null;
    let fireParticles = [];
    let blacksmithNPC = null;
    let innkeeperNPC = null;
    let marketNPC = null;
    let villageGroups = [];
    let riverPlanes = [];

    function getQuality() {
        const pr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const cores = (navigator.hardwareConcurrency || 4);
        const mem = (navigator.deviceMemory || 4);
        let q = 2;
        if (pr <= 1 && (cores <= 4 || mem <= 4)) q = 1;
        if (pr >= 2 && cores >= 8 && mem >= 8) q = 3;
        return q;
    }

    const QUALITY = getQuality();

    // Fallback für globale noise-Variable, falls eine Bibliothek fehlt
    if (typeof window.noise === 'undefined') {
        window.noise = {
            perlin2: (x, y) => simpleNoise(x, y),
            seed: (s) => {}
        };
    }

    let loader;
    try {
        if (typeof THREE.GLTFLoader !== 'undefined') {
            loader = new THREE.GLTFLoader();
        } else {
            console.error("THREE.GLTFLoader ist nicht definiert. Stelle sicher, dass der Loader in index.html korrekt geladen wird.");
        }
    } catch (e) {
        console.error("Fehler beim Initialisieren des GLTFLoaders:", e);
    }

    const modelCache = new Map();

    async function loadModel(path) {
        if (modelCache.has(path)) return modelCache.get(path).clone();
        if (!loader) {
            console.warn("Loader nicht verfügbar für:", path);
            throw new Error("Loader not initialized");
        }
        
        // Die AssetsLibrary übernimmt jetzt die Pfad-Kodierung
        // Falls der Pfad bereits ein voller URL/kodiert ist, lassen wir ihn
        const encodedPath = (path.startsWith('http') || path.startsWith('animation/') || path.includes('%')) 
            ? path 
            : AssetsLibrary.encode(path);
        
        const tryLoad = (fullPath) => {
            return new Promise((resolve, reject) => {
                console.log("Versuche Modell zu laden:", fullPath);
                loader.load(fullPath, (gltf) => {
                    modelCache.set(path, gltf.scene);
                    resolve(gltf.scene.clone());
                }, undefined, (err) => {
                    console.error(`Fehler beim Laden von ${fullPath}:`, err);
                    reject(err);
                });
            });
        };

        try {
            return await tryLoad(encodedPath);
        } catch (e) {
            // Fallback-Logik bleibt erhalten, falls der Pfad nicht aus der Library kam
            if (path.includes('/glTF/')) {
                const fallbackPath = path.replace('/glTF/', '/');
                console.log("Erster Ladeversuch fehlgeschlagen, versuche Fallback:", fallbackPath);
                return await tryLoad(fallbackPath);
            }
            throw e;
        }
    }

    async function createModularHouse(type = 'small') {
        const group = new THREE.Group();
        const SCALE = 6.0; // Deutlich größer für bessere Sichtbarkeit
        
        try {
            if (type === 'small') {
                const BASE_SIZE = 4.0; // Die Modelle sind meist 4x4 Einheiten
                const TARGET_SIZE = 5.0; // Wir wollen 5x5 Einheiten (Skalierung 1.25)
                const wallScale = TARGET_SIZE / BASE_SIZE;
                const wallDist = TARGET_SIZE / 2;

                // Boden
                const floor = await loadModel(AssetsLibrary.get('VILLAGE', 'FLOOR_WOOD'));
                floor.scale.set(wallScale, 1, wallScale);
                group.add(floor);

                // Wände
                const wallConfigs = [
                    { path: 'WALL_DOOR', pos: [0, 0, wallDist], rot: 0 },
                    { path: 'WALL_WINDOW', pos: [wallDist, 0, 0], rot: Math.PI / 2 },
                    { path: 'WALL_STRAIGHT', pos: [0, 0, -wallDist], rot: Math.PI },
                    { path: 'WALL_STRAIGHT', pos: [-wallDist, 0, 0], rot: -Math.PI / 2 }
                ];

                for (const config of wallConfigs) {
                    const wall = await loadModel(AssetsLibrary.get('VILLAGE', config.path));
                    wall.position.set(...config.pos);
                    wall.rotation.y = config.rot;
                    wall.scale.x = wallScale; // In der Breite strecken auf 5m
                    group.add(wall);
                }

                // Ecken (Pfeiler)
                for (let i = 0; i < 4; i++) {
                    const corner = await loadModel(AssetsLibrary.get('VILLAGE', 'CORNER'));
                    const angle = i * (Math.PI / 2);
                    const x = (i === 0 || i === 3 ? 1 : -1) * wallDist;
                    const z = (i === 0 || i === 1 ? 1 : -1) * wallDist;
                    corner.position.set(x, 0, z);
                    corner.rotation.y = -angle + Math.PI/2;
                    group.add(corner);
                }

                // Dach (4x4 Modell auf 5x5 skalieren)
                const roof = await loadModel(AssetsLibrary.get('VILLAGE', 'ROOF_4X4'));
                roof.scale.set(wallScale, 1.3, wallScale); 
                roof.position.set(0, 4, 0); // Die Wände sind 4 Einheiten hoch
                group.add(roof);

                // Giebel (Dreiecke im Dach) - Vorne und Hinten schließen das Dach ab
                // Roof_Front_Brick4 ist ein fertiges Giebel-Dreieck
                const gableFront = await loadModel(AssetsLibrary.get('VILLAGE', 'ROOF_GABLE'));
                gableFront.position.set(0, 4, wallDist);
                gableFront.scale.set(wallScale, 1.3, 1);
                group.add(gableFront);

                const gableBack = await loadModel(AssetsLibrary.get('VILLAGE', 'ROOF_GABLE'));
                gableBack.position.set(0, 4, -wallDist);
                gableBack.rotation.y = Math.PI;
                gableBack.scale.set(wallScale, 1.3, 1);
                group.add(gableBack);

                group.scale.set(SCALE, SCALE, SCALE);
            }
        } catch (e) {
            console.error("Error building modular house:", e);
            // Fallback: Einfaches Low-Poly Haus
            const houseBody = new THREE.Mesh(
                new THREE.BoxGeometry(7, 7, 7),
                new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true })
            );
            houseBody.position.y = 3.5;
            group.add(houseBody);

            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(6, 4, 4),
                new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true })
            );
            roof.position.y = 9;
            roof.rotation.y = Math.PI / 4;
            group.add(roof);
        }

        return group;
    }

    async function createMonsterModel(type = 'WARRIOR') {
        const group = new THREE.Group();
        try {
            // Hole Pfad aus AssetsLibrary
            const modelPath = AssetsLibrary.get('SKELETONS', type.toUpperCase());
            const model = await loadModel(modelPath);
            group.add(model);

            // Animationen vorbereiten (General Rig)
            const animPath = AssetsLibrary.get('SKELETONS', 'GENERAL');
            // Hier könnte man den AnimationMixer laden
        } catch (e) {
            console.error("Error creating monster model:", e);
            // Fallback: Rote Box
            const fallback = new THREE.Mesh(
                new THREE.BoxGeometry(4, 8, 4),
                new THREE.MeshStandardMaterial({ color: 0xff0000 })
            );
            fallback.position.y = 4;
            group.add(fallback);
        }
        return group;
    }

    // --- VERBESSERTE NOISE-FUNKTION (Multi-Octave) ---
    function simpleNoise(x, z) {
        let n = Math.sin(x * 0.0123 + z * 0.0456) + Math.cos(x * 0.0789 - z * 0.0123);
        n += Math.sin(x * 0.0234 - z * 0.0567) * 0.5;
        return n * 0.5;
    }

    function getOctaveNoise(x, z, octaves = 4) {
        let v = 0;
        let a = 1.0;
        let f = 1.0;
        for (let i = 0; i < octaves; i++) {
            v += simpleNoise(x * f, z * f) * a;
            f *= 2.0;
            a *= 0.5;
        }
        return v;
    }

    // --- DORF-POSITIONEN (für Terrain-Glättung) ---
    const VILLAGE_LOCATIONS = [
        { x: 0, z: 0, radius: 400 },     // Hauptdorf
        { x: 1200, z: 0, radius: 300 },   // Biome Dorf 1
        { x: -1200, z: 0, radius: 300 },  // Biome Dorf 2
        { x: 0, z: 1200, radius: 300 },   // Biome Dorf 3
        { x: 0, z: -1200, radius: 300 }   // Biome Dorf 4
    ];

    function getTerrainHeight(x, z) {
        const distToCenter = Math.hypot(x, z);
        
        // 1. Village Zone (Dorf-Bereiche flach halten)
        let villageFactor = 1.0;
        for (const loc of VILLAGE_LOCATIONS) {
            const d = Math.hypot(x - loc.x, z - loc.z);
            if (d < loc.radius) {
                const f = Math.max(0, (d - loc.radius * 0.4) / (loc.radius * 0.6));
                villageFactor = Math.min(villageFactor, Math.pow(f, 2));
            }
        }

        // 2. Basis-Höhe durch Biome bestimmt
        const biome = getBiomeData(x, z);
        let h = 0;

        // Biome-spezifische Höhenprofile
        const h_plains = getOctaveNoise(x * 0.005, z * 0.005, 3) * 10;
        const h_desert = getOctaveNoise(x * 0.002, z * 0.002, 2) * 5;
        const h_mountains = getOctaveNoise(x * 0.01, z * 0.01, 5) * 80;
        const h_snow = getOctaveNoise(x * 0.008, z * 0.008, 4) * 40;
        const h_jungle = getOctaveNoise(x * 0.015, z * 0.015, 4) * 25;
        const h_swamp = -5 + getOctaveNoise(x * 0.01, z * 0.01, 2) * 8;

        // Blending der Höhen basierend auf Biome-Gewichten
        h += h_plains * biome.weights.plains;
        h += h_desert * biome.weights.desert;
        h += h_snow * biome.weights.snow;
        h += h_jungle * biome.weights.jungle;
        h += h_swamp * biome.weights.swamp;

        // 3. Große Berge im Hintergrund (nur weit weg vom Zentrum und Dörfern)
        if (distToCenter > 1500) {
            const mountainEdge = (distToCenter - 1500) / 1000;
            h += h_mountains * Math.min(2.5, mountainEdge);
        }

        return h * villageFactor;
    }

    function getBiomeData(x, z) {
        const scale = 0.0002;
        // Zwei Noise-Werte für Temperatur und Feuchtigkeit
        const temp = getOctaveNoise(x * scale, z * scale, 3);
        const humidity = getOctaveNoise(x * scale + 1000, z * scale + 1000, 3);

        const weights = {
            desert: 0,
            snow: 0,
            jungle: 0,
            swamp: 0,
            plains: 0
        };

        // Sehr vereinfachtes Biome-Mapping (Whittaker-Diagramm Prinzip)
        if (temp > 0.4) {
            if (humidity < -0.2) weights.desert = 1;
            else weights.jungle = 1;
        } else if (temp < -0.4) {
            weights.snow = 1;
        } else {
            if (humidity < -0.3) weights.plains = 1;
            else if (humidity > 0.4) weights.swamp = 1;
            else weights.plains = 1;
        }

        // TODO: Hier könnte man noch echtes Blending (Interpolation) einbauen
        // Für den Moment nehmen wir das dominanteste Biome für die Farbe, 
        // aber die Höhe wird bereits geblendet.
        
        let primary = 'plains';
        if (weights.desert > 0.5) primary = 'desert';
        if (weights.snow > 0.5) primary = 'snow';
        if (weights.jungle > 0.5) primary = 'jungle';
        if (weights.swamp > 0.5) primary = 'swamp';

        return { primary, weights };
    }

    function getBiomeColor(x, z) {
        const data = getBiomeData(x, z);
        
        // 1. Village / Path Detection
        let isVillage = false;
        let distToVillage = 9999;
        for (const loc of VILLAGE_LOCATIONS) {
            const d = Math.hypot(x - loc.x, z - loc.z);
            if (d < loc.radius) {
                isVillage = true;
                distToVillage = Math.min(distToVillage, d);
            }
        }

        const biomeColors = {
            desert: new THREE.Color(0xedc9af),
            snow: new THREE.Color(0xffffff),
            jungle: new THREE.Color(0x1a472a),
            swamp: new THREE.Color(0x2f351e),
            plains: new THREE.Color(0x567d46),
            stone: new THREE.Color(0x808080),
            path: new THREE.Color(0x9b7653) // Braun für Wege
        };
        
        // Blending der Farben basierend auf Gewichten
        let finalColor = new THREE.Color(0, 0, 0);
        
        const blend = (color, weight) => {
            finalColor.r += color.r * weight;
            finalColor.g += color.g * weight;
            finalColor.b += color.b * weight;
        };

        blend(biomeColors.desert, data.weights.desert);
        blend(biomeColors.snow, data.weights.snow);
        blend(biomeColors.jungle, data.weights.jungle);
        blend(biomeColors.swamp, data.weights.swamp);
        blend(biomeColors.plains, data.weights.plains);

        // 2. Village Ground logic
        if (isVillage) {
            const villageEffect = 1.0 - Math.min(1.0, distToVillage / 300);
            const pathNoise = getOctaveNoise(x * 0.05, z * 0.05, 2);
            
            // In Dorfnähe mischen wir Stein und Weg-Farben ein
            if (pathNoise > 0.3) {
                finalColor.lerp(biomeColors.stone, villageEffect * 0.8);
            } else if (pathNoise > -0.2) {
                finalColor.lerp(biomeColors.path, villageEffect * 0.7);
            }
        }
        
        // 3. Laub/Erde Variation (nur in Plains/Jungle)
        if (data.weights.plains > 0.5 || data.weights.jungle > 0.5) {
            const leafNoise = getOctaveNoise(x * 0.1, z * 0.1, 2);
            if (leafNoise > 0.4) {
                finalColor.lerp(new THREE.Color(0x3d2b1f), 0.3); // Dunkle Erde/Laub
            }
        }
        
        // Kleine Rausch-Variation für "Textur"-Effekt
        const noise = simpleNoise(x * 0.5, z * 0.5) * 0.05;
        finalColor.r += noise;
        finalColor.g += noise;
        finalColor.b += noise;
        
        return finalColor;
    }

    function createDetailedTree(rng, leafColor = 0x567d46) {
        const g = new THREE.Group();
        const s = 0.8 + rng() * 1.2;
        
        const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, flatShading: true });
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 2.5, 15, 7),
            trunkMat
        );
        trunk.position.y = 7.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        g.add(trunk);

        const rootCount = 3 + Math.floor(rng() * 3);
        for(let i=0; i<rootCount; i++) {
            const angle = (i / rootCount) * Math.PI * 2 + rng() * 0.5;
            const root = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, 1.2, 7 + rng() * 3),
                trunkMat
            );
            const dist = 2 + rng();
            root.position.set(Math.cos(angle) * dist, 0.2, Math.sin(angle) * dist);
            root.rotation.y = angle;
            root.rotation.x = 0.3 + rng() * 0.2;
            root.rotation.z = (rng() - 0.5) * 0.2;
            root.castShadow = true;
            g.add(root);
        }

        const crown = new THREE.Mesh(
            new THREE.DodecahedronGeometry(10, 0),
            new THREE.MeshStandardMaterial({ color: leafColor, flatShading: true })
        );
        crown.position.y = 18;
        crown.castShadow = true;
        g.add(crown);

        g.scale.set(s, s, s);
        return g;
    }

    function spawnClutter(group, x, z, h, rng) {
        const type = rng();
        if (type > 0.85) {
            const stoneGeo = new THREE.DodecahedronGeometry(1 + rng() * 2, 0);
            const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(x, h + 0.5, z);
            stone.rotation.set(rng(), rng(), rng());
            group.add(stone);
        } else if (type > 0.6) {
            const bushGeo = new THREE.IcosahedronGeometry(2, 0);
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, flatShading: true });
            const bush = new THREE.Mesh(bushGeo, bushMat);
            bush.position.set(x, h + 1, z);
            group.add(bush);
        } else if (type > 0.5) {
            const bench = createBench(x, z, rng() * Math.PI, h);
            group.add(bench);
        }
    }

    function createDesertRuin(rng) {
        const g = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xbc8f8f, flatShading: true });
        for(let i=0; i<3; i++) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, 10 + rng()*15, 4), stoneMat);
            pillar.position.set((rng()-0.5)*20, 5, (rng()-0.5)*20);
            pillar.rotation.set(rng()*0.2, rng()*Math.PI, rng()*0.2);
            g.add(pillar);
        }
        return g;
    }

    function createDesertRock(rng) {
        const mesh = new THREE.Mesh(
            new THREE.DodecahedronGeometry(5 + rng() * 10, 0),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true })
        );
        mesh.rotation.set(rng(), rng(), rng());
        mesh.scale.y *= 0.5;
        return mesh;
    }

    function createJunglePlant(rng) {
        const g = new THREE.Group();
        for(let i=0; i<5; i++) {
            const leaf = new THREE.Mesh(
                new THREE.BoxGeometry(2, 10, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x006400 })
            );
            leaf.rotation.z = (rng() - 0.5) * 2;
            leaf.rotation.y = (i / 5) * Math.PI * 2;
            leaf.position.y = 5;
            g.add(leaf);
        }
        return g;
    }

    function createChunk(cx, cz, scene) {
        const key = `${cx},${cz}`;
        const group = new THREE.Group();
        const x0 = cx * CHUNK_SIZE;
        const z0 = cz * CHUNK_SIZE;

        const segments = QUALITY >= 3 ? 32 : (QUALITY >= 2 ? 24 : 16); 
        const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
        const pos = geo.attributes.position.array;
        
        const colors = new Float32Array(pos.length);
        const centerX = x0 + CHUNK_SIZE / 2;
        const centerZ = z0 + CHUNK_SIZE / 2;

        for (let i = 0; i < pos.length; i += 3) {
            let vx = centerX + pos[i];
            let vz = centerZ + pos[i + 1];
            
            const h = getTerrainHeight(vx, vz);
            pos[i + 2] = h;

            const color = getBiomeColor(vx, vz);
            colors[i] = color.r;
            colors[i+1] = color.g;
            colors[i+2] = color.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ 
            vertexColors: true,
            flatShading: true, // Behalten für Low-Poly Look, aber mit besseren Farben
            roughness: 0.9,
            metalness: 0.0,
            envMapIntensity: 0.5
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        mesh.castShadow = true; // Terrain kann Schatten werfen (z.B. Berge)
        group.add(mesh);

        // Wasser-Ebene für diesen Chunk, falls unter 0
        const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 1, 1);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4fa3e1,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.3
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -2; // Leicht unter Null
        group.add(water);

        scene.add(group);
        chunks.set(key, { group, mesh });
    }

    async function initWorld(scene, env, enterHouseCallback) {
        console.log("[FPGraphics] Initialisiere Welt...");
        if (!env) {
            console.warn("[FPGraphics] Keine Umgebung (env) übergeben!");
            return;
        }

        console.log("[FPGraphics] Biome gefunden:", Object.keys(env.biomes));

        // Große Basis-Ebene für den Hintergrund (verhindert das "blaue Nichts")
        const baseGeo = new THREE.PlaneGeometry(5000, 5000);
        const baseMat = new THREE.MeshStandardMaterial({ 
            color: 0x3d4f35, // Dunkles Grün/Erde
            roughness: 1.0,
            metalness: 0.0
        });
        const basePlane = new THREE.Mesh(baseGeo, baseMat);
        basePlane.rotation.x = -Math.PI / 2;
        basePlane.position.y = -5; // Tief genug unter dem eigentlichen Terrain
        scene.add(basePlane);

        // initMountains(scene); // Entfernt, da Berge jetzt Teil des Terrains sind
        initRiver(scene);
        await initVegetation(scene);
        initForestDetails(scene);

        const biomeKeys = Object.keys(env.biomes);
        for (let index = 0; index < biomeKeys.length; index++) {
            const key = biomeKeys[index];
            const biome = env.biomes[key];
            if (key === 'CENTRAL') {
                await spawnVillage(scene, biome, 0, 0, enterHouseCallback);
                
                const fountainGeo = new THREE.CylinderGeometry(15, 18, 5, 16);
                const fountainMat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
                const fountain = new THREE.Mesh(fountainGeo, fountainMat);
                fountain.position.set(0, 2.5, 0);
                fountain.castShadow = true;
                fountain.receiveShadow = true;
                scene.add(fountain);
                
                const waterGeo = new THREE.CircleGeometry(12, 16);
                const waterMat = new THREE.MeshStandardMaterial({ 
                    color: 0x0044ff, 
                    transparent: true, 
                    opacity: 0.6,
                    roughness: 0.1,
                    metalness: 0.5
                });
                const water = new THREE.Mesh(waterGeo, waterMat);
                water.rotation.x = -Math.PI / 2;
                water.position.set(0, 5.1, 0);
                water.receiveShadow = true;
                scene.add(water);
            } else {
                const angle = (index / (biomeKeys.length - 1)) * Math.PI * 2;
                const dist = 1200;
                const vx = Math.cos(angle) * dist;
                const vz = Math.sin(angle) * dist;
                
                const bGeo = new THREE.CircleGeometry(400, 32);
                const bMat = new THREE.MeshLambertMaterial({ 
                    color: biome.color, 
                    transparent: true, 
                    opacity: 0.8 
                });
                const bFloor = new THREE.Mesh(bGeo, bMat);
                bFloor.rotation.x = -Math.PI / 2;
                bFloor.position.set(vx, 0.2, vz);
                scene.add(bFloor);

                await spawnVillage(scene, biome, vx, vz, enterHouseCallback);
            }
        }
    }

    function initMountains(scene) {
        const mountCount = 15; 
        for (let i = 0; i < mountCount; i++) {
            const radius = 60 + Math.random() * 180;
            const height = 120 + Math.random() * 200;
            const geo = new THREE.DodecahedronGeometry(radius, 0);
            const mat = new THREE.MeshStandardMaterial({ 
                color: 0x666666, 
                flatShading: true,
                roughness: 0.9 
            });
            const mount = new THREE.Mesh(geo, mat);
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 1100 + Math.random() * 900;
            mount.position.set(Math.cos(angle) * dist, height * 0.2, Math.sin(angle) * dist);
            mount.scale.y = 1.2 + Math.random() * 2;
            mount.rotation.set(Math.random(), Math.random(), Math.random());
            scene.add(mount);
        }
    }

    function initForestDetails(scene) {
        const rockGeo = new THREE.DodecahedronGeometry(2, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x777777, flatShading: true });
        const rockCount = 200;
        const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
        const m = new THREE.Matrix4();

        for (let i = 0; i < rockCount; i++) {
            const x = (Math.random() - 0.5) * 2000;
            const z = (Math.random() - 0.5) * 2000;
            if (Math.hypot(x, z) < 150) continue;
            const s = 0.5 + Math.random() * 2.0;
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random()));
            m.compose(new THREE.Vector3(x, s, z), q, new THREE.Vector3(s, s, s));
            rockInst.setMatrixAt(i, m);
        }
        scene.add(rockInst);

        const rayGeo = new THREE.CylinderGeometry(2, 15, 400, 8, 1, true);
        const rayMat = new THREE.MeshBasicMaterial({ 
            color: 0xfff5e1, 
            transparent: true, 
            opacity: 0.05, 
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        for (let i = 0; i < 30; i++) {
            const ray = new THREE.Mesh(rayGeo, rayMat);
            const rx = (Math.random() - 0.5) * 2000;
            const rz = (Math.random() - 0.5) * 2000;
            ray.position.set(rx, 200, rz);
            ray.rotation.x = 0.2;
            ray.rotation.z = (Math.random() - 0.5) * 0.5;
            scene.add(ray);
        }
    }

    function initRiver(scene) {
        const riverGroup = new THREE.Group();
        const riverGeo = new THREE.PlaneGeometry(120, 4000, 10, 40);
        const riverMat = new THREE.MeshStandardMaterial({ 
            color: PALETTE.water, 
            flatShading: true,
            transparent: true, 
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.3
        });
        
        const mainRiver = new THREE.Mesh(riverGeo, riverMat);
        mainRiver.rotation.x = -Math.PI / 2;
        mainRiver.position.y = 0.5;
        riverGroup.add(mainRiver);
        riverPlanes.push(mainRiver);

        [[-800], [0], [800]].forEach(z => {
            const bridge = createWoodenBridge(0, z);
            riverGroup.add(bridge);
        });

        riverGroup.position.set(450, 0, 0); 
        scene.add(riverGroup);
    }

    function createWoodenBridge(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const beamGeo = new THREE.BoxGeometry(140, 4, 4);
        [[-22], [22]].forEach(bz => {
            const beam = new THREE.Mesh(beamGeo, woodMat);
            beam.position.y = 4;
            beam.position.z = bz + (Math.random() - 0.5) * 2;
            beam.rotation.y = (Math.random() - 0.5) * 0.05;
            beam.castShadow = true;
            beam.receiveShadow = true;
            group.add(beam);
        });
        
        const postGeo = new THREE.CylinderGeometry(2, 2.5, 40, 6);
        [[-60, -22], [60, -22], [-60, 22], [60, 22], [0, -22], [0, 22]].forEach(p => {
            const postGroup = new THREE.Group();
            postGroup.position.set(p[0], -15, p[1]);
            
            const post = new THREE.Mesh(postGeo, woodMat);
            post.rotation.z = (Math.random() - 0.5) * 0.15;
            post.rotation.x = (Math.random() - 0.5) * 0.15;
            post.castShadow = true;
            post.receiveShadow = true;
            postGroup.add(post);

            if (Math.random() > 0.3) {
                const strut = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 1.5), woodMat);
                strut.position.y = 10;
                strut.rotation.z = Math.PI / 4 * (Math.random() > 0.5 ? 1 : -1);
                postGroup.add(strut);
            }
            
            group.add(postGroup);
        });

        let currentX = -65;
        while (currentX <= 65) {
            const pWidth = 5 + Math.random() * 6;
            const pLen = 50 + Math.random() * 15;
            const plankGeo = new THREE.BoxGeometry(pWidth, 2, pLen);
            const plank = new THREE.Mesh(plankGeo, woodMat);
            
            const offsetX = (Math.random() - 0.5) * 1.5;
            const offsetZ = (Math.random() - 0.5) * 5;
            const offsetY = 6 + (Math.random() - 0.5) * 0.5;
            
            plank.position.set(currentX + offsetX, offsetY, offsetZ);
            plank.rotation.y = (Math.random() - 0.5) * 0.2;
            plank.rotation.z = (Math.random() - 0.5) * 0.1;
            plank.castShadow = true;
            plank.receiveShadow = true;
            group.add(plank);
            
            currentX += pWidth + 0.5 + Math.random() * 2;
        }
        
        [[-26], [26]].forEach(gz => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(130, 1.5, 2.5), woodMat);
            rail.position.set(0, 15, gz);
            rail.castShadow = true;
            group.add(rail);
            
            for (let rx = -60; rx <= 60; rx += 30) {
                const rPost = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), woodMat);
                rPost.position.set(rx, 10, gz);
                rPost.rotation.z = (Math.random() - 0.5) * 0.1;
                rPost.castShadow = true;
                group.add(rPost);
            }
        });
        
        return group;
    }

    function updateRiver() {
        riverPlanes.forEach(wave => {
            wave.position.z += 2; 
            if (wave.position.z > 2000) wave.position.z = -2000;
        });
    }

    function updateFire(delta, now) {
        if (!isInterior) return;
        fireParticles.forEach(p => {
            p.position.y += p.userData.speed * delta;
            p.position.x += Math.sin(now * 0.005 + p.userData.phase) * 0.05 * delta;
            if (p.position.y > 15) {
                p.position.y = 2;
                p.position.x = -20 + (Math.random() - 0.5) * 5;
                p.position.z = -20 + (Math.random() - 0.5) * 5;
            }
        });
    }

    async function initVegetation(scene) {
        console.log("[Vegetation] Initialisiere Bäume mit AssetsLibrary...");
        const count = 300; 
        const ALL_TREES = AssetsLibrary.getAllTrees();

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 3000;
            const z = (Math.random() - 0.5) * 3000;
            
            const distToCenter = Math.hypot(x, z);
            if (distToCenter < 350) continue; 

            const treePath = ALL_TREES[Math.floor(Math.random() * ALL_TREES.length)];
            try {
                const tree = await loadModel(treePath);
                const s = 4.0 + Math.random() * 6.0;
                tree.scale.set(s, s, s);
                tree.position.set(x, getTerrainHeight(x, z), z);
                tree.rotation.y = Math.random() * Math.PI * 2;
                scene.add(tree);
            } catch (e) {
                const trunk = new THREE.Mesh(
                    new THREE.CylinderGeometry(2, 3, 20),
                    new THREE.MeshStandardMaterial({ color: 0x3d2a1a })
                );
                trunk.position.set(x, 10, z);
                scene.add(trunk);
            }
        }

        // Büsche aus AssetsLibrary
        const ALL_BUSHES = AssetsLibrary.getAllBushes();
        for (let i = 0; i < 200; i++) {
            const x = (Math.random() - 0.5) * 3000;
            const z = (Math.random() - 0.5) * 3000;
            if (Math.hypot(x, z) < 150) continue;

            const bushPath = ALL_BUSHES[Math.floor(Math.random() * ALL_BUSHES.length)];
            try {
                const bush = await loadModel(bushPath);
                const s = 1.5 + Math.random() * 2.5;
                bush.scale.set(s, s, s);
                bush.position.set(x, getTerrainHeight(x, z), z);
                bush.rotation.y = Math.random() * Math.PI * 2;
                scene.add(bush);
            } catch (e) {
                // Fallback für Büsche
            }
        }
    }

    function createPalisade(scene, centerX, centerZ, radius) {
        const count = 60;
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        const postGeo = new THREE.CylinderGeometry(2, 2, 25, 5);
        
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            if (angle > 1.4 && angle < 1.7) continue;

            const x = centerX + Math.cos(angle) * radius;
            const z = centerZ + Math.sin(angle) * radius;
            
            const post = new THREE.Mesh(postGeo, woodMat);
            post.position.set(x, 10, z);
            post.rotation.y = Math.random();
            const tipGeo = new THREE.ConeGeometry(2, 5, 5);
            const tip = new THREE.Mesh(tipGeo, woodMat);
            tip.position.y = 12.5 + 2.5;
            post.add(tip);
            
            scene.add(post);
        }
    }

    function createWatchtower(scene, x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(p => {
            const postGeo = new THREE.BoxGeometry(2, 45, 2);
            const post = new THREE.Mesh(postGeo, woodMat);
            post.position.set(p[0], 22.5, p[1]);
            group.add(post);
        });
        
        const platGeo = new THREE.BoxGeometry(16, 2, 16);
        const plat = new THREE.Mesh(platGeo, woodMat);
        plat.position.y = 35;
        group.add(plat);
        
        const roofGeo = new THREE.ConeGeometry(12, 10, 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.roof, flatShading: true });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 45 + 5;
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        
        scene.add(group);
    }

    function createStreetLamp(x, z, h = 0) {
        const group = new THREE.Group();
        group.position.set(x, h, z);
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const postGeo = new THREE.BoxGeometry(2, 25, 2);
        const post = new THREE.Mesh(postGeo, woodMat);
        post.position.y = 12.5;
        post.castShadow = true;
        group.add(post);
        
        const armGeo = new THREE.BoxGeometry(6, 1.5, 1.5);
        const arm = new THREE.Mesh(armGeo, woodMat);
        arm.position.set(2, 23, 0);
        arm.castShadow = true;
        group.add(arm);
        
        const lampGeo = new THREE.BoxGeometry(3, 4, 3);
        const lampMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffaa, 
            emissive: 0xffffaa,
            emissiveIntensity: 1,
            flatShading: true 
        });
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(4, 21, 0);
        lamp.castShadow = true;
        group.add(lamp);
        
        const light = new THREE.PointLight(0xffffaa, 1, 50);
        light.position.set(4, 21, 0);
        light.castShadow = true;
        group.add(light);
        
        return group;
    }

    function createBench(x, z, rotY, h = 0) {
        const group = new THREE.Group();
        group.position.set(x, h, z);
        group.rotation.y = rotY;
        const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, flatShading: true });
        
        const seatGeo = new THREE.BoxGeometry(12, 1, 4);
        const seat = new THREE.Mesh(seatGeo, woodMat);
        seat.position.y = 4;
        seat.castShadow = true;
        group.add(seat);
        
        const legGeo = new THREE.BoxGeometry(1, 4, 1);
        [[-5, -1.5], [5, -1.5], [-5, 1.5], [5, 1.5]].forEach(p => {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(p[0], 2, p[1]);
            leg.castShadow = true;
            group.add(leg);
        });
        
        return group;
    }

    function spawnRoadStones(scene, centerX, centerZ) {
        const stoneMat = new THREE.MeshStandardMaterial({ 
            color: 0x888888, 
            roughness: 0.8,
            flatShading: true 
        });

        const directions = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
            { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }, { x: 0.7, z: -0.7 }, { x: -0.7, z: -0.7 }
        ];

        directions.forEach(dir => {
            for (let d = 30; d < 200; d += 15 + Math.random() * 20) {
                const rx = centerX + dir.x * d + (Math.random() - 0.5) * 15;
                const rz = centerZ + dir.z * d + (Math.random() - 0.5) * 15;
                
                const dist = Math.hypot(rx - centerX, rz - centerZ);
                if (dist > 250) continue;

                const h = getTerrainHeight(rx, rz);

                const size = 1 + Math.random() * 3;
                const stoneGeo = new THREE.IcosahedronGeometry(size, 0);
                const stone = new THREE.Mesh(stoneGeo, stoneMat);
                
                stone.position.set(rx, h + size * 0.5, rz);
                stone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                stone.scale.set(1, 0.5 + Math.random() * 0.5, 1);
                stone.castShadow = true;
                stone.receiveShadow = true;
                
                scene.add(stone);
            }
        });
    }

    async function spawnVillage(scene, biome, x, z, enterHouseCallback) {
        const centerGeo = new THREE.CylinderGeometry(5, 5, 0.5, 16);
        const centerMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.set(x, 0.1, z);
        center.receiveShadow = true;
        scene.add(center);

        if (biome.name === "Hauptdorf") {
            spawnRoadStones(scene, x, z);
            createPalisade(scene, x, z, 250);
            createWatchtower(scene, x + 180, z + 180);
            createWatchtower(scene, x - 180, z + 180);
            createWatchtower(scene, x + 180, z - 180);
            createWatchtower(scene, x - 180, z - 180);

            scene.add(createStreetLamp(x + 30, z + 30, getTerrainHeight(x + 30, z + 30)));
            scene.add(createStreetLamp(x - 30, z - 30, getTerrainHeight(x - 30, z - 30)));
            scene.add(createBench(x + 20, z - 30, 0, getTerrainHeight(x + 20, z - 30)));
            scene.add(createBench(x - 20, z + 30, Math.PI, getTerrainHeight(x - 20, z + 30)));

            scene.add(createStreetLamp(x - 55, z + 35, getTerrainHeight(x - 55, z + 35)));
            scene.add(createStreetLamp(x + 65, z - 20, getTerrainHeight(x + 65, z - 20)));
            scene.add(createStreetLamp(x - 30, z - 45, getTerrainHeight(x - 30, z - 45)));
            scene.add(createStreetLamp(x + 45, z + 55, getTerrainHeight(x + 45, z + 55)));
            
            scene.add(createBench(x - 80, z + 50, Math.PI / 4, getTerrainHeight(x - 80, z + 50)));
            scene.add(createBench(x + 100, z - 20, -Math.PI / 4, getTerrainHeight(x + 100, z - 20)));
            scene.add(createBench(x - 40, z - 70, Math.PI / 6, getTerrainHeight(x - 40, z - 70)));

            const buildings = [
                { name: "Marktplatz", x: 130, z: -40, color: 0x8b4513, icon: "🏪" },
                { name: "Wohnhaus 1", x: -140, z: -30, color: 0x8b4513, icon: "🏠" },
                { name: "Schmiede", x: -110, z: 70, color: 0x555555, icon: "⚔️" },
                { name: "Steinbruch", x: -160, z: 20, color: 0x888888, icon: "⛏️" },
                { name: "Arena", x: 0, z: 180, color: 0xaa2222, icon: "🏟️" },
                { name: "Wirtshaus", x: -60, z: -90, color: 0x8b4513, icon: "🍺" },
                { name: "Gilde", x: 90, z: 110, color: 0x4444aa, icon: "🏛️" },
                { name: "Wohnhaus 2", x: 160, z: 60, color: 0x8b4513, icon: "🏠" }
            ];

            for (const b of buildings) {
                const h = getTerrainHeight(x + b.x, z + b.z);
                const bObj = await createBuilding(b.name, x + b.x, z + b.z, b.color, b.icon, () => {
                    if (enterHouseCallback) enterHouseCallback(b.name);
                }, scene);
                bObj.position.y = h;

                if (b.name === "Marktplatz") {
                    addMarketNPC(scene, x + b.x + 15, z + b.z + 10, h);
                }
            }
        } else {
            const houseCount = 3;
            const icons = ["🏠", "🏪", "⚔️", "🧪", "🛡️"];
            for (let i = 0; i < houseCount; i++) {
                const angle = (i / houseCount) * Math.PI * 2;
                const dist = 60;
                const bx = x + Math.cos(angle) * dist;
                const bz = z + Math.sin(angle) * dist;
                const h = getTerrainHeight(bx, bz);
                
                let icon = icons[i % icons.length];
                if (i === 0) icon = "🏛️";
                if (i === 1) icon = "✨";
                if (i === 2) icon = "💀";

                const bName = `${biome.name} Haus ${i}`;
                const bObj = await createBuilding(bName, bx, bz, biome.color || 0x8b4513, icon, () => {
                    if (enterHouseCallback) enterHouseCallback(biome, i);
                }, scene);
                bObj.position.y = h;
            }
        }

        // Biome-spezifische Deko & Architektur
        if (biome.terrain === "high_trees") {
            for (let j = 0; j < 5; j++) {
                const tx = x + (Math.random()-0.5) * 120;
                const tz = z + (Math.random()-0.5) * 120;
                const trunkGeo = new THREE.CylinderGeometry(4, 5, 60, 8);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2a1a });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.set(tx, 30, tz);
                scene.add(trunk);
                if (j === 1) {
                    const houseGeo = new THREE.BoxGeometry(15, 10, 15);
                    const houseMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
                    const house = new THREE.Mesh(houseGeo, houseMat);
                    house.position.set(tx, 50, tz);
                    scene.add(house);
                }
            }
        } else if (biome.terrain === "swamp") {
            for (let j = 0; j < 8; j++) {
                const px = x + (Math.random()-0.5) * 150;
                const pz = z + (Math.random()-0.5) * 150;
                const stemGeo = new THREE.CylinderGeometry(1, 1.5, 5, 8);
                const stemMat = new THREE.MeshLambertMaterial({ color: 0xddddcc });
                const stem = new THREE.Mesh(stemGeo, stemMat);
                stem.position.set(px, 2.5, pz);
                scene.add(stem);
                const capGeo = new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                const capMat = new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0xaa2222 : 0x442266 });
                const cap = new THREE.Mesh(capGeo, capMat);
                cap.position.set(px, 5, pz);
                scene.add(cap);
                const light = new THREE.PointLight(0x00ff88, 1, 30);
                light.position.set(px, 6, pz);
                scene.add(light);
            }
        } else if (biome.terrain === "mountains") {
            const rockGeo = new THREE.DodecahedronGeometry(12);
            const rockMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
            for (let j = 0; j < 10; j++) {
                const rx = x + Math.cos(j) * 90;
                const rz = z + Math.sin(j) * 90;
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(rx, 6, rz);
                rock.scale.set(1 + Math.random()*3, 1 + Math.random()*5, 1 + Math.random()*3);
                scene.add(rock);
            }
        } else if (biome.terrain === "grove") {
            for (let j = 0; j < 6; j++) {
                const px = x + (Math.random()-0.5) * 100;
                const pz = z + (Math.random()-0.5) * 100;
                const postGeo = new THREE.CylinderGeometry(1, 1, 15, 8);
                const postMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(px, 7.5, pz);
                scene.add(post);
            }
        } else if (biome.terrain === "underground_city") {
            for (let j = 0; j < 8; j++) {
                const px = x + (Math.random()-0.5) * 140;
                const pz = z + (Math.random()-0.5) * 140;
                const cryGeo = new THREE.OctahedronGeometry(5);
                const cryMat = new THREE.MeshPhongMaterial({ color: 0x4444ff, emissive: 0x2222aa, transparent: true, opacity: 0.8 });
                const crystal = new THREE.Mesh(cryGeo, cryMat);
                crystal.position.set(px, 5, pz);
                crystal.rotation.set(Math.random(), Math.random(), Math.random());
                scene.add(crystal);
                const light = new THREE.PointLight(0x4444ff, 1, 40);
                light.position.set(px, 6, pz);
                scene.add(light);
            }
        } else if (biome.terrain === "void_waste") {
            for (let j = 0; j < 4; j++) {
                const px = x + Math.cos(j) * 80;
                const pz = z + Math.sin(j) * 80;
                const obeGeo = new THREE.ConeGeometry(5, 20, 4);
                const obeMat = new THREE.MeshLambertMaterial({ color: 0x1a0a2a });
                const obelisk = new THREE.Mesh(obeGeo, obeMat);
                obelisk.position.set(px, 20 + Math.sin(j)*10, pz);
                scene.add(obelisk);
            }
        } else if (biome.terrain === "highlands") {
            for (let j = 0; j < 6; j++) {
                const angle = (j / 6) * Math.PI * 2;
                const px = x + Math.cos(angle) * 70;
                const pz = z + Math.sin(angle) * 70;
                const colGeo = new THREE.CylinderGeometry(3, 3, 40, 12);
                const colMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
                const column = new THREE.Mesh(colGeo, colMat);
                column.position.set(px, 20, pz);
                scene.add(column);
            }
        }
    }

    function addMarketNPC(scene, x, z, h = 0) {
        const tex = new THREE.TextureLoader().load('Ei.png');
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.position.set(x, h + 5, z);
        sprite.scale.set(6, 6, 1);
        scene.add(sprite);

        const tag = createNameTag("Händler");
        tag.position.set(x, h + 10, z);
        scene.add(tag);
    }

    function updateChunks(scene, targetPos) {
        if (!scene || isInterior) return;

        const px = targetPos.x;
        const pz = targetPos.z;
        const currentCX = Math.floor(px / CHUNK_SIZE);
        const currentCZ = Math.floor(pz / CHUNK_SIZE);

        const activeKeys = new Set();
        const STRICT_RADIUS = 2;

        for (let dx = -STRICT_RADIUS; dx <= STRICT_RADIUS; dx++) {
            for (let dz = -STRICT_RADIUS; dz <= STRICT_RADIUS; dz++) {
                const cx = currentCX + dx;
                const cz = currentCZ + dz;
                const key = `${cx},${cz}`;
                activeKeys.add(key);

                if (!chunks.has(key)) {
                    createChunk(cx, cz, scene);
                }
            }
        }

        for (const [key, chunk] of chunks) {
            if (!activeKeys.has(key)) {
                scene.remove(chunk.group);
                chunk.group.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => m.dispose());
                        } else {
                            if (obj.material.map) obj.material.map.dispose();
                            obj.material.dispose();
                        }
                    }
                });
                chunks.delete(key);
            }
        }
    }

    function createNameTag(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        
        const roundRect = (ctx, x, y, w, h, r) => {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            return ctx;
        };
        roundRect(ctx, 10, 10, 236, 44, 15).fill();

        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(name, 128, 32);
        ctx.fillText(name, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.scale.set(16, 4, 1);
        return sprite;
    }

    function initInteriors(scene) {
        if (!window.THREE) return;
        if (!lastExteriorPos) lastExteriorPos = new THREE.Vector3();

        const createDoor = (group, zPos) => {
            const doorGeo = new THREE.PlaneGeometry(15, 25);
            const doorMat = new THREE.MeshBasicMaterial({ 
                color: 0xffd700, 
                transparent: true, 
                opacity: 0.3, 
                side: THREE.DoubleSide 
            });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, 12.5, zPos);
            group.add(door);
            const frame = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), new THREE.LineBasicMaterial({ color: 0xffd700 }));
            frame.position.copy(door.position);
            group.add(frame);
            
            const tag = createNameTag("AUSGANG");
            tag.position.set(0, 30, zPos);
            group.add(tag);
        };

        const smithyGroup = new THREE.Group();
        smithyGroup.position.set(INTERIOR_POS_SMITHY.x, INTERIOR_POS_SMITHY.y, INTERIOR_POS_SMITHY.z);
        createDoor(smithyGroup, 49.5);
        const smithyRoom = new THREE.Mesh(new THREE.BoxGeometry(100, 80, 100), new THREE.MeshStandardMaterial({ color: 0x3d2a1a, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        smithyRoom.position.y = 40;
        smithyGroup.add(smithyRoom);
        const smithyFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x2a1a0a, flatShading: true, roughness: 0.8 }));
        smithyFloor.rotation.x = -Math.PI / 2;
        smithyGroup.add(smithyFloor);
        const texEi = new THREE.TextureLoader().load('Ei.png');
        texEi.magFilter = THREE.NearestFilter;
        blacksmithNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        blacksmithNPC.position.set(20, 5, 20);
        blacksmithNPC.scale.set(10, 10, 1);
        smithyGroup.add(blacksmithNPC);
        scene.add(smithyGroup);

        const innGroup = new THREE.Group();
        innGroup.position.set(INTERIOR_POS_INN.x, INTERIOR_POS_INN.y, INTERIOR_POS_INN.z);
        createDoor(innGroup, 49.5);
        const innRoom = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100), new THREE.MeshStandardMaterial({ color: 0x4a3728, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        innRoom.position.y = 30;
        innGroup.add(innRoom);
        const innFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x3d2b1f, flatShading: true, roughness: 0.8 }));
        innFloor.rotation.x = -Math.PI / 2;
        innGroup.add(innFloor);
        innkeeperNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        innkeeperNPC.position.set(0, 5, -30);
        innkeeperNPC.scale.set(10, 10, 1);
        innGroup.add(innkeeperNPC);
        scene.add(innGroup);

        const marketGroup = new THREE.Group();
        marketGroup.position.set(INTERIOR_POS_MARKET.x, INTERIOR_POS_MARKET.y, INTERIOR_POS_MARKET.z);
        createDoor(marketGroup, 59.5);
        const marketRoom = new THREE.Mesh(new THREE.BoxGeometry(120, 60, 120), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, side: THREE.BackSide, flatShading: true, roughness: 0.9 }));
        marketRoom.position.y = 30;
        marketGroup.add(marketRoom);
        const marketFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true, roughness: 0.8 }));
        marketFloor.rotation.x = -Math.PI / 2;
        marketGroup.add(marketFloor);
        marketNPC = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEi }));
        marketNPC.position.set(0, 5, -40);
        marketNPC.scale.set(10, 10, 1);
        marketGroup.add(marketNPC);
        scene.add(marketGroup);
    }

    function enterHouse(target = 'smithy', avatar, targetPos, currentPos, avatarNameTag) {
        if (!avatar) return;
        if (isInterior) {
            isInterior = false;
            currentInterior = null;
            avatar.position.copy(lastExteriorPos);
            targetPos.x = lastExteriorPos.x;
            targetPos.z = lastExteriorPos.z;
            currentPos.x = lastExteriorPos.x;
            currentPos.z = lastExteriorPos.z;
            if (avatarNameTag) avatarNameTag.position.set(avatar.position.x, avatar.position.y + 12, avatar.position.z);
            const conts = ['craftingContainer', 'marketContainer', 'houseOverlay', 'fpMarketOverlay'];
            conts.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
            return;
        }
        if (!lastExteriorPos) lastExteriorPos = new THREE.Vector3();
        lastExteriorPos.copy(avatar.position);
        let pos = INTERIOR_POS_SMITHY;
        if (target === 'inn') pos = INTERIOR_POS_INN;
        if (target === 'market') pos = INTERIOR_POS_MARKET;
        avatar.position.set(pos.x, pos.y + 4, pos.z);
        targetPos.x = pos.x;
        targetPos.z = pos.z;
        currentPos.x = pos.x;
        currentPos.z = pos.z;
        if (avatarNameTag) avatarNameTag.position.set(pos.x, pos.y + 12, pos.z);
        isInterior = true;
        currentInterior = target;
    }

    async function createBuilding(name, x, z, color, icon, callback, scene) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Debug-Log für Dorf-Erstellung
        console.log(`[Dorf] Erstelle Gebäude: ${name} an (${x}, ${z})`);

        // Versuche modulares Haus zu laden
        try {
            const modularHouse = await createModularHouse('small');
            group.add(modularHouse);
            console.log(`[Dorf] GLTF-Haus für ${name} erfolgreich geladen.`);
        } catch (e) {
            console.warn(`[Dorf] GLTF-Haus für ${name} fehlgeschlagen, nutze Fallback:`, e);
            const bodyGeo = new THREE.BoxGeometry(25, 22, 25);
            const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.walls, flatShading: true, roughness: 0.8 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 11;
            body.castShadow = true;
            body.receiveShadow = true;
            group.add(body);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = '80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const sm = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(sm);
        sprite.position.y = 55;
        sprite.scale.set(20, 20, 1);
        group.add(sprite);
        group.userData = { name, callback };
        scene.add(group);
        villageBuildings.push(group);
        return group;
    }

    function createClouds(scene) {
        const count = 20;
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(32, 32, 20, 0, Math.PI * 2);
            ctx.arc(64, 32, 25, 0, Math.PI * 2);
            ctx.arc(96, 32, 20, 0, Math.PI * 2);
            ctx.fill();
            const tex = new THREE.CanvasTexture(canvas);
            const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6 });
            const sprite = new THREE.Sprite(sm);
            sprite.position.set((Math.random()-0.5)*1500, 150+Math.random()*100, (Math.random()-0.5)*1500);
            sprite.scale.set(100, 50, 1);
            group.add(sprite);
        }
        scene.add(group);
    }

    function initRain(scene) {
        if (rainParticles) scene.remove(rainParticles);
        const count = 5000;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 1000;
            pos[i * 3 + 1] = Math.random() * 500;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1000;
            vel[i] = 2 + Math.random() * 3;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.5, transparent: true, opacity: 0.6 });
        rainParticles = new THREE.Points(geo, mat);
        rainParticles.userData = { velocities: vel };
        rainParticles.visible = false;
        scene.add(rainParticles);
    }

    function updateRain(avatar) {
        if (!rainParticles || !avatar) return;
        const env = window.EnvironmentManager;
        if (!env || (env.weather.type !== 'rainy' && env.weather.type !== 'stormy')) {
            rainParticles.visible = false;
            return;
        }
        rainParticles.visible = true;
        rainParticles.material.opacity = env.weather.intensity * 0.6;
        const pos = rainParticles.geometry.attributes.position.array;
        const vels = rainParticles.userData.velocities;
        const px = avatar.position.x;
        const pz = avatar.position.z;
        for (let i = 0; i < vels.length; i++) {
            pos[i * 3 + 1] -= vels[i];
            if (pos[i * 3 + 1] < 0) {
                pos[i * 3 + 1] = 400 + Math.random() * 100;
                pos[i * 3] = px + (Math.random() - 0.5) * 1000;
                pos[i * 3 + 2] = pz + (Math.random() - 0.5) * 1000;
            }
        }
        rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    function addOverlayCloseButton(overlay) {
        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            font-size: 32px;
            color: gold;
            cursor: pointer;
            z-index: 10001;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.7);
            border-radius: 50%;
            border: 2px solid gold;
            font-family: Arial, sans-serif;
            line-height: 1;
        `;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            overlay.style.display = 'none';
        };
        overlay.appendChild(closeBtn);
    }

    function cleanup(scene) {
        chunks.forEach(chunk => {
            scene.remove(chunk.group);
            chunk.mesh.geometry.dispose();
            chunk.mesh.material.dispose();
        });
        chunks.clear();
        villageBuildings = [];
        if (rainParticles) {
            scene.remove(rainParticles);
            rainParticles.geometry.dispose();
            rainParticles.material.dispose();
            rainParticles = null;
        }
    }

    window.FPGraphics = {
        get CHUNK_SIZE() { return CHUNK_SIZE; },
        get chunks() { return chunks; },
        get isInterior() { return isInterior; },
        get currentInterior() { return currentInterior; },
        get villageBuildings() { return villageBuildings; },
        initWorld,
        initMountains,
        initRiver,
        initVegetation,
        initForestDetails,
        createPalisade,
        createWatchtower,
        createStreetLamp,
        createBench,
        spawnRoadStones,
        spawnVillage,
        addMarketNPC,
        createDetailedTree,
        spawnClutter,
        createDesertRuin,
        createDesertRock,
        createJunglePlant,
        simpleNoise,
        getTerrainHeight,
        getBiomeData,
        updateChunks,
        createChunk,
        initInteriors,
        enterHouse,
        createBuilding,
        createNameTag,
        createClouds,
        initRain,
        updateRain,
        updateRiver,
        updateFire,
        addOverlayCloseButton,
        createModularHouse,
        createMonsterModel,
        cleanup,
        PALETTE
    };
})();
