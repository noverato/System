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

    const CLIPMAP_RADIUS = 4000; // Erhöht auf 4000 für User-Anforderung (4km Radius)
    const AOI_RADIUS = 15;      // Aktiver Simulationsradius (Bubble) - Auf 15m gesetzt
    const DORMANT_RADIUS = 20;  // Radius, ab dem Assets komplett einfrieren
    const GRASS_LOD_DIST = 40;  // Grenze zwischen 3D und 2D Gras (Erhöht für bessere Optik)
    const GRASS_MAX_DIST = 4000; // Maximale Sichtweite für 2D Gras (Synchronisiert mit Clipmap)
    const GRASS_PNG_PATH = 'https://raw.githubusercontent.com/noverato/System/main/animation/baeume/Grass_large.png';
    const CLIPMAP_SEGMENTS = 512; // Erhöht für bessere Detaildichte und Texel-Alignment
    
    const DECORATION_CELL_SIZE = 128; 
    const DECORATION_RANGE = 12;       
    const GRASS_CELL_SIZE = 64;      
    const GRASS_RANGE = 24;           

    // Globale Uniforms für das Culling-System (Bubble-Prinzip / Glocke)
    const worldCullingUniforms = {
        playerPos: { value: new THREE.Vector2(0, 0) },
        clipRadius: { value: CLIPMAP_RADIUS },
        time: { value: 0 }
    };

    const GPU_WORLD_SIZE = 10240; // Geändert auf 10240 für glattes Texel-Alignment (10240 / 1024 = 10m)
    const GPU_TERRAIN_SIZE = 1024; // 1024x1024 Textur

    // --- WORLD SEED LOGIC ---
    let WORLD_SEED = localStorage.getItem('nest_world_seed');
    if (!WORLD_SEED) {
        WORLD_SEED = Math.floor(Math.random() * 1000000);
        localStorage.setItem('nest_world_seed', WORLD_SEED);
        console.log("🌍 Lokaler Welt-Seed generiert:", WORLD_SEED);
    } else {
        WORLD_SEED = parseInt(WORLD_SEED);
        console.log("🌍 Lokaler Welt-Seed geladen:", WORLD_SEED);
    }

    /**
     * Synchronisiert den Seed mit Firebase, damit alle Spieler dieselbe Welt sehen.
     */
    function syncWorldSeedFromFirebase() {
        if (!window.db) {
            console.warn("⚠️ Firebase (db) nicht bereit für Seed-Sync. Nutze lokalen Fallback.");
            return;
        }

        const seedRef = window.db.ref('world/seed');
        seedRef.on('value', (snapshot) => {
            const fbSeed = snapshot.val();
            if (fbSeed !== null) {
                const parsedSeed = parseInt(fbSeed);
                if (!isNaN(parsedSeed) && parsedSeed !== WORLD_SEED) {
                    console.log("📡 Welt-Seed von Firebase empfangen:", parsedSeed);
                    WORLD_SEED = parsedSeed;
                    localStorage.setItem('nest_world_seed', WORLD_SEED);
                    updateSeededUniforms();
                }
            } else if (window.isAdmin) {
                // Nur Admins dürfen den initialen Seed in Firebase setzen
                console.log("👑 Admin: Setze initialen Welt-Seed in Firebase...");
                seedRef.set(WORLD_SEED);
            }
        });
    }

    /**
     * Setzt einen neuen globalen Welt-Seed (Nur für Admins über Konsole/UI).
     */
    window.setGlobalWorldSeed = function(newSeed) {
        if (!window.isAdmin) {
            console.error("🚫 Nur Overlords dürfen den Welt-Seed ändern!");
            return;
        }
        if (!window.db) return;
        
        const seed = parseInt(newSeed);
        if (isNaN(seed)) return;

        window.db.ref('world/seed').set(seed)
            .then(() => console.log("✅ Globaler Welt-Seed erfolgreich auf " + seed + " gesetzt."))
            .catch(e => console.error("❌ Fehler beim Setzen des Welt-Seeds:", e));
    };

    /**
     * Aktualisiert alle Shader-Uniforms, wenn sich der Seed ändert.
     */
    function updateSeededUniforms() {
        // 1. GPGPU Uniforms
        if (heightVariable && heightVariable.material) {
            heightVariable.material.uniforms.seed.value = WORLD_SEED;
            console.log("🧬 GPGPU Seed aktualisiert:", WORLD_SEED);
        }
        
        // 2. Terrain/Clipmap Uniforms
        if (terrainUniforms.worldSeed) {
            terrainUniforms.worldSeed.value = WORLD_SEED;
            console.log("🏞️ Terrain Seed aktualisiert:", WORLD_SEED);
        }

        // 3. Reset GPGPU Update Flagge, damit das Terrain neu berechnet wird
        if (GPGPU_Container) {
            GPGPU_Container.lastUpdate = 0; // Erzwingt Refresh im nächsten Frame
        }
    }

    // NEU: Persistente Uniforms für das Terrain-System (verhindert Start-Up Lag/Fehler)
    const terrainUniforms = {
        heightMap: { value: null },
        grassTex: { value: null },
        stoneTex: { value: null },
        desertTex: { value: null },
        leavesTex: { value: null },
        flowersTex: { value: null },
        worldOffset: { value: new THREE.Vector2(0, 0) },
        meshOffset: { value: new THREE.Vector2(0, 0) },
        fineOffset: { value: new THREE.Vector2(0, 0) },
        playerPos: { value: new THREE.Vector2(0, 0) },
        gpuWorldSize: { value: GPU_WORLD_SIZE },
        clipRadius: { value: CLIPMAP_RADIUS },
        aoiRadius: { value: AOI_RADIUS },
        worldSeed: { value: WORLD_SEED }, // Seed für prozedurale Generierung
        plainsColor: { value: new THREE.Color(0x6ba15a) },
        desertColor: { value: new THREE.Color(0xf4dcb3) },
        snowColor: { value: new THREE.Color(0xffffff) },
        jungleColor: { value: new THREE.Color(0x3d6629) },
        swampColor: { value: new THREE.Color(0x3e4521) },
        stoneColor: { value: new THREE.Color(0x999999) },
        pathColor: { value: new THREE.Color(0xb08d6a) },
        oceanColor: { value: new THREE.Color(0x1a4a8a) },
        forestColor: { value: new THREE.Color(0x2d5a27) }
    };

    /**
     * Wendet das radiale Culling (Glocken-Prinzip) auf ein Material an.
     * Dies stellt sicher, dass alle Objekte (auch InstancedMeshes) am Horizont verschwinden.
     */
    function applyWorldCulling(material, isTerrain = false) {
        if (!material || isTerrain) return; // Terrain Assets sind ausgenommen von AOI/Culling per TRAE Rules
        const mats = Array.isArray(material) ? material : [material];
        
        mats.forEach(mat => {
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.playerPos = worldCullingUniforms.playerPos;
                shader.uniforms.clipRadius = worldCullingUniforms.clipRadius;
                shader.uniforms.aoiRadius = { value: AOI_RADIUS };
                
                shader.vertexShader = `
                    uniform vec2 playerPos;
                    uniform float clipRadius;
                    uniform float aoiRadius;
                    varying float vDist;
                    varying float vAOI;
                ` + shader.vertexShader;
                
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    `
                    #include <worldpos_vertex>
                    vDist = length(worldPosition.xz - playerPos);
                    vAOI = step(vDist, aoiRadius);
                    `
                );
                
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `
                    #include <project_vertex>
                    if (vDist > clipRadius + 150.0) {
                        gl_Position.z = gl_Position.w * 2.0;
                    }
                    `
                );
                
                shader.fragmentShader = `
                    uniform float clipRadius;
                    uniform float aoiRadius;
                    varying float vDist;
                    varying float vAOI;
                ` + shader.fragmentShader;
                
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <dithering_fragment>',
                    `
                    #include <dithering_fragment>
                    // Visueller Hinweis auf die AOI-Grenze (Dormant-Zone)
                    if (vDist > aoiRadius) {
                        gl_FragColor.rgb *= 0.85; // Leicht abdunkeln
                    }
                    `
                );
            };
        });
    }

    /**
     * Spezialisierter Shader für das hybride Gras-System (3D/2D LOD).
     */
    function applyGrassShader(material, is3D) {
        if (!material) return;
        const mats = Array.isArray(material) ? material : [material];

        mats.forEach(mat => {
            mat.alphaTest = 0.5;
            mat.transparent = true;
            mat.side = THREE.DoubleSide;

            mat.onBeforeCompile = (shader) => {
                shader.uniforms.playerPos = worldCullingUniforms.playerPos;
                shader.uniforms.time = worldCullingUniforms.time;
                shader.uniforms.lodDist = { value: GRASS_LOD_DIST };
                shader.uniforms.maxDist = { value: GRASS_MAX_DIST };
                
                shader.vertexShader = `
                    uniform vec2 playerPos;
                    uniform float time;
                    uniform float lodDist;
                    uniform float maxDist;
                    varying float vDist;
                    varying float vWind;
                    varying vec2 vUV;
                    #define IS_3D ${is3D ? 'true' : 'false'}
                ` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    
                    // Wind-Logik (Vertex Displacement)
                    float windScale = 0.05;
                    float windSpeed = 1.5;
                    
                    // Weltposition berechnen (unterstützt InstancedMesh)
                    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
                    
                    // Nur die Spitzen des Grases bewegen (y > 0.1)
                    float strength = pow(clamp(uv.y, 0.0, 1.0), 2.0) * (IS_3D ? 1.5 : 4.0);
                    
                    // Sinus-Wellen für Wind (Kombiniert für organisches Gefühl)
                    float wind = sin(worldPos.x * windScale + time * windSpeed) * 
                                 cos(worldPos.z * windScale * 0.8 + time * windSpeed * 1.2) +
                                 sin(worldPos.x * 0.1 + time * 3.0) * 0.2; // Schnellere, kleine Böen
                    
                    // Spieler-Interaktion (Biegen wenn Spieler nah ist)
                    float distToPlayer = length(worldPos.xz - playerPos);
                    float bend = smoothstep(6.0, 0.0, distToPlayer) * 3.0; // Etwas stärkerer Effekt
                    
                    // Biegerichtung vom Spieler weg
                    vec2 dir = normalize(worldPos.xz - playerPos + 0.001);
                    transformed.x += (wind * strength) + (dir.x * bend * strength);
                    transformed.z += (wind * strength * 0.5) + (dir.y * bend * strength);
                    
                    vWind = wind;
                    `
                );

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <worldpos_vertex>',
                    `
                    #include <worldpos_vertex>
                    vDist = length(worldPosition.xz - playerPos);
                    vUV = uv;
                    `
                );

                // LOD-Culling im Vertex Shader
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <project_vertex>',
                    `
                    #include <project_vertex>
                    bool hide = false;
                    if (IS_3D) {
                        if (vDist > lodDist) hide = true;
                    } else {
                        if (vDist < lodDist || vDist > maxDist) hide = true;
                    }
                    if (hide) {
                        gl_Position.z = gl_Position.w * 2.0;
                    }
                    `
                );

                shader.fragmentShader = `
                    uniform float lodDist;
                    uniform float maxDist;
                    varying float vDist;
                    varying float vWind;
                    varying vec2 vUV;
                ` + shader.fragmentShader;

                // Chroma-Key für 2D-Gras
                if (!is3D) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <map_fragment>',
                        `
                        #include <map_fragment>
                        // Chroma-Key für violett-grauen Hintergrund
                        vec3 chromaKeyColor = vec3(0.486, 0.486, 0.486); // Ca. #7c7c7c
                        float threshold = 0.15;
                        float d = distance(diffuseColor.rgb, chromaKeyColor);
                        if (d < threshold) discard;
                        `
                    );
                }
            };
        });
    }
    
    // --- GPGPU TERRAIN SETTINGS ---
    // Zentraler GPGPU-Daten-Container (Kommunikations-Layer)
    const GPGPU_Container = {
        heightTexture: null,
        physicsData: new Float32Array(32 * 32 * 4), 
        physicsSize: 32,
        lastUpdate: 0,
        centerPos: new THREE.Vector2(0, 0),
        
        getUV: function(x, z) {
            const u = (x - this.centerPos.x) / GPU_WORLD_SIZE + 0.5;
            const v = (z - this.centerPos.y) / GPU_WORLD_SIZE + 0.5;
            return { u, v };
        },

        getSmoothHeight: function(x, z) {
            const { u, v } = this.getUV(x, z);
            if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

            const localU = (u - 0.5) * (GPU_TERRAIN_SIZE / this.physicsSize) + 0.5;
            const localV = (v - 0.5) * (GPU_TERRAIN_SIZE / this.physicsSize) + 0.5;

            if (localU < 0 || localU >= 1 || localV < 0 || localV >= 1) {
                return getCPUHeight(x, z);
            }

            const px = localU * (this.physicsSize - 1);
            const py = localV * (this.physicsSize - 1);
            
            const x0 = Math.floor(px);
            const x1 = Math.min(x0 + 1, this.physicsSize - 1);
            const y0 = Math.floor(py);
            const y1 = Math.min(y0 + 1, this.physicsSize - 1);
            
            const fX = px - x0;
            const fY = py - y0;
            
            const getVal = (ox, oy) => this.physicsData[(oy * this.physicsSize + ox) * 4];
            
            const h00 = getVal(x0, y0);
            const h10 = getVal(x1, y0);
            const h01 = getVal(x0, y1);
            const h11 = getVal(x1, y1);
            
            return (h00 * (1 - fX) + h10 * fX) * (1 - fY) + (h01 * (1 - fX) + h11 * fX) * fY;
        }
    };

    let gpuCompute;
    let heightVariable;
    let smoothVariable;
    // let gpuHeightData = new Float32Array(GPU_TERRAIN_SIZE * GPU_TERRAIN_SIZE * 4); // Entfernt, jetzt in GPGPU_Container
    
    let clipmapMesh;
    let clipmapMaterial;
    let clipmapBackupMesh;
    let clipmapGroup;
    let mainScene; // Referenz für Dekorationen
    let globalWater;

    const NOISE_SHADER = `
        uniform float time;
        uniform vec2 offset; // Welt-Position der Textur-Ecke (unten-links)
        uniform float worldSize;
        uniform float seed;
        
        // Simplex 2D noise
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v) {
            // Seed-Offset stabil anwenden (verhindert Precision-Loss bei extrem hohen Werten)
            float s = mod(seed, 10000.0);
            v += vec2(s * 0.123, s * 0.456); 
            
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 a0 = x - floor(x + 0.5);
            float m7 = 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h ).x;
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
            for (int i = 0; i < 8; ++i) { 
                v += a * snoise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        // Ridged Noise für scharfe Bergkämme
        float ridge(float n) {
            return 1.0 - abs(n);
        }

        float ridgedFBM(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            float f = 1.0;
            for (int i = 0; i < 6; ++i) {
                v += ridge(snoise(p * f)) * a;
                f *= 2.0;
                a *= 0.5;
            }
            return v * v; 
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 pos = (uv - 0.5) * worldSize + offset;
            
            float distToStart = length(pos);
            
            // --- TOPOGRAFIE-ZWANG (Rule Compliance) ---
            // Wir nutzen unterschiedliche Frequenzen für maximale Varianz
            
            // 1. Großflächige Kontinente
            float continent = fbm(pos * 0.00008); 
            
            // 2. Gebirgs-Maske (Bestimmt, wo Gebirge sind)
            float mountainMask = smoothstep(-0.1, 0.5, fbm(pos * 0.00015 + vec2(1000.0)));
            
            // 3. Hochgebirge (Jagged Peaks)
            float peaks = ridgedFBM(pos * 0.0006) * 600.0;
            
            // 4. Sanfte Hügelketten
            float hills = fbm(pos * 0.0004) * 60.0;
            
            // 5. Ebenen-Varianz (Verhindert Flat Planes)
            float flatVariance = snoise(pos * 0.002) * 2.5;
            
            // Kombination
            float h = mix(hills, peaks, mountainMask);
            h += continent * 20.0; // Großflächige Hebung/Senkung
            h += flatVariance;     // Mikro-Varianz gegen Flachheit
            
            // 6. Täler & Seen (Canyons)
            float valleyNoise = fbm(pos * 0.00012 - vec2(500.0));
            float valleyMask = smoothstep(0.4, 0.0, abs(valleyNoise));
            h = mix(h, -25.0 + flatVariance, valleyMask * 0.85);
            
            // --- STARTBEREICH SCHUTZ (Ei-Sicherheit) ---
            // Reduziert auf 400m Radius für schnellere Varianz-Sichtbarkeit
            if (distToStart < 400.0) {
                float f = smoothstep(100.0, 400.0, distToStart);
                h = mix(1.0, h, f);
            }
            
            // Hard Clamping für Performance & Gameplay
            h = clamp(h, -300.0, 2500.0);
            
            // --- LAYER-IDENTIFIKATION ---
            float layerID = 0.0; // Default: Stein/Mesh
            
            if (h < 4.0) {
                layerID = 2.0; // Wasser (Kein Collider)
            } else if (h >= 4.0 && h < 60.0) {
                layerID = 1.0; // Gras/Wiese (Solid Collider)
            }
            
            gl_FragColor = vec4(h, layerID, 0.0, 1.0);
        }
    `;

    const SMOOTH_SHADER = `
        void main() {
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 texelSize = 1.0 / max(resolution.xy, vec2(1.0));
            
            vec2 hLayer = vec2(0.0);
            float weightSum = 0.0;
            
            for(int y = -2; y <= 2; y++) {
                for(int x = -2; x <= 2; x++) {
                    float dist = length(vec2(float(x), float(y)));
                    float weight = exp(-dist * dist * 0.5); // Gauß-Blur
                    
                    vec4 data = texture2D(textureHeight, uv + vec2(float(x), float(y)) * texelSize);
                    hLayer.x += data.r * weight;
                    if (x == 0 && y == 0) hLayer.y = data.g; // Layer-ID nur vom Zentrum übernehmen
                    weightSum += weight;
                }
            }
            gl_FragColor = vec4(hLayer.x / max(weightSum, 0.0001), hLayer.y, 0.0, 1.0);
        }
    `;

    function initGPGPU(renderer) {
        if (typeof THREE.GPUComputationRenderer === 'undefined') {
            console.error("GPUComputationRenderer not found!");
            return;
        }
        gpuCompute = new THREE.GPUComputationRenderer(GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, renderer);
        
        // WICHTIG: FloatType für hohe Präzision der Höhenwerte (verhindert Wellen-Artefakte)
        if (renderer.capabilities.isWebGL2) {
            gpuCompute.setDataType(THREE.FloatType);
        } else {
            const extension = renderer.getContext().getExtension('OES_texture_float');
            if (extension) {
                gpuCompute.setDataType(THREE.FloatType);
            } else {
                gpuCompute.setDataType(THREE.HalfFloatType);
            }
        }
        
        const heightData = gpuCompute.createTexture();
        heightVariable = gpuCompute.addVariable("textureHeight", NOISE_SHADER, heightData);
        heightVariable.magFilter = THREE.LinearFilter;
        heightVariable.minFilter = THREE.LinearFilter;
        
        const smoothData = gpuCompute.createTexture();
        smoothVariable = gpuCompute.addVariable("textureSmooth", SMOOTH_SHADER, smoothData);
        smoothVariable.magFilter = THREE.LinearFilter;
        smoothVariable.minFilter = THREE.LinearFilter;
        
        gpuCompute.setVariableDependencies(smoothVariable, [heightVariable]);
        
        const error = gpuCompute.init();
        if (error !== null) {
            console.error("GPGPU Init Error:", error);
        } else {
            // Uniforms erst nach init() setzen, wenn die Materialien erstellt wurden
            heightVariable.material.uniforms.time = { value: 0 };
            heightVariable.material.uniforms.offset = { value: new THREE.Vector2(0, 0) };
            heightVariable.material.uniforms.worldSize = { value: GPU_WORLD_SIZE };
            heightVariable.material.uniforms.seed = { value: WORLD_SEED };
        }
    }

    function initClipmap(scene) {
        if (!scene) return;
        mainScene = scene;
        
        clipmapGroup = new THREE.Group();
        scene.add(clipmapGroup);

        // WICHTIG: Wir nutzen nur das Clipmap-Mesh für das Terrain.
        // Redundante Base-Planes oder statische Grids werden hier nicht hinzugefügt.
        clipmapMaterial = new THREE.MeshStandardMaterial({
            vertexColors: false,
            flatShading: false,
            roughness: 0.9,
            metalness: 0.0,
            transparent: false,
            side: THREE.FrontSide, // Normalen zeigen nach OBEN
            depthWrite: true,
            depthTest: true,
            polygonOffset: false
        });

        // Quadratisches Gitter für gleichmäßige Vertex-Verteilung (verhindert Stretching)
        // CLIPMAP_RADIUS * 2 für die Größe, Segmente für Detaildichte
        // Erhöht auf 512 Segmente für bessere Terrain-Definition bei 4km Radius
        const geo = new THREE.PlaneGeometry(CLIPMAP_RADIUS * 2, CLIPMAP_RADIUS * 2, CLIPMAP_SEGMENTS, CLIPMAP_SEGMENTS);
        
        // Texturen laden (Nutze AssetsLibrary für korrekte Pfade)
        const texLoader = new THREE.TextureLoader();
        const loadTex = (url) => {
            const t = texLoader.load(url);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 16;
            t.encoding = THREE.sRGBEncoding; // Sicherstellen, dass Farben korrekt interpretiert werden
            return t;
        };

        const grassTex = loadTex(AssetsLibrary.get('TERRAIN', 'GRASS'));
        const stoneTex = loadTex(AssetsLibrary.get('TERRAIN', 'ROCKS'));
        const desertTex = loadTex(AssetsLibrary.get('TERRAIN', 'ROCKS_DESERT'));
        const leavesTex = loadTex(AssetsLibrary.get('TERRAIN', 'LEAVES')); 
        const flowersTex = loadTex(AssetsLibrary.get('TERRAIN', 'FLOWERS'));

        // Persistente Uniforms initialisieren
        terrainUniforms.grassTex.value = grassTex;
        terrainUniforms.stoneTex.value = stoneTex;
        terrainUniforms.desertTex.value = desertTex;
        terrainUniforms.leavesTex.value = leavesTex;
        terrainUniforms.flowersTex.value = flowersTex;

        console.log("🎨 Terrain-Texturen geladen:", { grass: grassTex.image?.src, stone: stoneTex.image?.src });

        // Custom Shader Injection für Displacement und Biome-Farben
        clipmapMaterial.onBeforeCompile = (shader) => {
            clipmapMaterial.userData.shader = shader; // Shader-Referenz speichern
            
            // Verknüpfe persistente Uniforms
            Object.keys(terrainUniforms).forEach(key => {
                shader.uniforms[key] = terrainUniforms[key];
            });

            shader.vertexShader = `
                uniform sampler2D heightMap;
                uniform vec2 worldOffset;
                uniform vec2 meshOffset;
                uniform vec2 fineOffset;
                uniform vec2 playerPos;
                uniform float gpuWorldSize;
                uniform float clipRadius;
                uniform float aoiRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                // Hardware-beschleunigte bilineare Filterung (via LinearFilter in Three.js)
                float getSmoothHeight(vec2 uv) {
                    return texture2D(heightMap, uv).r;
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                // --- GEFRORENE WELTPOSITION (Jitter-Fix) ---
                // Da das Mesh nun fest auf das Texel-Grid gesnappt ist (sx, sz),
                // ist snapOffset immer 0. Wir können direkt die lokalen Positionen nutzen.
                
                // hUV Berechnung: (Lokale Pos + halbe Größe) / Größe
                // WICHTIG: Da die Plane um -PI/2 rotiert ist, entspricht localY dem NEGATIVEN Welt-Z.
                // Daher: worldX = meshOffset.x + position.x, worldZ = meshOffset.y - position.y
                vec2 hUV;
                hUV.x = (position.x + (gpuWorldSize * 0.5)) / gpuWorldSize;
                hUV.y = ((-position.y) + (gpuWorldSize * 0.5)) / gpuWorldSize; 
                hUV = clamp(hUV, 0.0, 1.0);
                
                // Wir nutzen hardware-beschleunigte lineare Filterung für butterweiche Übergänge
                float h = getSmoothHeight(hUV);
                vHeight = h;
                
                // VERTEX DISPLACEMENT: Z-Achse ist bei PlaneGeometry die Höhe (vor Rotation)
                transformed.z = h; 
                
                // vWorldPos für den Fragment-Shader (Texturierung & Biome)
                // Diese Position ist absolut synchron mit dem Gitter.
                vWorldPos = vec3(meshOffset.x + position.x, h, meshOffset.y - position.y);
                vDist = length(vWorldPos.xz - playerPos);
                `
            );

            // Fragment Shader: Biome & Textur-Splatting
            shader.fragmentShader = `
                uniform sampler2D grassTex;
                uniform sampler2D stoneTex;
                uniform sampler2D desertTex;
                uniform sampler2D leavesTex;
                uniform sampler2D flowersTex;
                uniform vec3 plainsColor;
                uniform vec3 desertColor;
                uniform vec3 snowColor;
                uniform vec3 jungleColor;
                uniform vec3 swampColor;
                uniform vec3 stoneColor;
                uniform vec3 oceanColor;
                uniform vec3 forestColor;
                uniform float worldSeed;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                // Noise-Hilfsfunktion für Biome
                float hash(vec2 p) {
                    p += worldSeed * 0.01; // Seed-Offset für Biome
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    f = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                               mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
                }
            ` + shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                
                // Welt-basierte UVs für Kachelung
                vec2 wUV = vWorldPos.xz * 0.15; 
                
                // --- FIX: TEXTURE-CORRUPTION (Blaue Streifen / UV-Reset) ---
                // Wir stellen sicher, dass wUV immer im positiven Bereich bleibt für Textur-Mapping
                wUV = abs(wUV); 

                // Texturen laden
                vec3 texGrass = texture2D(grassTex, wUV).rgb;
                vec3 texStone = texture2D(stoneTex, wUV * 0.5).rgb;
                vec3 texDesert = texture2D(desertTex, wUV * 0.8).rgb;
                
                // Normale und Slope berechnen
                vec3 slopeNormal = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
                float slope = 1.0 - slopeNormal.y;
                
                // BIOM-VERTEILUNG (7 Biome)
                float humNoise = noise(vWorldPos.xz * 0.0004 + vec2(100.0));
                float tempNoise = noise(vWorldPos.xz * 0.0003 - vec2(50.0));
                
                vec3 bioColor = plainsColor;
                
                // 1. OZEAN
                if (vHeight < 4.0) {
                    bioColor = mix(oceanColor, plainsColor, smoothstep(1.5, 4.0, vHeight));
                } 
                // 2. WÜSTE (Niedrige Feuchtigkeit)
                else if (humNoise < 0.25) {
                    bioColor = mix(desertColor, plainsColor, smoothstep(0.15, 0.25, humNoise));
                }
                // 3. SCHNEE (Sehr hoch)
                else if (vHeight > 350.0) {
                    bioColor = mix(bioColor, snowColor, smoothstep(350.0, 550.0, vHeight));
                }
                // 4. DSCHUNGEL (Heiß & Feucht)
                else if (humNoise > 0.75 && tempNoise > 0.6) {
                    bioColor = mix(forestColor, jungleColor, smoothstep(0.75, 0.9, humNoise));
                }
                // 5. SUMPF (Feucht & Tief)
                else if (humNoise > 0.7 && vHeight < 15.0) {
                    bioColor = mix(plainsColor, swampColor, smoothstep(0.7, 0.85, humNoise));
                }
                // 6. WALD (Feucht)
                else if (humNoise > 0.5) {
                    bioColor = mix(plainsColor, forestColor, smoothstep(0.5, 0.7, humNoise));
                }
                // 7. EBENEN (Default)
                
                // SLOPE DETECTION (Fels bei Steigung)
                float rockFactor = smoothstep(0.2, 0.4, slope + (texStone.r - 0.5) * 0.1);
                
                // Finale Farbmischung
                vec3 groundTex = mix(texGrass, texStone, rockFactor);
                if (humNoise < 0.25) groundTex = mix(texDesert, texStone, rockFactor);
                
                vec3 finalBase = mix(bioColor, stoneColor, rockFactor);
                vec3 finalColor = finalBase * groundTex;
                
                // Licht-Anpassung
                finalColor *= 1.15;
                
                diffuseColor.rgb = finalColor;
                `
            );
        };

        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.frustumCulled = false; // Wir bewegen das Mesh mit dem Spieler
        clipmapMesh.layers.enable(0); // Standard-Layer
        clipmapMesh.layers.enable(1); // Mesh-Layer
        
        // --- ASSET-ANCHOR INITIAL FIX ---
        // Erzwinge sofortiges Update der Welt-Matrix für das Terrain
        clipmapMesh.updateMatrixWorld(true);
        
        clipmapGroup.add(clipmapMesh);
    }

    function initWater(scene) {
        const waterGeo = new THREE.PlaneGeometry(CLIPMAP_RADIUS * 2, CLIPMAP_RADIUS * 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: PALETTE.water,
            transparent: true,
            opacity: 0.6,
        });
        globalWater = new THREE.Mesh(waterGeo, waterMat);
        globalWater.rotation.x = -Math.PI / 2;
        globalWater.position.y = 2.0;
        globalWater.layers.enable(0);
        globalWater.layers.enable(2); // Wasser-Layer
        scene.add(globalWater);
    }

    /**
     * Erstellt eine dichte Wiese für das Hauptdorf-Biom mittels InstancedMesh.
     */
    async function initHauptdorfMeadow() {
        const grassAssetPath = AssetsLibrary.encode('baeume/glTF/Grass_Large.gltf');
        console.log("🌿 Initialisiere HYBRIDE Hauptdorf-Wiese (3D/2D LOD)...");

        try {
            // 1. 3D Gras vorbereiten
            const gltf = await loadModel(grassAssetPath);
            let grassMesh = null;
            gltf.traverse(child => {
                if (child.isMesh && !grassMesh) grassMesh = child;
            });
            if (!grassMesh) return;

            // 2. 2D Gras Billboard vorbereiten (Xenoblade-Style Cross-Planes)
            const billboardTex = new THREE.TextureLoader().load(GRASS_PNG_PATH);
            billboardTex.anisotropy = 16;
            billboardTex.encoding = THREE.sRGBEncoding;
            billboardTex.minFilter = THREE.LinearMipmapLinearFilter;
            
            // Xenoblade-Style: Zwei gekreuzte Ebenen für Volumen aus allen Richtungen
            const plane1 = new THREE.PlaneGeometry(3, 3);
            plane1.translate(0, 1.5, 0);
            const plane2 = plane1.clone();
            plane2.rotateY(Math.PI / 2);
            
            const billboardGeo = THREE.BufferGeometryUtils ? 
                THREE.BufferGeometryUtils.mergeBufferGeometries([plane1, plane2]) : 
                plane1; // Fallback falls BufferGeometryUtils fehlt
            
            const billboardMat = new THREE.MeshBasicMaterial({ 
                map: billboardTex, 
                transparent: true, 
                alphaTest: 0.5, 
                side: THREE.DoubleSide 
            });
            applyGrassShader(billboardMat, false);
            applyGrassShader(grassMesh.material, true);

            const radius = 2000; // Radius erhöht
            const step = 0.6;    // Dichteres Gras
            const jitter = 0.3; 
            const waterLevel = 2.5; 
            const validPositions = [];
            const rng = mulberry32(42);

            for (let x = -radius; x <= radius; x += step) {
                for (let z = -radius; z <= radius; z += step) {
                    const d2 = x * x + z * z;
                    if (d2 > radius * radius) continue;
                    
                    // Wir spawnen Gras nur in bestimmten Clustern (Noise-basiert)
                    const noiseVal = simpleNoise(x * 0.05, z * 0.05);
                    if (noiseVal < 0) continue; 

                    const h = typeof getGPUHeight === 'function' ? getGPUHeight(x, z) : 2.5;
                    if (h < waterLevel) continue;
                    
                    validPositions.push({ 
                        x: x + (rng() - 0.5) * jitter, 
                        y: h, 
                        z: z + (rng() - 0.5) * jitter,
                        rot: rng() * Math.PI * 2,
                        scale: 1.5 + rng() * 2.5
                    });
                }
            }

            const count = validPositions.length;
            const mesh3D = new THREE.InstancedMesh(grassMesh.geometry, grassMesh.material, count);
            const mesh2D = new THREE.InstancedMesh(billboardGeo, billboardMat, count);
            
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scaleVec = new THREE.Vector3();
            const euler = new THREE.Euler();

            for (let i = 0; i < count; i++) {
                const pos = validPositions[i];
                position.set(pos.x, pos.y - 1.2, pos.z); // Offset Y korrigiert (tiefer in den Boden)
                euler.set(0, pos.rot, 0);
                quaternion.setFromEuler(euler);
                scaleVec.set(pos.scale, pos.scale, pos.scale);
                matrix.compose(position, quaternion, scaleVec);
                
                mesh3D.setMatrixAt(i, matrix);
                mesh2D.setMatrixAt(i, matrix);
            }

            [mesh3D, mesh2D].forEach(m => {
                m.instanceMatrix.needsUpdate = true;
                m.frustumCulled = true;
                m.layers.enable(0);
                m.layers.enable(3); // Grass-Layer
                if (mainScene) mainScene.add(m);
            });

            console.log(`✅ Hybride Wiese geladen: ${count} Instanzen (3D & 2D synchron).`);
        } catch (err) {
            console.error("❌ Fehler beim Erstellen der hybriden Wiese:", err);
        }
    }

    function updateClipmap(px, pz, renderer) {
        if (!clipmapMesh || !gpuCompute) return;

        // Zeit für Wind-Animation aktualisieren
        worldCullingUniforms.time.value = Date.now() * 0.001;

        // --- STABILISIERTE CLIPMAP-LOGIK (Jitter-Fix) ---
        // Das Mesh UND das GPGPU-Zentrum snappen auf die exakte Texel-Größe.
        // Das verhindert, dass Vertices über Texel "kriechen", was das Jittern verursacht.
        const snapSize = GPU_WORLD_SIZE / GPU_TERRAIN_SIZE; // Exakt 10m bei 10240/1024
        const sx = Math.floor(px / snapSize) * snapSize;
        const sz = Math.floor(pz / snapSize) * snapSize;
        
        // --- MESH-SNAPPING (Frozen Coordinates) ---
        // Das Mesh wird fest an das GPGPU-Grid gebunden.
        // Dadurch bewegen sich die Vertices nicht mehr flüssig mit dem Spieler, 
        // sondern bleiben an festen Welt-Koordinaten (solange sx/sz gleich bleiben).
        // Dies eliminiert das "Wackeln" (WackelPudding) komplett.
        clipmapGroup.position.set(sx, 0, sz);
        
        if (clipmapMesh) {
            clipmapMesh.position.set(0, 0, 0);
        }

        // GPGPU Update nur wenn das Snapping-Zentrum sich geändert hat
        const lastSnapX = GPGPU_Container.centerPos.x;
        const lastSnapZ = GPGPU_Container.centerPos.y;
        
        if (sx !== lastSnapX || sz !== lastSnapZ || GPGPU_Container.lastUpdate === 0) {
            updateGPGPU(sx, sz, renderer);
        }

        // Globale Culling-Uniforms aktualisieren (Spielerpos bleibt flüssig für Culling/Gras)
        worldCullingUniforms.playerPos.value.set(px, pz);

        // Persistente Terrain-Uniforms aktualisieren
        const target = gpuCompute.getCurrentRenderTarget(smoothVariable);
        if (target && target.texture) {
            terrainUniforms.heightMap.value = target.texture;
            if (target.texture.magFilter !== THREE.LinearFilter) {
                target.texture.magFilter = THREE.LinearFilter;
                target.texture.minFilter = THREE.LinearFilter;
                target.texture.needsUpdate = true;
            }
        }
        
        // worldOffset und meshOffset sind jetzt identisch (Gitter-Synchronisation)
        terrainUniforms.worldOffset.value.set(sx, sz);
        terrainUniforms.meshOffset.value.set(sx, sz); 
        terrainUniforms.playerPos.value.set(px, pz);
    }

    function updateGPGPU(px, pz, renderer) {
        if (!gpuCompute || !heightVariable || !heightVariable.material) return;
        
        // Zentrum im Container speichern für CPU-Abfragen
        GPGPU_Container.centerPos.set(px, pz);
        GPGPU_Container.lastUpdate = Date.now();
        
        // Wir übergeben das ZENTRUM (px, pz) an den Shader.
        // Der Shader berechnet daraus die Welt-Position für jedes Texel.
        if (heightVariable.material.uniforms.offset) {
            heightVariable.material.uniforms.offset.value.set(px, pz);
        }
        
        gpuCompute.compute();
        
        const renderTarget = gpuCompute.getCurrentRenderTarget(smoothVariable);
        if (renderTarget) {
            // OPTIMIERUNG: Wir lesen nur einen kleinen 16x16 Bereich aus der Mitte.
            // Das reduziert die CPU-GPU-Bandbreite drastisch (von 16MB auf 1KB pro Frame).
            // Dies behebt den "WackelPudding"-Effekt durch Framedrops.
            const size = GPGPU_Container.physicsSize;
            const offset = (GPU_TERRAIN_SIZE / 2) - (size / 2);
            renderer.readRenderTargetPixels(renderTarget, offset, offset, size, size, GPGPU_Container.physicsData);
        }
    }
    
    function getGPUHeight(x, z, noFallback = false) {
        if (!gpuCompute || !GPGPU_Container.physicsData || GPGPU_Container.physicsData.length === 0) {
            return noFallback ? null : getCPUHeight(x, z);
        }
        
        // Falls GPGPU noch nie geupdated wurde (Buffer sind leer), nutzen wir den CPU Fallback
        if (GPGPU_Container.lastUpdate === 0) {
            if (noFallback) return null;
            return getCPUHeight(x, z);
        }

        const h = GPGPU_Container.getSmoothHeight(x, z);
        
        if (h === undefined || isNaN(h)) {
            if (noFallback) return null;
            return getCPUHeight(x, z);
        }
        
        return h;
    }

    /**
     * Gibt die Layer-ID an der Position zurück (GPGPU-basiert)
     * 0 = Mesh, 1 = Grass, 2 = Water
     */
    function getGPULayer(x, z) {
        if (!gpuCompute || !GPGPU_Container || !GPGPU_Container.physicsData || GPGPU_Container.lastUpdate === 0) return 0;
        
        const { u, v } = GPGPU_Container.getUV(x, z);
        if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

        const localU = (u - 0.5) * (GPU_TERRAIN_SIZE / GPGPU_Container.physicsSize) + 0.5;
        const localV = (v - 0.5) * (GPU_TERRAIN_SIZE / GPGPU_Container.physicsSize) + 0.5;

        if (localU < 0 || localU >= 1 || localV < 0 || localV >= 1) return 0;

        const px = Math.floor(localU * (GPGPU_Container.physicsSize - 1));
        const py = Math.floor(localV * (GPGPU_Container.physicsSize - 1));
        const index = (py * GPGPU_Container.physicsSize + px) * 4;
        
        // G-Kanal = LayerID
        return Math.round(GPGPU_Container.physicsData[index + 1]);
    }
    
    // Basis-Pfad für Assets (Lokal vs. GitHub flexibel)
    // Dieser Pfad wird jetzt zentral in AssetsLibrary.js verwaltet.
    
    let chunks = new Map(); // Nur noch für Kollision/Vegetation im Hintergrund (Veraltet)
    let fpVillageBuildings = [];
    const VILLAGE_POS = { x: 0, z: 0 };
    
    let isInterior = false;
    let currentInterior = null;
    let selectedHouse = null;
    let calibrationParams = {
        overallScale: 6.0,
        targetWidth: 6.5,
        targetDepth: 6.5,
        wallScaleW: 1.625,
        wallScaleD: 1.625,
        roofScaleY: 1.3,
        gableScaleY: 1.3,
        wallY: 0,
        roofY: 4,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        houseModel: 'house1'
    };

    // Lade initiale Werte aus LocalStorage falls vorhanden
    const savedParams = localStorage.getItem('houseCalibrationParams');
    if (savedParams) {
        try {
            const parsed = JSON.parse(savedParams);
            calibrationParams = { ...calibrationParams, ...parsed };
        } catch (e) {
            console.warn("Fehler beim Laden der Kalibrierung aus LocalStorage:", e);
        }
    }

    function selectNearestHouse(px, pz) {
        let minDist = Infinity;
        let nearest = null;
        
        // Suche in allen geladenen Chunks nach Häusern
        chunks.forEach(chunk => {
            if (chunk.group) {
                chunk.group.children.forEach(obj => {
                    if (obj.isBuildingGroup) { // Wir müssen diese Flag beim Erstellen setzen
                        const dist = Math.hypot(obj.position.x - px, obj.position.z - pz);
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = obj;
                        }
                    }
                });
            }
        });

        if (nearest) {
            if (selectedHouse) {
                // Vorheriges Haus entmarkieren (z.B. BoxHelper entfernen)
                selectedHouse.remove(selectedHouse.getObjectByName("CalibrationHelper"));
            }
            selectedHouse = nearest;
            const helper = new THREE.BoxHelper(selectedHouse, 0x00ff00);
            helper.name = "CalibrationHelper";
            selectedHouse.add(helper);
            console.log("[Kalibrierung] Haus ausgewählt:", selectedHouse.userData.name);
            return true;
        }
        return false;
    }

    async function updateCalibration(params) {
        if (!selectedHouse) return;
        Object.assign(calibrationParams, params);
        
        // Speichere in LocalStorage
        localStorage.setItem('houseCalibrationParams', JSON.stringify(calibrationParams));
        
        // Haus neu aufbauen
        const x = selectedHouse.position.x;
        const z = selectedHouse.position.z;
        const name = selectedHouse.userData.name;
        const parent = selectedHouse.parent;
        
        // Altes Haus entfernen
        parent.remove(selectedHouse);
        
        // Typ bestimmen (Kalibrierung oder House1)
        let type = 'calibration';
        if (calibrationParams.houseModel === 'house1') {
            type = 'house1';
        }

        // Neues Haus mit Kalibrierungswerten erstellen
        const newHouse = await createModularHouse(type, x, z);
        newHouse.userData.name = name;
        newHouse.isBuildingGroup = true;
        parent.add(newHouse);
        
        selectedHouse = newHouse;
        const helper = new THREE.BoxHelper(selectedHouse, 0x00ff00);
        helper.name = "CalibrationHelper";
        selectedHouse.add(helper);
    }

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
            
            // DracoLoader hinzufügen für komprimierte .glb Dateien
            if (typeof THREE.DRACOLoader !== 'undefined') {
                const dracoLoader = new THREE.DRACOLoader();
                // Nutze das Google-CDN für die Draco-Decoder-Dateien
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
                loader.setDRACOLoader(dracoLoader);
            }
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
            // Bestimme den Basis-Pfad für Texturen (alles vor dem Dateinamen)
            const lastSlash = fullPath.lastIndexOf('/');
            const basePath = lastSlash !== -1 ? fullPath.substring(0, lastSlash + 1) : '';
            loader.setPath(''); // Reset
            
            loader.load(fullPath, (gltf) => {
                // Falls das Modell Texturen hat, die relativ geladen werden müssen
                const isTerrain = fullPath.includes('/Terrain/') || fullPath.includes('Terrain_Grass') || fullPath.includes('ocean.glb');
                gltf.scene.traverse(obj => {
                    if (obj.isMesh && obj.material) {
                        applyWorldCulling(obj.material, isTerrain);
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(m => {
                            if (m.map) m.map.name = m.map.name || "texture";
                        });
                    }
                });
                modelCache.set(path, gltf.scene);
                resolve(gltf.scene.clone());
            }, undefined, (err) => {
                // Nur bei echten Fehlern loggen, um Rauschen zu vermeiden
                if (err instanceof RangeError || (err.message && err.message.includes('out-of-bounds'))) {
                    console.error("!!! GLB STRUKTUR-FEHLER !!!", fullPath);
                }
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

    async function createLegacyModularHouse(type = 'small', seedX = 0, seedZ = 0) {
        const group = new THREE.Group();
        
        // Spezialfall: Neues House_1.glb Modell
        if (type === 'house1' || (type === 'calibration' && calibrationParams.houseModel === 'house1')) {
            try {
                const model = await loadModel(AssetsLibrary.get('HOUSE', 'HOUSE_1'));
                
                let s = 10;
                if (type === 'calibration') {
                    s = calibrationParams.overallScale;
                    group.position.x += calibrationParams.offsetX;
                    group.position.y += calibrationParams.offsetY;
                    group.position.z += calibrationParams.offsetZ;
                } else {
                    // Deterministische Variation für normale Häuser
                    const houseRng = () => {
                        const s = Math.sin(seedX * 12.9898 + seedZ * 78.233) * 43758.5453;
                        return s - Math.floor(s);
                    };
                    const rand = houseRng();
                    s = 8 + rand * 4; // Skalierung 8-12
                    group.rotation.y = Math.floor(rand * 4) * (Math.PI / 2); // 0, 90, 180, 270 Grad
                }
                
                model.scale.set(s, s, s);
                group.add(model);
                return group;
            } catch (e) {
                console.warn("Konnte House_1.glb nicht laden, wechsle zu modular:", e);
                // Fallback zu modular
            }
        }

        // Grundwerte initialisieren
        let currentScale = 6.0;
        let targetWidth, targetDepth, wallScaleW, wallScaleD;
        let roofScaleY = 1.3, gableScaleY = 1.3;
        let wallY = 0, roofY = 4;

        if (type === 'calibration') {
            currentScale = calibrationParams.overallScale;
            targetWidth = calibrationParams.targetWidth;
            targetDepth = calibrationParams.targetDepth;
            wallScaleW = calibrationParams.wallScaleW;
            wallScaleD = calibrationParams.wallScaleD;
            roofScaleY = calibrationParams.roofScaleY;
            gableScaleY = calibrationParams.gableScaleY;
            wallY = calibrationParams.wallY;
            roofY = calibrationParams.roofY;
            
            // Positions-Offsets anwenden
            group.position.x += calibrationParams.offsetX;
            group.position.y += calibrationParams.offsetY;
            group.position.z += calibrationParams.offsetZ;
        } else {
            // Deterministischer Zufall basierend auf Position für konsistente Größe
            const houseRng = () => {
                const s = Math.sin(seedX * 12.9898 + seedZ * 78.233) * 43758.5453;
                return s - Math.floor(s);
            };
            const BASE_SIZE = 4.0; 
            targetWidth = 4.5 + houseRng() * 4.0;
            targetDepth = 4.5 + houseRng() * 4.0;
            wallScaleW = targetWidth / BASE_SIZE;
            wallScaleD = targetDepth / BASE_SIZE;
        }

        const halfW = targetWidth / 2;
        const halfD = targetDepth / 2;

        try {
            // Boden (skaliert auf exakte Fundamentgröße)
            const floor = await loadModel(AssetsLibrary.get('VILLAGE', 'FLOOR_WOOD'));
            floor.scale.set(wallScaleW, 1, wallScaleD);
            group.add(floor);

            // Wände (Skalierung füllt Raum zwischen Eckpfeilern zu 100%)
            const wallConfigs = [
                { path: 'WALL_DOOR', pos: [0, wallY, halfD], rot: 0, scale: wallScaleW },
                { path: 'WALL_WINDOW', pos: [halfW, wallY, 0], rot: Math.PI / 2, scale: wallScaleD },
                { path: 'WALL_STRAIGHT', pos: [0, wallY, -halfD], rot: Math.PI, scale: wallScaleW },
                { path: 'WALL_STRAIGHT', pos: [-halfW, wallY, 0], rot: -Math.PI / 2, scale: wallScaleD }
            ];

            for (const config of wallConfigs) {
                const wall = await loadModel(AssetsLibrary.get('VILLAGE', config.path));
                wall.position.set(...config.pos);
                wall.rotation.y = config.rot;
                wall.scale.x = config.scale; 
                group.add(wall);
            }

            // Ecken (Pfeiler) - An die Ecken des Fundaments gepinnt
            const cornerPos = [
                [halfW, 0, halfD],   // VR
                [-halfW, 0, halfD],  // VL
                [-halfW, 0, -halfD], // HL
                [halfW, 0, -halfD]   // HR
            ];

            for (let i = 0; i < 4; i++) {
                const corner = await loadModel(AssetsLibrary.get('VILLAGE', 'CORNER'));
                corner.position.set(...cornerPos[i]);
                corner.rotation.y = i * (-Math.PI / 2) + Math.PI/2;
                group.add(corner);
            }

            // Dach (Skalierung folgt Fundament)
            const roof = await loadModel(AssetsLibrary.get('VILLAGE', 'ROOF_4X4'));
            roof.scale.set(wallScaleW, roofScaleY, wallScaleD); 
            roof.position.set(0, roofY, 0); 
            group.add(roof);

            // Giebel (Dachabschluss)
            let gablePath = AssetsLibrary.get('VILLAGE', 'ROOF_GABLE');
            if (gablePath.endsWith('ROOF_GABLE')) {
                 gablePath = AssetsLibrary.encode('animation/Medieval Village MegaKit[Standard]/glTF/Roof_Front_Brick4.gltf');
            }

            const gableFront = await loadModel(gablePath);
            gableFront.position.set(0, roofY, halfD);
            gableFront.scale.set(wallScaleW, gableScaleY, 1);
            group.add(gableFront);

            const gableBack = await loadModel(gablePath);
            gableBack.position.set(0, roofY, -halfD);
            gableBack.rotation.y = Math.PI;
            gableBack.scale.set(wallScaleW, gableScaleY, 1);
            group.add(gableBack);

            group.scale.set(currentScale, currentScale, currentScale);
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
    // --- 100% SYNC NOISE (MATCHES SHADER) ---
    function snoise(v) {
        v = [v[0] + WORLD_SEED * 0.123, v[1] + WORLD_SEED * 0.456]; // Seed-Offset für die Welt
        const C = [0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439];
        let i = [Math.floor(v[0] + (v[0] + v[1]) * C[1]), Math.floor(v[1] + (v[0] + v[1]) * C[1])];
        let x0 = [v[0] - i[0] + (i[0] + i[1]) * C[0], v[1] - i[1] + (i[0] + i[1]) * C[0]];
        let i1 = (x0[0] > x0[1]) ? [1.0, 0.0] : [0.0, 1.0];
        let x12 = [x0[0] - i1[0] + C[0], x0[1] - i1[1] + C[0], x0[0] + C[2], x0[1] + C[2]];
        
        let i_mod = [i[0] % 289.0, i[1] % 289.0];
        if (i_mod[0] < 0) i_mod[0] += 289.0;
        if (i_mod[1] < 0) i_mod[1] += 289.0;

        const permute = (x) => {
            return x.map(v => ((v * 34.0) + 1.0) * v % 289.0);
        };

        let p = permute(permute([i_mod[1], i_mod[1] + i1[1], i_mod[1] + 1.0]).map((v, j) => v + i_mod[0] + [0.0, i1[0], 1.0][j]));
        let m = [
            Math.max(0.5 - (x0[0] * x0[0] + x0[1] * x0[1]), 0.0),
            Math.max(0.5 - (x12[0] * x12[0] + x12[1] * x12[1]), 0.0),
            Math.max(0.5 - (x12[2] * x12[2] + x12[3] * x12[3]), 0.0)
        ];
        m = m.map(v => v * v * v * v);
        
        let x_vec = p.map(v => (2.0 * (v * C[3] % 1.0) - 1.0));
        let h_vec = x_vec.map(v => Math.abs(v) - 0.5);
        let a0 = x_vec.map(v => v - Math.floor(v + 0.5));
        
        let g = [
            a0[0] * x0[0] + h_vec[0] * x0[1],
            a0[1] * x12[0] + h_vec[1] * x12[1],
            a0[2] * x12[2] + h_vec[2] * x12[3]
        ];
        
        return 130.0 * (m[0] * g[0] + m[1] * g[1] + m[2] * g[2]);
    }

    function fbm(p, octaves = 8) {
        let v = 0.0;
        let a = 0.5;
        let shift = [100.0, 100.0];
        let rot_c = Math.cos(0.5);
        let rot_s = Math.sin(0.5);
        let pos = [p[0], p[1]];
        for (let i = 0; i < octaves; ++i) {
            v += a * snoise(pos);
            let p_new = [
                rot_c * pos[0] * 2.0 + rot_s * pos[1] * 2.0 + shift[0],
                -rot_s * pos[0] * 2.0 + rot_c * pos[1] * 2.0 + shift[1]
            ];
            pos = p_new;
            a *= 0.5;
        }
        return v;
    }

    // --- SMOOTHSTEP HILFSFUNKTION ---
    function smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    function ridge(n) { return 1.0 - Math.abs(n); }
    function ridgedFBM(p, octaves = 6) {
        let v = 0.0;
        let a = 0.5;
        let f = 1.0;
        for (let i = 0; i < octaves; ++i) {
            v += ridge(snoise([p[0] * f, p[1] * f])) * a;
            f *= 2.0;
            a *= 0.5;
        }
        return v * v;
    }

    function getCPUHeight(x, z) {
        // --- SYNC MIT GPGPU-ZENTRUM (Jitter-Fix) ---
        // Um Jitter zwischen CPU und GPU zu vermeiden, berechnen wir die Höhe 
        // basierend auf der Position, die die GPU sieht.
        const distToStart = Math.hypot(x, z);
        const s = WORLD_SEED % 10000;
        
        // Hilfsfunktion für konsistente Offsets
        const pos = [x, z];
        
        // 1:1 Kopie der NOISE_SHADER Logik
        // 1. Großflächige Kontinente
        const continent = fbm([pos[0] * 0.00008 + s * 0.123, pos[1] * 0.00008 + s * 0.456], 8);
        
        // 2. Gebirgs-Maske
        const mountainMask = smoothstep(-0.1, 0.5, fbm([pos[0] * 0.00015 + 1000 + s * 0.123, pos[1] * 0.00015 + 1000 + s * 0.456], 4));
        
        // 3. Hochgebirge
        const peaks = ridgedFBM([pos[0] * 0.0006 + s * 0.123, pos[1] * 0.0006 + s * 0.456], 6) * 600.0;
        
        // 4. Sanfte Hügelketten
        const hills = fbm([pos[0] * 0.0004 + s * 0.123, pos[1] * 0.0004 + s * 0.456], 8) * 60.0;
        
        // 5. Ebenen-Varianz
        const flatVariance = snoise([pos[0] * 0.002 + s * 0.123, pos[1] * 0.002 + s * 0.456]) * 2.5;
        
        let h = hills * (1.0 - mountainMask) + peaks * mountainMask;
        h += continent * 20.0;
        h += flatVariance;
        
        // 6. Täler & Seen
        const valleyNoise = fbm([pos[0] * 0.00012 - 500 + s * 0.123, pos[1] * 0.00012 - 500 + s * 0.456], 4);
        const valleyMask = smoothstep(0.4, 0.0, Math.abs(valleyNoise));
        h = h * (1.0 - valleyMask * 0.85) + (-25.0 + flatVariance) * (valleyMask * 0.85);
        
        // --- STARTBEREICH SCHUTZ ---
        if (distToStart < 400.0) {
            const f = smoothstep(100.0, 400.0, distToStart);
            h = 1.0 * (1.0 - f) + h * f;
        }
        
        return Math.min(2500.0, Math.max(-300.0, h));
    }

    // --- GLOBALER EXPORT FÜR PHYSIK ---
    window.FPGraphics_getCPUHeight = getCPUHeight;
    window.FPGraphics_getGPULayer = getGPULayer;

    function getBiomeData(x, z, h) {
        // Diese Logik MUSS mit dem Clipmap-Shader in initClipmap übereinstimmen!
        const scale = 0.0002;
        
        // Einfacher 2D Value-Noise Nachbau für CPU (wie im Shader)
        const noise2D = (nx, nz) => {
            nx += WORLD_SEED * 0.01;
            nz += WORLD_SEED * 0.02;
            const hash = (p) => {
                const s = Math.sin(p[0] * 127.1 + p[1] * 311.7) * 43758.5453123;
                return s - Math.floor(s);
            };
            const ix = Math.floor(nx);
            const iz = Math.floor(nz);
            const fx = nx - ix;
            const fz = nz - iz;
            const ux = fx * fx * (3.0 - 2.0 * fx);
            const uz = fz * fz * (3.0 - 2.0 * fz);
            
            const v00 = hash([ix, iz]);
            const v10 = hash([ix + 1, iz]);
            const v01 = hash([ix, iz + 1]);
            const v11 = hash([ix + 1, iz + 1]);
            
            return (v00 * (1 - ux) + v10 * ux) * (1 - uz) +
                   (v01 * (1 - ux) + v11 * ux) * uz;
        };

        const temp = noise2D(x * scale, z * scale) * 2.0 - 1.0;
        const humidity = noise2D(x * scale + 100.0, z * scale + 100.0) * 2.0 - 1.0;

        const weights = {
            ocean: 0, desert: 0, snow: 0, jungle: 0, swamp: 0, forest: 0, plains: 0, mountains: 0
        };

        const smoothStep = (edge0, edge1, x) => {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        };

        // 1. Ocean (nur wenn h übergeben wurde, um Rekursion zu vermeiden)
        if (h !== undefined) {
            if (h < 2.0) {
                weights.ocean = smoothStep(2.0, -5.0, h);
            }
        }

        // 2. Biome logic
        // Berge-Check (wie im Shader)
        const mountNoise = Math.pow(Math.abs(noise2D(x * 0.0006, z * 0.0006)), 2.0);
        
        if (temp < 0.4 || mountNoise > 0.3) {
            weights.mountains = smoothStep(0.2, 0.5, mountNoise);
        }

        if (temp > 0.5) {
            if (humidity < -0.3) weights.desert = 1.0;
            else if (humidity > 0.3) weights.jungle = 1.0;
            else weights.forest = 1.0;
        } else if (temp < -0.4) {
            weights.snow = 1.0;
        } else {
            if (humidity > 0.6) weights.swamp = 1.0;
            else if (humidity < -0.5) weights.desert = 0.5;
            else if (temp > 0.0) weights.forest = 1.0;
            else weights.plains = 1.0;
        }

        // 3. Start point (0,0) override
        const distToStart = Math.hypot(x, z);
        const startEffect = 1.0 - smoothStep(100.0, 300.0, distToStart);
        weights.plains = weights.plains * (1 - startEffect) + startEffect;
        weights.ocean *= (1 - startEffect);
        weights.snow *= (1 - startEffect);
        weights.mountains *= (1 - startEffect);

        // Normalize
        let total = 0;
        for (const w in weights) total += weights[w];
        if (total > 0) {
            for (const w in weights) weights[w] /= total;
        }

        let maxWeight = -1;
        let mainBiome = 'plains';
        for (const [name, w] of Object.entries(weights)) {
            if (w > maxWeight) {
                maxWeight = w;
                mainBiome = name;
            }
        }

        return { name: mainBiome, temp, humidity, weights };
    }

    function getBiomeColor(x, z) {
        const h = getGPUHeight(x, z);
        const data = getBiomeData(x, z, h);
        
        const biomeColors = {
            ocean: new THREE.Color(0x1a4a8a),
            desert: new THREE.Color(0xedc9af),
            snow: new THREE.Color(0xffffff),
            jungle: new THREE.Color(0x1a472a),
            swamp: new THREE.Color(0x2f351e),
            forest: new THREE.Color(0x2d5a27),
            plains: new THREE.Color(0x567d46),
            stone: new THREE.Color(0x808080),
            path: new THREE.Color(0x9b7653)
        };
        
        let finalColor = new THREE.Color(0, 0, 0);
        
        const blend = (color, weight) => {
            if (!color) return;
            finalColor.r += color.r * weight;
            finalColor.g += color.g * weight;
            finalColor.b += color.b * weight;
        };

        blend(biomeColors.ocean, data.weights.ocean || 0);
        blend(biomeColors.desert, data.weights.desert || 0);
        blend(biomeColors.snow, data.weights.snow || 0);
        blend(biomeColors.jungle, data.weights.jungle || 0);
        blend(biomeColors.swamp, data.weights.swamp || 0);
        blend(biomeColors.forest, data.weights.forest || 0);
        blend(biomeColors.plains, data.weights.plains || 0);

        // Helligkeits-Boost für Sichtbarkeit (wie im Shader)
        const brightness = (Math.max(0, Math.min(1, (h + 20) / 120)) * 0.4 + 0.9);
        finalColor.multiplyScalar(brightness * 1.2);
        
        return finalColor;
    }

    function createDetailedTree(x, z, h, rng, leafColor = 0x567d46, customScale = 1.0) {
        const g = new THREE.Group();
        g.position.set(x, h, z);
        const s = (0.8 + rng() * 1.2) * customScale;
        
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

    function createLegacyCactus(rng) {
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x556b2f, flatShading: true });
        
        // Hauptstamm
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 12, 6), mat);
        body.position.y = 6;
        g.add(body);
        
        // Arme
        for(let i=0; i<2; i++) {
            const arm = new THREE.Group();
            arm.position.y = 5 + rng() * 4;
            arm.rotation.y = rng() * Math.PI * 2;
            
            const part1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 6), mat);
            part1.rotation.z = Math.PI / 2;
            part1.position.x = 2;
            arm.add(part1);
            
            const part2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 6), mat);
            part2.position.set(4, 2, 0);
            arm.add(part2);
            
            g.add(arm);
        }
        return g;
    }

    function createPalm(rng) {
        const g = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true });
        
        // Gebogener Stamm
        const trunk = new THREE.Group();
        let currY = 0;
        let currX = 0;
        for(let i=0; i<8; i++) {
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - i*0.1, 1.6 - i*0.1, 4, 6), trunkMat);
            seg.position.y = 2;
            const node = new THREE.Group();
            node.position.y = currY;
            node.position.x = currX;
            node.rotation.z = Math.sin(i * 0.5) * 0.1;
            node.add(seg);
            trunk.add(node);
            currY += 3.5;
            currX += Math.sin(i * 0.5) * 0.5;
        }
        g.add(trunk);
        
        // Blätter
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x228b22, flatShading: true, side: THREE.DoubleSide });
        const leafGeo = new THREE.BoxGeometry(1, 15, 0.2);
        for(let i=0; i<10; i++) {
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.y = currY;
            leaf.position.x = currX;
            leaf.rotation.y = (i / 10) * Math.PI * 2;
            leaf.rotation.z = 1.2;
            leaf.geometry.translate(0, 7.5, 0);
            g.add(leaf);
        }
        
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

    // --- HELPERS ---
    function mix(a, b, t) {
        return a * (1 - t) + b * t;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    function rndSeed(s) {
        return mulberry32(s);
    }


    // --- PROCEDURAL MODELS ---
    function createDetailedTree(x, z, h, rng, color = 0x2d5a27, scale = 1.0) {
        const group = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b2d15, flatShading: true });
        const leavesMat = new THREE.MeshStandardMaterial({ color: color, flatShading: true });
        
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 8, 6), trunkMat);
        trunk.position.y = 4;
        group.add(trunk);
        
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 0), leavesMat);
        leaves.position.y = 8;
        group.add(leaves);
        
        group.position.set(x, h, z);
        group.scale.set(scale, scale, scale);
        return group;
    }

    function createLegacyCactus(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 8 + rng() * 6, 2), mat);
        body.position.y = 4;
        group.add(body);
        return group;
    }

    function createPalm(rng) {
        const g = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 15, 6), trunkMat);
        trunk.position.y = 7.5;
        g.add(trunk);
        return g;
    }

    // --- PROCEDURAL MODELS ---
    function createDetailedTree(x, z, h, rng, color = 0x2d5a27, scale = 1.0) {
        const group = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b2d15, flatShading: true });
        const leavesMat = new THREE.MeshStandardMaterial({ color: color, flatShading: true });
        
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 8, 6), trunkMat);
        trunk.position.y = 4;
        group.add(trunk);
        
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 0), leavesMat);
        leaves.position.y = 8;
        group.add(leaves);
        
        group.position.set(x, h, z);
        group.scale.set(scale, scale, scale);
        return group;
    }

    function createLegacyCactus(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 8 + rng() * 6, 2), mat);
        body.position.y = 4;
        group.add(body);
        return group;
    }

    function createPalm(rng) {
        const g = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, flatShading: true });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 15, 6), trunkMat);
        trunk.position.y = 7.5;
        g.add(trunk);
        return g;
    }

    const instanceCache = new Map(); // Cache für InstancedMesh-Vorlagen (Geometry/Material)
    let globalBillboardMat = null;
    let globalBillboardGeo = null;

    async function getModelInstanceData(path) {
        if (instanceCache.has(path)) return instanceCache.get(path);
        
        const model = await loadModel(path);
        let mesh = null;
        model.traverse(obj => {
            if (obj.isMesh && !mesh) mesh = obj;
        });

        if (mesh) {
            const isTerrain = path.includes('/Terrain/') || path.includes('Terrain_Grass') || path.includes('ocean.glb');
            const isGrass = path.toLowerCase().includes('grass');

            if (isGrass && !isTerrain) {
                applyGrassShader(mesh.material, true);
            } else {
                applyWorldCulling(mesh.material, isTerrain);
            }

            const data = { geo: mesh.geometry, mat: mesh.material };
            instanceCache.set(path, data);
            return data;
        }
        return null;
    }

    // --- CLIPMAP DECORATIONS ---
    let decorationGroups = new Map(); // Speichert InstancedMeshes pro Zelle
    let grassGroups = new Map();      // Speichert Gras-Instanzen in kleineren Chunks

    function updateClipmapDecorations(px, pz, scene) {
        // 1. Große Dekorationen (Bäume, Steine) - 256x256 Zellen
        const viewDist = 450; // Etwas größere Sichtweite für Bäume
        const cellSize = DECORATION_CELL_SIZE;
        
        const minCX = Math.floor((px - viewDist) / cellSize);
        const maxCX = Math.floor((px + viewDist) / cellSize);
        const minCZ = Math.floor((pz - viewDist) / cellSize);
        const maxCZ = Math.floor((pz + viewDist) / cellSize);
        
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                const key = `${cx},${cz}`;
                if (!decorationGroups.has(key)) {
                    const group = new THREE.Group();
                    scene.add(group);
                    decorationGroups.set(key, group);
                    spawnDecorationsInCell(cx, cz, group);
                }
            }
        }
        
        decorationGroups.forEach((group, key) => {
            const [cx, cz] = key.split(',').map(Number);
            const centerX = cx * cellSize + cellSize / 2;
            const centerZ = cz * cellSize + cellSize / 2;
            const dist = Math.hypot(centerX - px, centerZ - pz);
            if (dist > viewDist + cellSize) {
                scene.remove(group);
                decorationGroups.delete(key);
            }
        });

        // 2. Dichtes Gras - 64x64 Zellen (Chunking)
        updateGrassChunks(px, pz, scene);
    }

    function updateGrassChunks(px, pz, scene) {
        const grassDist = 300; // Gras nur im Nahbereich
        const cellSize = GRASS_CELL_SIZE;
        
        const minCX = Math.floor((px - grassDist) / cellSize);
        const maxCX = Math.floor((px + grassDist) / cellSize);
        const minCZ = Math.floor((pz - grassDist) / cellSize);
        const maxCZ = Math.floor((pz + grassDist) / cellSize);

        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                const key = `${cx},${cz}`;
                if (!grassGroups.has(key)) {
                    const group = new THREE.Group();
                    scene.add(group);
                    grassGroups.set(key, group);
                    spawnGrassInCell(cx, cz, group);
                }
            }
        }

        grassGroups.forEach((group, key) => {
            const [cx, cz] = key.split(',').map(Number);
            const centerX = cx * cellSize + cellSize / 2;
            const centerZ = cz * cellSize + cellSize / 2;
            const dist = Math.hypot(centerX - px, centerZ - pz);
            if (dist > grassDist + cellSize) {
                scene.remove(group);
                grassGroups.delete(key);
            }
        });
    }

    function createCactus(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });
        
        // Hauptstamm
        const body = new THREE.Mesh(new THREE.BoxGeometry(2, 8 + rng() * 6, 2), mat);
        body.position.y = 4;
        group.add(body);
        
        // Arme
        if (rng() > 0.3) {
            const arm1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4, 1.5), mat);
            arm1.position.set(2, 6, 0);
            group.add(arm1);
            const elbow1 = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.5), mat);
            elbow1.position.set(1, 4, 0);
            group.add(elbow1);
        }
        return group;
    }

    function createSnowMound(rng) {
        const geo = new THREE.IcosahedronGeometry(2 + rng() * 3, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.y = 0.5;
        mesh.rotation.y = rng() * Math.PI;
        return mesh;
    }

    function createDeadTree(rng) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true });
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 15 + rng() * 10, 1.5), mat);
        trunk.position.y = 7;
        trunk.rotation.z = (rng() - 0.5) * 0.3;
        group.add(trunk);
        return group;
    }

    async function spawnGrassInCell(cx, cz, group) {
        const seed = (cx * 91234567) ^ (cz * 12345678);
        const rng = mulberry32(seed);
        
        const x0 = cx * GRASS_CELL_SIZE;
        const z0 = cz * GRASS_CELL_SIZE;

        // Biome für die Zelle bestimmen
        const midX = x0 + GRASS_CELL_SIZE / 2;
        const midZ = z0 + GRASS_CELL_SIZE / 2;
        const midH = getGPUHeight(midX, midZ);
        const biome = getBiomeData(midX, midZ, midH);
        
        // Ocean/Water check
        if (midH < 2.0) return;

        // Hauptdorf Check (Radius 1500) - ENTFERNT um Gras überall zu erlauben
        // const distToCenter = Math.sqrt(midX * midX + midZ * midZ);
        // if (distToCenter < 1500) return;

        // Dichte basierend auf Biome
        let density = 20; // Default
        if (biome.name === 'plains') density = 150;
        else if (biome.name === 'forest') density = 120;
        else if (biome.name === 'jungle') density = 200;
        else if (biome.name === 'swamp') density = 100;
        else if (biome.name === 'desert') density = 10;
        else if (biome.name === 'snow') density = 5;

        const instancedData = new Map();
        
        for (let i = 0; i < density; i++) {
            const sx = x0 + rng() * GRASS_CELL_SIZE;
            const sz = z0 + rng() * GRASS_CELL_SIZE;
            const sh = getGPUHeight(sx, sz);
            
            if (sh > 1.5) {
                let assetPath = null;
                let scale = 1.0;

                if (biome.name === 'snow') {
                    // Kein Gras im Schnee
                } else if (biome.name !== 'desert') {
                    const rand = rng();
                    if (rand > 0.4) {
                        assetPath = AssetsLibrary.get('TERRAIN', 'GRASS');
                        scale = 1.0 + rng() * 0.5;
                    } else if (rand > 0.1) {
                        const grassList = AssetsLibrary.get('TREES', 'GRASS');
                        assetPath = rng() > 0.5 
                            ? AssetsLibrary.encode('baeume/glTF/' + grassList[0])
                            : AssetsLibrary.encode('baeume/glTF/' + grassList[1]);
                        scale = 0.8 + rng() * 0.4;
                    } else {
                        const flowerList = AssetsLibrary.get('TREES', 'FLOWERS');
                        if (Array.isArray(flowerList) && flowerList.length > 0) {
                            const flower = flowerList[Math.floor(rng() * flowerList.length)];
                            assetPath = AssetsLibrary.encode('baeume/glTF/' + flower);
                            scale = 1.0 + rng() * 1.5;
                        }
                    }
                }

                if (assetPath) {
                    // Pfad-Check: AssetsLibrary.encode liefert oft schon animation/
                    const finalPath = assetPath.startsWith('animation/') ? assetPath : 'animation/' + assetPath;
                    if (!instancedData.has(finalPath)) instancedData.set(finalPath, []);
                    
                    instancedData.get(finalPath).push({
                        pos: [sx, sh + 0.1, sz], // Gras näher am Boden (Floating Fix)
                        scale: scale,
                        rot: rng() * Math.PI * 2
                    });
                }
            }
        }

        // Instanzen erstellen
        for (const [path, instances] of instancedData.entries()) {
            if (instances.length === 0) continue;
            getModelInstanceData(path).then(data => {
                if (!data) return;

                // 2D Billboard Material vorbereiten falls nötig
                if (!globalBillboardMat) {
                    const billboardTex = new THREE.TextureLoader().load(GRASS_PNG_PATH);
                    billboardTex.anisotropy = 16;
                    billboardTex.encoding = THREE.sRGBEncoding;
                    billboardTex.minFilter = THREE.LinearMipmapLinearFilter;
                    
                    globalBillboardMat = new THREE.MeshBasicMaterial({ map: billboardTex });
                    applyGrassShader(globalBillboardMat, false);
                    globalBillboardGeo = new THREE.PlaneGeometry(2, 2);
                    globalBillboardGeo.translate(0, 1, 0);
                }

                const mesh3D = new THREE.InstancedMesh(data.geo, data.mat, instances.length);
                const mesh2D = new THREE.InstancedMesh(globalBillboardGeo, globalBillboardMat, instances.length);
                
                const matrix = new THREE.Matrix4();
                const position = new THREE.Vector3();
                const rotation = new THREE.Euler();
                const quaternion = new THREE.Quaternion();
                const scaleVec = new THREE.Vector3();

                for (let i = 0; i < instances.length; i++) {
                    const inst = instances[i];
                    position.set(inst.pos[0], inst.pos[1], inst.pos[2]);
                    rotation.set(0, inst.rot, 0);
                    quaternion.setFromEuler(rotation);
                    scaleVec.set(inst.scale, inst.scale, inst.scale);
                    matrix.compose(position, quaternion, scaleVec);
                    
                    mesh3D.setMatrixAt(i, matrix);
                    mesh2D.setMatrixAt(i, matrix);
                }

                [mesh3D, mesh2D].forEach(m => {
                    m.instanceMatrix.needsUpdate = true;
                    m.frustumCulled = true;
                    group.add(m);
                });
            }).catch(e => {});
        }
    }

    let decorationRaycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3(0, -1, 0);

    function getRaycastHeight(x, z, fallbackHeight = 0) {
        // WICHTIG: Wir nutzen NICHT mehr das Raycasting auf das clipmapMesh, 
        // da dieses auf der CPU flach ist (Displacement passiert im Shader).
        // Stattdessen nutzen wir die GPGPU-Daten (getGPUHeight).
        
        const gpuH = getGPUHeight(x, z);
        
        // h === 0 ist valide (Plateau), aber h === undefined/NaN wäre ein Fehler.
        // getGPUHeight liefert bereits getCPUHeight als Fallback.
        if (gpuH !== undefined && !isNaN(gpuH)) {
            return gpuH;
        }
        
        return fallbackHeight;
    }

    async function spawnDecorationsInCell(cx, cz, group) {
        const seed = (cx * 73856093) ^ (cz * 19349663);
        const rng = mulberry32(seed);
        
        const x0 = cx * DECORATION_CELL_SIZE;
        const z0 = cz * DECORATION_CELL_SIZE;

        // Biome für die Zelle bestimmen (Mitte der Zelle als Referenz)
        const midX = x0 + DECORATION_CELL_SIZE / 2;
        const midZ = z0 + DECORATION_CELL_SIZE / 2;
        const midH = getGPUHeight(midX, midZ);
        const biome = getBiomeData(midX, midZ, midH);
        
        // --- GPGPU HEIGHT VALIDATION ---
        // Sicherstellen, dass die Zelle korrekt auf dem Terrain liegt
        const groundH = getGPUHeight(midX, midZ);
        group.position.y = 0; // Gruppe bleibt auf 0, Kinder werden individuell positioniert

        // 1. Große Vegetation (Individuelle Meshes für Komplexität)
        // PERFORMANCE-GESETZ: Glocken-Prinzip (Culling)
        let densityMult = 0.8; // Standard-Dichte für die Vegetation
        
        let treeCount = 0;
        if (biome.name === 'jungle') treeCount = (15 + Math.floor(rng() * 12)) * densityMult;
        else if (biome.name === 'plains') treeCount = (3 + Math.floor(rng() * 5)) * densityMult;
        else if (biome.name === 'swamp') treeCount = (10 + Math.floor(rng() * 10)) * densityMult;
        else if (biome.name === 'snow') treeCount = (4 + Math.floor(rng() * 4)) * densityMult;
        else if (biome.name === 'desert') treeCount = (3 + Math.floor(rng() * 3)) * densityMult;
        else if (biome.name === 'forest') treeCount = (20 + Math.floor(rng() * 20)) * densityMult;
        else if (biome.name === 'mountains') treeCount = (2 + Math.floor(rng() * 3)) * densityMult;

        treeCount = Math.floor(treeCount);

        for (let i = 0; i < treeCount; i++) {
            const tx = x0 + rng() * DECORATION_CELL_SIZE;
            const tz = z0 + rng() * DECORATION_CELL_SIZE;
            const gpuH = getGPUHeight(tx, tz);
            
            // Nur spawnen wenn über Wasserlevel (außer Swamp)
            const waterLevel = 2.0; 
            if (gpuH > waterLevel + 0.5 || (biome.name === 'swamp' && gpuH > -1.5)) { 
                // Präzises Raycasting für Bäume (Asset-Anchor Regel)
                const th = getRaycastHeight(tx, tz, gpuH);
                
                let assetPath = null;
                let plantScale = 1.0;

                if (biome.name === 'jungle') {
                    assetPath = AssetsLibrary.encode('Nature/glTF/PalmTree_1.gltf');
                    plantScale = 8 + rng() * 10;
                } else if (biome.name === 'desert') {
                    if (rng() > 0.4) {
                        assetPath = AssetsLibrary.encode('Nature/glTF/Cactus_1.gltf');
                        plantScale = 5 + rng() * 6;
                    }
                } else if (biome.name === 'snow') {
                    const pineList = ['Pine_1.gltf', 'Pine_2.gltf', 'Pine_3.gltf', 'Pine_4.gltf', 'Pine_5.gltf'];
                    assetPath = AssetsLibrary.encode('Nature/glTF/' + pineList[Math.floor(rng() * pineList.length)]);
                    plantScale = 6 + rng() * 8;
                } else if (biome.name === 'swamp') {
                    const twistedList = ['TwistedTree_1.gltf', 'TwistedTree_2.gltf', 'TwistedTree_3.gltf', 'TwistedTree_4.gltf', 'TwistedTree_5.gltf'];
                    assetPath = AssetsLibrary.encode('Nature/glTF/' + twistedList[Math.floor(rng() * twistedList.length)]);
                    plantScale = 7 + rng() * 7;
                } else {
                    // Forest / Plains / Mountains
                    const isBirch = rng() > 0.6;
                    const list = isBirch ? 
                        ['BirchTree_1.gltf', 'BirchTree_2.gltf', 'BirchTree_3.gltf', 'BirchTree_4.gltf', 'BirchTree_5.gltf'] :
                        ['MapleTree_1.gltf', 'MapleTree_2.gltf', 'MapleTree_3.gltf', 'MapleTree_4.gltf', 'MapleTree_5.gltf'];
                    
                    assetPath = AssetsLibrary.encode('baeume/glTF/' + list[Math.floor(rng() * list.length)]);
                    plantScale = 8 + rng() * 10;
                }
                
                if (assetPath) {
                    const finalPath = assetPath.startsWith('animation/') ? assetPath : 'animation/' + assetPath;
                    loadModel(finalPath).then(model => {
                        if (!model) return;
                        // Asset-Anchor: Exakt auf den Boden setzen
                        model.position.set(tx, th, tz); 
                        model.scale.set(plantScale, plantScale, plantScale);
                        model.rotation.y = rng() * Math.PI * 2;
                        
                        model.traverse(child => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                                applyWorldCulling(child.material); // Glocken-Prinzip
                            }
                        });
                        group.add(model);
                    }).catch(e => console.warn("[FPGraphics] Fehler beim Laden von Baum:", finalPath, e));
                }
            }
        }

        // 2. Clutter (Instanced) - Biome-abhängig
        const clutterCount = 150 + Math.floor(rng() * 200);
        const instancedData = new Map(); // assetPath -> Array of {pos, scale, rot}
        
        for (let i = 0; i < clutterCount; i++) {
            const sx = x0 + rng() * DECORATION_CELL_SIZE;
            const sz = z0 + rng() * DECORATION_CELL_SIZE;
            const gpuH = getGPUHeight(sx, sz);
            
            if (gpuH > 2.2 || (biome.name === 'swamp' && gpuH > -1.5)) {
                let assetPath = null;
                let scale = 1.0;

                // Präzises Raycasting für Clutter (Steine/Gras)
                const sh = getRaycastHeight(sx, sz, gpuH);

                // Zufällige Auswahl basierend auf Biome
                const r = rng();
                if (r > 0.9) { // Steine
                    const rockList = AssetsLibrary.get('NATURE', 'ROCKS');
                    if (Array.isArray(rockList) && rockList.length > 0) {
                        const rock = rockList[Math.floor(rng() * rockList.length)];
                        assetPath = AssetsLibrary.encode('Nature/glTF/' + rock);
                        scale = 0.5 + rng() * 3.0;
                    }
                } else if (r > 0.15) { // Gras / Blumen / Farne
                    let list = [];
                    if (biome.name === 'jungle') list = AssetsLibrary.get('NATURE', 'FERNS') || [];
                    else if (biome.name === 'desert') list = AssetsLibrary.get('NATURE', 'GRASS_DRY') || [];
                    else if (biome.name === 'snow') list = []; // Wenig Gras im Schnee
                    else list = AssetsLibrary.get('NATURE', 'GRASS') || [];

                    if (Array.isArray(list) && list.length > 0) {
                        const grass = list[Math.floor(rng() * list.length)];
                        assetPath = AssetsLibrary.encode('Nature/glTF/' + grass);
                        scale = 1.0 + rng() * 2.0;
                    }
                }

                if (assetPath) {
                    // Sicherstellen, dass der Pfad mit animation/ beginnt
                    const finalPath = assetPath.startsWith('animation/') ? assetPath : 'animation/' + assetPath;
                    if (!instancedData.has(finalPath)) instancedData.set(finalPath, []);
                    
                    // OFFSET FIX: Leicht in den Boden stecken (-0.05), nicht anheben!
                    instancedData.get(finalPath).push({
                        pos: [sx, sh - 0.05, sz],
                        scale: scale,
                        rot: rng() * Math.PI * 2
                    });
                }
            }
        }

        // Instanzen erstellen und hinzufügen
        for (const [path, instances] of instancedData.entries()) {
            getModelInstanceData(path).then(data => {
                if (!data) return;
                
                const instancedMesh = new THREE.InstancedMesh(data.geo, data.mat, instances.length);
                instancedMesh.layers.enable(0);
                instancedMesh.layers.enable(3); // Grass-Layer (für Clutter-Gras)
                const matrix = new THREE.Matrix4();
                const position = new THREE.Vector3();
                const rotation = new THREE.Euler();
                const quaternion = new THREE.Quaternion();
                const scaleVec = new THREE.Vector3();

                for (let i = 0; i < instances.length; i++) {
                    const inst = instances[i];
                    position.set(inst.pos[0], inst.pos[1], inst.pos[2]);
                    rotation.set(0, inst.rot, 0);
                    quaternion.setFromEuler(rotation);
                    scaleVec.set(inst.scale, inst.scale, inst.scale);
                    
                    matrix.compose(position, quaternion, scaleVec);
                    instancedMesh.setMatrixAt(i, matrix);
                }
                
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;
                group.add(instancedMesh);
            }).catch(e => {});
        }
    }


    async function initWorld(scene, env, enterHouseCallback, renderer) {
        console.log("[FPGraphics] Initialisiere Welt...");
        if (!env) {
            console.warn("[FPGraphics] Keine Umgebung (env) übergeben! Breche ab.");
            return;
        }

        try {
            // GPGPU Initialisierung
            if (renderer) {
                console.log("[FPGraphics] Starte GPGPU und Clipmap...");
                initGPGPU(renderer);
                initClipmap(scene);
                // Erste Berechnung erzwingen
                updateClipmap(0, 0, renderer);
                console.log("[FPGraphics] GPGPU und Clipmap bereit.");
            } else {
                console.error("[FPGraphics] Kein Renderer übergeben!");
            }
        } catch (e) {
            console.error("[FPGraphics] Fehler bei initWorld (GPGPU/Clipmap):", e);
        }

        console.log("[FPGraphics] Biome gefunden:", Object.keys(env.biomes));

        // Große Basis-Ebene für den Hintergrund ENTFERNT (User-Wunsch: Nur Mesh als Boden)
        // scene.add(basePlane);

        // // initMountains(scene); // Deaktiviert für nackte Map-Struktur Test // Entfernt, da Berge jetzt Teil des Terrains sind
        // // initRiver(scene); // Deaktiviert für nackte Map-Struktur Test
        // await// initForestDetails(scene); // Jetzt in Chunks

        // --- TEST-MARKTPLATZ ENTFERNT ---
        // (Wurde für nackte Map-Struktur Test deaktiviert)
        
        // --- ERZWINGE TAGESLICHT FÜR ANALYSE ---
        // (Deaktiviert, da EnvironmentManager dies nun zentral steuert)
        /*
        if (window.EnvironmentManager) {
            console.log("[FPGraphics] Setze Zeit auf Mittag für Analyse...");
            EnvironmentManager.currentTime = 0.5;
            if (window.EventHub) {
                EventHub.emit('env:time:update', { time: 0.5 });
            }
        }
        */
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

    function initRiver(scene) {
        const riverGroup = new THREE.Group();
        const riverGeo = new THREE.PlaneGeometry(120, 4000, 10, 40);
        const riverMat = new THREE.MeshStandardMaterial({ 
            color: PALETTE.water, 
            flatShading: true,
            transparent: true, 
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.5
        });
        
        // Hinweis: waterGeo und waterMat scheinen hier Platzhalter zu sein, 
        // eigentlich sollten riverGeo und riverMat genutzt werden.
        // Wir korrigieren das im Sinne der Konsistenz.
        const river = new THREE.Mesh(riverGeo, riverMat);
        river.rotation.x = -Math.PI / 2;
        river.position.y = 2.0; // Wasserhöhe
        scene.add(river);
    }

    // --- DEKORATIONSSYSTEM (Bäume, Felsen, Gras) ---
    const decorationGrids = new Map(); // Map<string, Group>
    const grassGrids = new Map();       // Map<string, Group>
    let lastUpdatePos = new THREE.Vector2(Infinity, Infinity);

    function updateDecorations(playerPos) {
        if (!mainScene) return;
        
        // Optimierung: Nur updaten wenn Spieler sich mehr als 10m bewegt hat
        if (lastUpdatePos.distanceTo(new THREE.Vector2(playerPos.x, playerPos.z)) < 10) return;
        lastUpdatePos.set(playerPos.x, playerPos.z);
        
        const cellX = Math.floor(playerPos.x / DECORATION_CELL_SIZE);
        const cellZ = Math.floor(playerPos.z / DECORATION_CELL_SIZE);
        
        // 1. Dekorationen (Bäume/Felsen)
        for (let x = cellX - DECORATION_RANGE; x <= cellX + DECORATION_RANGE; x++) {
            for (let z = cellZ - DECORATION_RANGE; z <= cellZ + DECORATION_RANGE; z++) {
                const key = `${x}_${z}`;
                if (!decorationGrids.has(key)) {
                    const group = createDecorationCell(x, z, playerPos);
                    decorationGrids.set(key, group);
                    mainScene.add(group);
                }
            }
        }
        
        // Cleanup ferner Zellen
        decorationGrids.forEach((group, key) => {
            const [x, z] = key.split('_').map(Number);
            if (Math.abs(x - cellX) > DECORATION_RANGE + 1 || Math.abs(z - cellZ) > DECORATION_RANGE + 1) {
                mainScene.remove(group);
                disposeGroup(group);
                decorationGrids.delete(key);
            }
        });

        // 2. Hybrides Gras-System (3D/2D)
        const gCellX = Math.floor(playerPos.x / GRASS_CELL_SIZE);
        const gCellZ = Math.floor(playerPos.z / GRASS_CELL_SIZE);

        for (let x = gCellX - GRASS_RANGE; x <= gCellX + GRASS_RANGE; x++) {
            for (let z = gCellZ - GRASS_RANGE; z <= gCellZ + GRASS_RANGE; z++) {
                const key = `${x}_${z}`;
                if (!grassGrids.has(key)) {
                    const group = createGrassCell(x, z, playerPos);
                    grassGrids.set(key, group);
                    mainScene.add(group);
                }
            }
        }

        grassGrids.forEach((group, key) => {
            const [x, z] = key.split('_').map(Number);
            if (Math.abs(x - gCellX) > GRASS_RANGE + 1 || Math.abs(z - gCellZ) > GRASS_RANGE + 1) {
                mainScene.remove(group);
                disposeGroup(group);
                grassGrids.delete(key);
            }
        });
    }

    function createDecorationCell(cx, cz, playerPos) {
        const group = new THREE.Group();
        const seed = cx * 1337 + cz * 42;
        const rng = rndSeed(seed);
        
        // Bestimme Biome für diese Zelle
        const midX = (cx + 0.5) * DECORATION_CELL_SIZE;
        const midZ = (cz + 0.5) * DECORATION_CELL_SIZE;
        const midH = getGPUHeight(midX, midZ);
        const biome = getBiomeData(midX, midZ, midH);

        // Biome-abhängige Dichte (Dichte-Regelung für Performance)
        let densityMult = 0.5; // Reduziert wegen kleinerer Zellen
        let treeCount = 0;
        
        // KRITISCH: Fallback für unbekannte Biome oder Startbereich (Plains)
        if (!biome || !biome.name || biome.name === 'none') {
            treeCount = (4 + Math.floor(rng() * 4)) * densityMult;
        } else if (biome.name === 'jungle') treeCount = (10 + Math.floor(rng() * 8)) * densityMult;
        else if (biome.name === 'plains') treeCount = (6 + Math.floor(rng() * 6)) * densityMult;
        else if (biome.name === 'swamp') treeCount = (8 + Math.floor(rng() * 6)) * densityMult;
        else if (biome.name === 'snow') treeCount = (3 + Math.floor(rng() * 3)) * densityMult;
        else if (biome.name === 'desert') treeCount = (1 + Math.floor(rng() * 2)) * densityMult;
        else if (biome.name === 'forest') treeCount = (12 + Math.floor(rng() * 10)) * densityMult;
        else treeCount = (4 + Math.floor(rng() * 4)) * densityMult;

        for (let i = 0; i < treeCount; i++) {
            const x = (cx + rng()) * DECORATION_CELL_SIZE;
            const z = (cz + rng()) * DECORATION_CELL_SIZE;

            // Performance: Pre-Culling für Bäume (nur innerhalb des Sichtradius)
            const dist = Math.hypot(x - playerPos.x, z - playerPos.z);
            if (dist > CLIPMAP_RADIUS + 50) continue;
            
            // WICHTIG: RaycastHeight für präzise Platzierung auf dem Clipmap-Terrain
            const gpuH = getGPUHeight(x, z);
            
            // Debug-Log für Wasserlevel-Check
            if (i === 0) console.log(`[FPGraphics] Spawning Check: x=${x.toFixed(1)}, z=${z.toFixed(1)}, gpuH=${gpuH.toFixed(2)}, biome=${biome ? biome.name : 'null'}`);

            // Nur spawnen wenn über Wasserlevel (außer Swamp)
            const waterLevel = 2.0; 
            if (gpuH < waterLevel - 0.5 && (!biome || biome.name !== 'swamp')) continue;
            if (biome && biome.name === 'swamp' && gpuH < -3.0) continue;

            const th = getRaycastHeight(x, z, gpuH);
            
            // Validierung der Raycast-Höhe
            if (th < -15.0 || th > 2000.0) {
                console.warn("[FPGraphics] Ungültige Raycast-Höhe für Baum:", th, "bei", x, z);
                continue;
            }
            
            let assetPath = null;
            let plantScale = 1.0;

            // Biome-Logik für Baum-Assets
            const bName = biome ? biome.name : 'plains';
            if (bName === 'jungle') {
                assetPath = AssetsLibrary.encode('Nature/glTF/PalmTree_1.gltf');
                plantScale = 8 + rng() * 10;
            } else if (bName === 'desert') {
                if (rng() > 0.4) {
                    assetPath = AssetsLibrary.encode('Nature/glTF/Cactus_1.gltf');
                    plantScale = 5 + rng() * 6;
                }
            } else if (bName === 'snow') {
                const pineList = ['Pine_1.gltf', 'Pine_2.gltf', 'Pine_3.gltf', 'Pine_4.gltf', 'Pine_5.gltf'];
                assetPath = AssetsLibrary.encode('Nature/glTF/' + pineList[Math.floor(rng() * pineList.length)]);
                plantScale = 6 + rng() * 8;
            } else if (bName === 'swamp') {
                const twistedList = ['TwistedTree_1.gltf', 'TwistedTree_2.gltf', 'TwistedTree_3.gltf', 'TwistedTree_4.gltf', 'TwistedTree_5.gltf'];
                assetPath = AssetsLibrary.encode('Nature/glTF/' + twistedList[Math.floor(rng() * twistedList.length)]);
                plantScale = 7 + rng() * 7;
            } else {
                // Forest / Plains / Mountains
                const isBirch = rng() > 0.6;
                const list = isBirch ? 
                    ['BirchTree_1.gltf', 'BirchTree_2.gltf', 'BirchTree_3.gltf', 'BirchTree_4.gltf', 'BirchTree_5.gltf'] :
                    ['MapleTree_1.gltf', 'MapleTree_2.gltf', 'MapleTree_3.gltf', 'MapleTree_4.gltf', 'MapleTree_5.gltf'];
                
                assetPath = AssetsLibrary.encode('baeume/glTF/' + list[Math.floor(rng() * list.length)]);
                plantScale = 8 + rng() * 10;
            }

            if (assetPath) {
                // Asset-Pfad Validierung und Korrektur (Sicherstellen, dass BASE_URL nicht doppelt ist)
                const finalPath = assetPath; 
                console.log("[FPGraphics] Lade Baum-Asset:", finalPath, "für Biome:", biome.name);

                loadModel(finalPath).then(model => {
                    if (!model) {
                        console.warn("[FPGraphics] Modell konnte nicht geladen werden:", finalPath);
                        return;
                    }
                    // Asset-Anchor: Exakt auf den Boden setzen mit minimalem Offset gegen Z-Fighting
                    model.position.set(x, th - 0.02, z); 
                    model.scale.set(plantScale, plantScale, plantScale);
                    model.rotation.y = rng() * Math.PI * 2;
                    
                    model.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            applyWorldCulling(child.material); // Glocken-Prinzip
                        }
                    });
                    group.add(model);
                }).catch(e => console.error("[FPGraphics] Schwerwiegender Fehler beim Laden von Baum:", finalPath, e));
            }
        }
        return group;
    }

    function createGrassCell(cx, cz, playerPos) {
        const group = new THREE.Group();
        const seed = cx * 999 + cz * 123;
        const rng = rndSeed(seed);
        
        // 1. 3D GRAS (Nahbereich)
        const count3D = 60; // Erhöht für bessere Dichte bei größeren Zellen
        const grassGeo = new THREE.PlaneGeometry(1, 1);
        grassGeo.translate(0, 0.5, 0); // Ursprung an die Basis setzen
        const grassMat3D = new THREE.MeshBasicMaterial({ color: 0x44aa44, side: THREE.DoubleSide, alphaTest: 0.5 });
        applyGrassShader(grassMat3D, true);
        
        const mesh3D = new THREE.InstancedMesh(grassGeo, grassMat3D, count3D);
        mesh3D.layers.enable(0);
        mesh3D.layers.enable(3); // Grass-Layer
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < count3D; i++) {
            const x = (cx + rng()) * GRASS_CELL_SIZE;
            const z = (cz + rng()) * GRASS_CELL_SIZE;
            
            // Nur 3D Gras in unmittelbarer Nähe des Spielers spawnen (Performance)
            // Dies ist ein pre-check, der Shader macht das finale Culling
            const dist = Math.hypot(x - playerPos.x, z - playerPos.z);
            if (dist > GRASS_LOD_DIST * 2.0) continue; 

            const gpuH = getGPUHeight(x, z);
            const h = getRaycastHeight(x, z, gpuH);
            // if (h < 5.0 || h > 200.0) continue; // Entfernt für Debugging: Alles spawnen
            
            // OFFSET FIX: Exakt auf den Boden setzen (0.0)
            dummy.position.set(x, h, z);
            dummy.rotation.y = rng() * Math.PI;
            dummy.scale.set(2, 2, 2);
            dummy.updateMatrix();
            mesh3D.setMatrix(i, dummy.matrix);
        }
        group.add(mesh3D);
        
        // 2. 2D GRAS (Fernbereich - Xenoblade Style Cross-Planes)
        const count2D = 40; 
        const grassTex2D = new THREE.TextureLoader().load(GRASS_PNG_PATH);
        const grassMat2D = new THREE.MeshBasicMaterial({ 
            map: grassTex2D, 
            transparent: true, 
            alphaTest: 0.1, // Deutlich niedriger für bessere Sichtbarkeit
            side: THREE.DoubleSide,
            color: 0x88ff88 // Leichtes Aufhellen
        });
        applyGrassShader(grassMat2D, false);
        
        // Xenoblade-Logik: Erstelle gekreuzte Planes für 2D Gras
        const plane1 = new THREE.PlaneGeometry(3, 3);
        plane1.translate(0, 1.5, 0); 
        const plane2 = plane1.clone();
        plane2.rotateY(Math.PI / 2);
        
        // Geometrien zusammenführen
        const billboardGeo = plane1;
        billboardGeo.merge(plane2);

        const mesh2D = new THREE.InstancedMesh(billboardGeo, grassMat2D, count2D);
        mesh2D.layers.enable(0);
        mesh2D.layers.enable(3);
        for (let i = 0; i < count2D; i++) {
            const x = (cx + rng()) * GRASS_CELL_SIZE;
            const z = (cz + rng()) * GRASS_CELL_SIZE;
            
            // LOD-Abgleich: 2D Gras startet dort, wo 3D aufhört
            const dist = Math.hypot(x - playerPos.x, z - playerPos.z);
            if (dist < GRASS_LOD_DIST * 0.5) continue; 

            const gpuH = getGPUHeight(x, z);
            const h = getRaycastHeight(x, z, gpuH);
            if (h < 5.0 || h > 200.0) continue;
            
            // OFFSET FIX: Exakt auf den Boden setzen (0.0)
            dummy.position.set(x, h, z);
            dummy.rotation.y = rng() * Math.PI;
            dummy.scale.set(1.0 + rng(), 1.0 + rng(), 1.0 + rng());
            dummy.updateMatrix();
            mesh2D.setMatrix(i, dummy.matrix);
        }
        group.add(mesh2D);
        
        return group;
    }

    // --- PRIMITIVE ASSET CREATION (REDUNDANT - ENTFERNT) ---
    /*
    function createPine(rng) { ... }
    function createOak(rng) { ... }
    */

    /**
     * Erstellt einfache prozedurale Wolken.
     */
    function createClouds(scene) {
        const cloudGroup = new THREE.Group();
        const cloudCount = 20;
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8,
            flatShading: true
        });

        for (let i = 0; i < cloudCount; i++) {
            const cluster = new THREE.Group();
            const partCount = 3 + Math.floor(Math.random() * 4);
            
            for (let j = 0; j < partCount; j++) {
                const size = 10 + Math.random() * 20;
                const geo = new THREE.IcosahedronGeometry(size, 1);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(
                    (Math.random() - 0.5) * size * 1.5,
                    (Math.random() - 0.5) * size * 0.5,
                    (Math.random() - 0.5) * size * 1.5
                );
                cluster.add(mesh);
            }
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 500 + Math.random() * 1000;
            cluster.position.set(
                Math.cos(angle) * dist,
                150 + Math.random() * 100,
                Math.sin(angle) * dist
            );
            cloudGroup.add(cluster);
        }
        scene.add(cloudGroup);
    }

    /**
     * Dummy-Funktion für Innenräume (Interiors).
     */
    function initInteriors(scene) {
        console.log("[FPGraphics] initInteriors (Placeholder)");
    }

    /**
     * Dummy-Funktion für Regen (Rain).
     */
    function initRain(scene) {
        console.log("[FPGraphics] initRain (Placeholder)");
    }

    function disposeGroup(group) {
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }

    // --- MODULAR HOUSE SYSTEM ---

    async function createModularHouse(type = 'small', seedX = 0, seedZ = 0) {
        const group = new THREE.Group();
        group.userData.seedX = seedX;
        group.userData.seedZ = seedZ;
        
        // Spezialfall: Neues House_1.glb Modell
        if (type === 'house1' || (type === 'calibration' && calibrationParams.houseModel === 'house1')) {
            try {
                const model = await loadModel(AssetsLibrary.get('HOUSE', 'HOUSE_1'));
                
                let s = 10;
                if (type === 'calibration') {
                    s = calibrationParams.overallScale;
                    group.position.x += calibrationParams.offsetX;
                    group.position.y += calibrationParams.offsetY;
                    group.position.z += calibrationParams.offsetZ;
                } else {
                    // Deterministische Variation für normale Häuser
                    const houseRng = () => {
                        const s = Math.sin(seedX * 12.9898 + seedZ * 78.233) * 43758.5453;
                        return s - Math.floor(s);
                    };
                    const rand = houseRng();
                    s = 8 + rand * 4; // Skalierung 8-12
                    group.rotation.y = Math.floor(rand * 4) * (Math.PI / 2); // 0, 90, 180, 270 Grad
                }
                
                model.scale.set(s, s, s);
                group.add(model);
                
                group.position.set(seedX, getGPUHeight(seedX, seedZ), seedZ);
                fpVillageBuildings.push(group);
                return group;
            } catch (e) {
                console.warn("Konnte House_1.glb nicht laden, wechsle zu modular:", e);
                // Fallback zu modular
            }
        }

        // Grundwerte initialisieren
        let currentScale = 6.0;
        let targetWidth, targetDepth, wallScaleW, wallScaleD;
        let roofScaleY = 1.3, gableScaleY = 1.3;
        let wallY = 0, roofY = 4;

        if (type === 'calibration') {
            currentScale = calibrationParams.overallScale;
            targetWidth = calibrationParams.targetWidth;
            targetDepth = calibrationParams.targetDepth;
            wallScaleW = calibrationParams.wallScaleW;
            wallScaleD = calibrationParams.wallScaleD;
            roofScaleY = calibrationParams.roofScaleY;
            gableScaleY = calibrationParams.gableScaleY;
            wallY = calibrationParams.wallY;
            roofY = calibrationParams.roofY;
        } else {
            // Normales modulares Haus
            targetWidth = 6.5;
            targetDepth = 6.5;
            wallScaleW = 1.625;
            wallScaleD = 1.625;
        }

        const houseBase = new THREE.Mesh(
            new THREE.BoxGeometry(targetWidth * currentScale, 8, targetDepth * currentScale),
            new THREE.MeshStandardMaterial({ color: PALETTE.walls })
        );
        houseBase.position.y = 4 + wallY;
        group.add(houseBase);
        
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(targetWidth * currentScale * 0.8, 10 * roofScaleY, 4),
            new THREE.MeshStandardMaterial({ color: PALETTE.roof })
        );
        roof.position.y = 10 + roofY;
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        
        group.position.set(seedX, getGPUHeight(seedX, seedZ), seedZ);
        applyWorldCulling(houseBase.material);
        applyWorldCulling(roof.material);
        
        fpVillageBuildings.push(group);
        return group;
    }

    /**
     * Erstellt ein Namensschild als Sprite mit Canvas-Textur.
     */
    function createNameTag(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.font = 'bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(12, 3, 1);
        
        return sprite;
    }

    /**
     * Platzhalter für Regen-Update.
     */
    function updateRain(delta, now) {
        // console.log("[FPGraphics] updateRain (Placeholder)");
    }

    /**
     * Platzhalter für Fluss-Update.
     */
    function updateRiver() {
        // console.log("[FPGraphics] updateRiver (Placeholder)");
    }

    /**
     * Platzhalter für Feuer-Update.
     */
    function updateFire(delta, now) {
        // console.log("[FPGraphics] updateFire (Placeholder)");
    }

    /**
     * Platzhalter für Haus-Eintritt.
     */
    function enterHouse(type, targetPos, avatar, scene, camera, callback) {
        console.log("[FPGraphics] enterHouse (Placeholder)", type);
        if (callback) callback(true);
    }

    /**
     * Platzhalter für Overlay-Button.
     */
    function addOverlayCloseButton(overlay) {
        console.log("[FPGraphics] addOverlayCloseButton (Placeholder)");
    }

    // --- PUBLIC API ---
    window.FPGraphics = {
        isInterior: false,
        currentInterior: null,
        currentInteriorMesh: null,
        init: (renderer, scene) => {
            syncWorldSeedFromFirebase(); // Firebase-Synchronisation starten
            initGPGPU(renderer);
            initClipmap(scene);
            initWater(scene);
            
            // Initialer Render-Pass für die Heightmap
            gpuCompute.compute();
            // WICHTIG: Von smoothVariable lesen, da dies die finalen geglätteten Werte sind
            renderer.readRenderTargetPixels(gpuCompute.getCurrentRenderTarget(smoothVariable), 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, GPGPU_Container.heightData);
            GPGPU_Container.heightTexture = gpuCompute.getCurrentRenderTarget(smoothVariable).texture;
        },
        update: (renderer, playerPos, time) => {
            if (!gpuCompute) return;
            
            // 1. Clipmap Update (JETZT ZUERST)
            updateClipmap(playerPos.x, playerPos.z, renderer);

            // 2. Gebäude-Höhen im Nahbereich validieren (Asset-Anchoring)
            fpVillageBuildings.forEach(b => {
                const dist = Math.hypot(b.position.x - playerPos.x, b.position.z - playerPos.z);
                if (dist < 100) { 
                    const h = getRaycastHeight(b.userData.seedX || b.position.x, b.userData.seedZ || b.position.z, b.position.y);
                    b.position.y = h;
                    b.updateMatrixWorld();
                }
            });
            
            // 3. Wasser Update
            if (globalWater) {
                globalWater.position.x = playerPos.x;
                globalWater.position.z = playerPos.z;
            }

            // 4. Dekorationen
            updateDecorations(playerPos);
            
            // 5. Uniforms für Global Culling
            worldCullingUniforms.playerPos.value.set(playerPos.x, playerPos.z);
            worldCullingUniforms.time.value = time;
        },
        updateClipmap,
        updateRain,
        applyGrassShader,
        updateRiver,
        updateFire,
        enterHouse,
        addOverlayCloseButton,
        createNameTag,
        getGPUHeight,
        getRaycastHeight,
        createModularHouse,
        createClouds,
        initInteriors,
        initRain,
        initWorld,
        initHauptdorfMeadow,
        villageBuildings: fpVillageBuildings,
        CLIPMAP_RADIUS,
        cleanup: () => {
            decorationGrids.forEach(disposeGroup);
            grassGrids.forEach(disposeGroup);
            decorationGrids.clear();
            grassGrids.clear();
            if (clipmapMesh) {
                clipmapMesh.geometry.dispose();
                clipmapMaterial.dispose();
            }
        }
    };
})();