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
    const GRASS_LOD_DIST = 15;  // Grenze zwischen 3D und 2D Gras
    const GRASS_MAX_DIST = 4000; // Maximale Sichtweite für 2D Gras (Synchronisiert mit Clipmap)
    const GRASS_PNG_PATH = 'https://raw.githubusercontent.com/noverato/System/main/animation/baeume/Grass_large.png';
    const CLIPMAP_SEGMENTS = 128; // Reduziert für Stabilität
    
    const DECORATION_CELL_SIZE = 512; // Größere Zellen für 4km Radius Performance
    const DECORATION_RANGE = 8;       // Erhöhter Range (8 * 512 = 4096m)
    const GRASS_CELL_SIZE = 128;      // Größere Zellen für Gras-Chunks
    const GRASS_RANGE = 32;           // Erhöhter Range (32 * 128 = 4096m)

    // Globale Uniforms für das Culling-System (Bubble-Prinzip / Glocke)
    const worldCullingUniforms = {
        playerPos: { value: new THREE.Vector2(0, 0) },
        clipRadius: { value: CLIPMAP_RADIUS },
        time: { value: 0 }
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
    const GPU_TERRAIN_SIZE = 512; 
    const GPU_WORLD_SIZE = 10000; // Erhöht auf 10km x 10km (100km²) für die 86km² Anforderung
    
    // Zentraler GPGPU-Daten-Container (Kommunikations-Layer)
    const GPGPU_Container = {
        heightTexture: null,
        heightData: new Float32Array(GPU_TERRAIN_SIZE * GPU_TERRAIN_SIZE * 4),
        lastUpdate: 0,
        updateThreshold: 100, // Update alle 100ms für CPU-Daten
        
        getHeight: function(x, z) {
            // Weltkoordinaten in Texture-UV umrechnen
            const u = (x + GPU_WORLD_SIZE / 2) / GPU_WORLD_SIZE;
            const v = (z + GPU_WORLD_SIZE / 2) / GPU_WORLD_SIZE;
            
            if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
            
            const tx = Math.floor(u * (GPU_TERRAIN_SIZE - 1));
            const ty = Math.floor(v * (GPU_TERRAIN_SIZE - 1));
            const idx = (ty * GPU_TERRAIN_SIZE + tx) * 4;
            
            return this.heightData[idx];
        },
        
        // Bilineare Filterung für glatte Übergänge (Hügel-Validierung)
        getSmoothHeight: function(x, z) {
            const u = (x + GPU_WORLD_SIZE / 2) / GPU_WORLD_SIZE * (GPU_TERRAIN_SIZE - 1);
            const v = (z + GPU_WORLD_SIZE / 2) / GPU_WORLD_SIZE * (GPU_TERRAIN_SIZE - 1);
            
            const x0 = Math.floor(u);
            const x1 = Math.min(x0 + 1, GPU_TERRAIN_SIZE - 1);
            const y0 = Math.floor(v);
            const y1 = Math.min(y0 + 1, GPU_TERRAIN_SIZE - 1);
            
            const fX = u - x0;
            const fY = v - y0;
            
            const h00 = this.heightData[(y0 * GPU_TERRAIN_SIZE + x0) * 4];
            const h10 = this.heightData[(y0 * GPU_TERRAIN_SIZE + x1) * 4];
            const h01 = this.heightData[(y1 * GPU_TERRAIN_SIZE + x0) * 4];
            const h11 = this.heightData[(y1 * GPU_TERRAIN_SIZE + x1) * 4];
            
            const h0 = h00 * (1 - fX) + h10 * fX;
            const h1 = h01 * (1 - fX) + h11 * fX;
            
            return h0 * (1 - fY) + h1 * fY;
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
        
        // Simplex 2D noise
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v) {
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
            for (int i = 0; i < 6; ++i) {
                v += a * snoise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 pos = uv * worldSize + offset;
            
            // --- TERRAIN GENERATION 10000x10000 (100km²) ---
            
            // 1. Großräumige Kontinente/Ozeane (0 = Ozean, 1 = Land)
            float continent = snoise(pos * 0.00005) * 0.5 + 0.5;
            continent = smoothstep(0.3, 0.5, continent); // Schärfere Küstenlinien
            
            // 2. Basis-Höhe (FBM für Hügelketten)
            // Landmasse startet bei y=5.0 (über Wasser y=2.0)
            float h = 5.0 + fbm(pos * 0.0003) * 80.0;
            
            // Ozean-Absenkung
            h = mix(-80.0, h, continent);
            
            // 3. Biome-Parameter (Unabhängig von Kontinenten)
            float scale = 0.00012;
            float temp = snoise(pos * scale) * 0.5 + 0.5;
            float humidity = snoise(pos * scale + vec2(200.0, 300.0)) * 0.5 + 0.5;
            
            // 4. BERGE (Dramatischere Gipfel, nur auf Land)
            float mountNoise = pow(abs(snoise(pos * 0.0005)), 2.5);
            float h_mount = fbm(pos * 0.001) * 850.0;
            h += h_mount * smoothstep(0.2, 0.5, mountNoise) * continent;
            
            // 5. TÄLER & SCHLUCHTEN (Erosion-Look)
            // Wir erzeugen Täler, die bis unter den Meeresspiegel (y=2.0) reichen können
            float valleyNoise = snoise(pos * 0.0008 + vec2(1000.0));
            if (valleyNoise > 0.6) {
                float vFactor = smoothstep(0.6, 0.9, valleyNoise);
                h -= vFactor * 400.0;
                
                // Zusätzliche Flussbetten in den Tälern
                float riverBed = abs(snoise(pos * 0.0025 + vec2(500.0)));
                if (riverBed < 0.12) {
                    h -= (1.0 - smoothstep(0.0, 0.12, riverBed)) * 60.0;
                }
            }

            // 6. OZEAN / WASSER GLÄTTUNG
            float waterLevel = 2.0;
            if (h < waterLevel) {
                // Sanfter Übergang in die Tiefe für Seen und Ozeane
                float depthFactor = smoothstep(waterLevel, waterLevel - 20.0, h);
                h = mix(h, -100.0, depthFactor);
            }
            
            // 7. STARTPUNKT & DÖRFER (Ebene Flächen, immer über Wasser)
            float distToStart = length(pos);
            if (distToStart < 1500.0) {
                float startFactor = smoothstep(600.0, 1500.0, distToStart);
                h = mix(15.0, h, startFactor); 
            }

            // Dorf-Positionen (Grob-Check im Shader)
            vec2 v1 = vec2(1200.0, 0.0);
            vec2 v2 = vec2(-1200.0, 0.0);
            vec2 v3 = vec2(0.0, 1200.0);
            vec2 v4 = vec2(0.0, -1200.0);
            
            float d1 = length(pos - v1);
            float d2 = length(pos - v2);
            float d3 = length(pos - v3);
            float d4 = length(pos - v4);
            
            float minDist = min(min(d1, d2), min(d3, d4));
            if (minDist < 400.0) {
                float f = smoothstep(150.0, 400.0, minDist);
                h = mix(10.0, h, f);
            }
            
            // Schutz vor Extremen
            h = clamp(h, -250.0, 1500.0);

            gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
        }
    `;

    const SMOOTH_SHADER = `
        void main() {
            vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
            vec2 texelSize = 1.0 / max(resolution.xy, vec2(1.0));
            
            float h = 0.0;
            float weightSum = 0.0;
            
            for(int y = -2; y <= 2; y++) {
                for(int x = -2; x <= 2; x++) {
                    float dist = length(vec2(float(x), float(y)));
                    float weight = exp(-dist * dist * 0.5); // Gauß-Blur
                    
                    h += texture2D(textureHeight, uv + vec2(float(x), float(y)) * texelSize).r * weight;
                    weightSum += weight;
                }
            }
            gl_FragColor = vec4(h / max(weightSum, 0.0001), 0.0, 0.0, 1.0);
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
        }
    }

    function initClipmap(scene) {
        if (!scene) return;
        mainScene = scene;
        
        clipmapGroup = new THREE.Group();
        scene.add(clipmapGroup);

        // Quadratisches Gitter für gleichmäßige Vertex-Verteilung (verhindert Stretching)
        // CLIPMAP_RADIUS * 2 für die Größe, Segmente für Detaildichte
        const geo = new THREE.PlaneGeometry(CLIPMAP_RADIUS * 2, CLIPMAP_RADIUS * 2, 256, 256);
        
        // Wir verwenden einen Standard-Shader und passen ihn an
        clipmapMaterial = new THREE.MeshStandardMaterial({
            vertexColors: false,
            flatShading: false,
            roughness: 0.9,
            metalness: 0.0,
            transparent: false,
            side: THREE.FrontSide,
            depthWrite: true,
            depthTest: true,
            // polygonOffset deaktiviert, um Jitter-Verdacht zu prüfen
            polygonOffset: false
        });

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

        console.log("🎨 Terrain-Texturen geladen:", { grass: grassTex.image?.src, stone: stoneTex.image?.src });

        // Custom Shader Injection für Displacement und Biome-Farben
        clipmapMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.heightMap = { value: null };
            shader.uniforms.grassTex = { value: grassTex };
            shader.uniforms.stoneTex = { value: stoneTex };
            shader.uniforms.desertTex = { value: desertTex };
            shader.uniforms.leavesTex = { value: leavesTex };
            shader.uniforms.flowersTex = { value: flowersTex };
            shader.uniforms.worldOffset = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.meshOffset = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.playerPos = { value: new THREE.Vector2(0, 0) }; // Actual player pos for vDist
            shader.uniforms.gpuWorldSize = { value: GPU_WORLD_SIZE };
            shader.uniforms.clipRadius = { value: CLIPMAP_RADIUS };
            shader.uniforms.aoiRadius = { value: AOI_RADIUS };
            shader.uniforms.plainsColor = { value: new THREE.Color(0x6ba15a) }; // Helleres Gras
            shader.uniforms.desertColor = { value: new THREE.Color(0xf4dcb3) };
            shader.uniforms.snowColor = { value: new THREE.Color(0xffffff) };
            shader.uniforms.jungleColor = { value: new THREE.Color(0x3d6629) };
            shader.uniforms.swampColor = { value: new THREE.Color(0x3e4521) };
            shader.uniforms.stoneColor = { value: new THREE.Color(0x999999) };
            shader.uniforms.pathColor = { value: new THREE.Color(0xb08d6a) };
            shader.uniforms.oceanColor = { value: new THREE.Color(0x1a4a8a) }; // Tiefblau
            shader.uniforms.forestColor = { value: new THREE.Color(0x2d5a27) }; // Waldgrün

            shader.vertexShader = `
                uniform sampler2D heightMap;
                uniform vec2 worldOffset;
                uniform vec2 meshOffset;
                uniform vec2 playerPos;
                uniform float gpuWorldSize;
                uniform float clipRadius;
                uniform float aoiRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;

                // Manuelle bilineare Filterung für den Vertex-Shader
                float getSmoothHeight(vec2 uv) {
                    float texSize = 512.0; // GPU_TERRAIN_SIZE
                    vec2 f = fract(uv * texSize);
                    vec2 t00 = floor(uv * texSize) / texSize;
                    vec2 t10 = (floor(uv * texSize) + vec2(1.0, 0.0)) / texSize;
                    vec2 t01 = (floor(uv * texSize) + vec2(0.0, 1.0)) / texSize;
                    vec2 t11 = (floor(uv * texSize) + vec2(1.0, 1.0)) / texSize;
                    
                    float h00 = texture2D(heightMap, t00).r;
                    float h10 = texture2D(heightMap, t10).r;
                    float h01 = texture2D(heightMap, t01).r;
                    float h11 = texture2D(heightMap, t11).r;
                    
                    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                // UV-Koordinaten für die Heightmap berechnen (Mapping von Welt- auf Textur-Koordinaten)
                // worldOffset ist das Zentrum der GPGPU-Textur
                vec2 worldXZ = (position.xz + meshOffset);
                vec2 hUV = (worldXZ - worldOffset + (gpuWorldSize * 0.5)) / gpuWorldSize;
                
                // Rand-Verhalten (Kacheln verhindern)
                hUV = clamp(hUV, 0.0, 1.0);
                
                float h = getSmoothHeight(hUV);
                vHeight = h;
                
                transformed.y += h;
                vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
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
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;
            ` + shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                
                // Welt-basierte UVs für Kachelung (Streifen-Fix: Höhere Frequenz & Rausch-Mischung)
                vec2 wUV = vWorldPos.xz * 0.125; // Erhöhte Frequenz für feineres Detail
                
                // Texturen mischen
                vec3 texGrass = texture2D(grassTex, wUV).rgb;
                vec3 texStone = texture2D(stoneTex, wUV * 0.43).rgb; // Primzahl-Skalierung gegen Muster
                vec3 texDesert = texture2D(desertTex, wUV * 0.87).rgb;
                
                // Steigungs-Check für Felsen (Normale berechnen)
                vec3 dX = dFdx(vWorldPos);
                vec3 dZ = dFdy(vWorldPos);
                vec3 terrainNormal = normalize(cross(dX, dZ));
                float slope = 1.0 - terrainNormal.y;
                
                // Biome-Logik basierend auf Höhe
                vec3 bioColor = plainsColor;
                
                // Streifen-Fix: Wir nutzen smoothstep für weichere Übergänge und mischen Biome-Farben stärker mit Texturen
                // Wir fügen einen leichten Noise-Offset zur Höhe hinzu, um "Banding" (Streifen) zu brechen
                float heightNoise = (texGrass.r - 0.5) * 2.0; 
                float distortedHeight = vHeight + heightNoise;

                if (distortedHeight < 3.0) bioColor = oceanColor;
                else if (distortedHeight < 12.0) bioColor = mix(oceanColor, plainsColor, smoothstep(3.0, 12.0, distortedHeight));
                else if (distortedHeight > 350.0) bioColor = mix(plainsColor, snowColor, smoothstep(350.0, 600.0, distortedHeight));
                
                // Fels-Splatting bei Steigung
                float rockFactor = smoothstep(0.2, 0.45, slope + heightNoise * 0.05);
                vec3 finalColor = mix(bioColor * texGrass, stoneColor * texStone, rockFactor);
                
                // Sättigung und Helligkeit leicht anpassen für saftiges Grün
                finalColor *= 1.1; 
                
                diffuseColor.rgb = finalColor;
                `
            );
        };

        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.frustumCulled = false; // Wir bewegen das Mesh mit dem Spieler
        clipmapMesh.layers.enable(0); // Standard-Layer
        clipmapMesh.layers.enable(1); // Mesh-Layer
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

        // --- TEXEL-SNAP FÜR DIE TEXTUR (Wellen-Fix) ---
        // Die GPGPU-Textur springt nur in Texel-Schritten, um Fließen zu verhindern.
        const texelSize = GPU_WORLD_SIZE / GPU_TERRAIN_SIZE; 
        const sx = Math.floor(px / texelSize) * texelSize;
        const sz = Math.floor(pz / texelSize) * texelSize;
        
        // --- KEIN SNAP FÜR DAS MESH (Jitter-Fix) ---
        // Das Mesh folgt der Kamera mit voller Präzision.
        // Der Sub-Texel-Versatz wird im Shader durch (wPos - worldOffset) korrigiert.
        clipmapGroup.position.set(px, 0, pz);

        // GPGPU Update (Synchron mit dem Texel-Snap)
        updateGPGPU(sx, sz, renderer);

        // Globale Culling-Uniforms aktualisieren
        worldCullingUniforms.playerPos.value.set(px, pz);

        // Uniforms im Shader aktualisieren
        if (clipmapMaterial.userData.shader) {
            const shader = clipmapMaterial.userData.shader;
            const target = gpuCompute.getCurrentRenderTarget(smoothVariable);
            if (target && target.texture) {
                shader.uniforms.heightMap.value = target.texture;
            }
            
            // worldOffset ist das Zentrum der GPGPU Textur (sx, sz)
            if (shader.uniforms.worldOffset) {
                shader.uniforms.worldOffset.value.set(sx, sz);
            }
            // meshOffset für die manuelle Weltposition im Shader (px, pz)
            if (shader.uniforms.meshOffset) {
                shader.uniforms.meshOffset.value.set(px, pz);
            }
            // playerPos für radiale Effekte
            if (shader.uniforms.playerPos) {
                shader.uniforms.playerPos.value.set(px, pz);
            }
        }

        // Dekorationen aktualisieren
        updateClipmapDecorations(px, pz, mainScene);
    }

    function updateGPGPU(px, pz, renderer) {
        if (!gpuCompute || !heightVariable || !heightVariable.material) return;
        
        // Offset so setzen, dass der Spieler in der Mitte der Textur ist
        const ox = px - GPU_WORLD_SIZE / 2;
        const oz = pz - GPU_WORLD_SIZE / 2;
        
        if (heightVariable.material.uniforms.offset) {
            heightVariable.material.uniforms.offset.value.set(ox, oz);
        }
        gpuCompute.compute();
        
        const renderTarget = gpuCompute.getCurrentRenderTarget(smoothVariable);
        if (renderTarget) {
            renderer.readRenderTargetPixels(renderTarget, 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, gpuHeightData);
        }
    }
    
    function getGPUHeight(x, z, noFallback = false) {
        if (!gpuCompute || !GPGPU_Container.heightData || GPGPU_Container.heightData.length === 0) {
            return noFallback ? null : getCPUHeight(x, z);
        }
        
        const h = GPGPU_Container.getSmoothHeight(x, z);
        
        // h === 0 ist am Anfang oft ein Zeichen für "noch nicht bereit"
        if (h === 0) {
            if (noFallback) return null;
            return getCPUHeight(x, z);
        }
        
        return h;
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
        // --- GPGPU SAMPLING BEVORZUGT ---
        // Wenn GPGPU-Daten vorhanden sind, nutzen wir diese für 100% Übereinstimmung mit dem Mesh
        if (gpuCompute && GPGPU_Container.heightData && GPGPU_Container.heightData.length > 0) {
            const gh = getGPUHeight(x, z, true); // true = noFallback
            if (gh !== null) return gh;
        }
        return getCPUHeight(x, z);
    }

    function getCPUHeight(x, z) {
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
        
        // Zusätzliche Glättung am Startpunkt (0,0) für CPU
        if (distToCenter < 1000.0) {
            const t = Math.max(0, Math.min(1, (distToCenter - 400.0) / (1000.0 - 400.0)));
            villageFactor *= t * t * (3 - 2 * t);
        }

        // 2. Basis-Höhe durch Biome bestimmt
        const biome = getBiomeData(x, z);
        let h = 0;

        // Biome-spezifische Höhenprofile
        const h_plains = getOctaveNoise(x * 0.005, z * 0.005, 3) * 15;
        const h_desert = getOctaveNoise(x * 0.002, z * 0.002, 2) * 8;
        const h_mountains = getOctaveNoise(x * 0.001, z * 0.001, 5) * 350;
        const h_snow = getOctaveNoise(x * 0.003, z * 0.003, 4) * 180;
        const h_jungle = getOctaveNoise(x * 0.008, z * 0.008, 4) * 45;
        const h_swamp = -15 + getOctaveNoise(x * 0.006, z * 0.006, 2) * 12;
        const h_forest = getOctaveNoise(x * 0.005, z * 0.005, 3) * 35;

        // Blending der Höhen basierend auf Biome-Gewichten
        h += h_plains * biome.weights.plains;
        h += h_desert * biome.weights.desert;
        h += h_snow * biome.weights.snow;
        h += h_jungle * biome.weights.jungle;
        h += h_swamp * biome.weights.swamp;
        h += h_forest * biome.weights.forest;
        h += h_mountains * biome.weights.mountains;

        h += 0.0; // Basis-Höhe (auf 0.0 gesetzt)

        // 3. Start point (0,0) override
        if (distToCenter < 1500.0) {
            const t = Math.max(0, Math.min(1, (distToCenter - 500.0) / (1500.0 - 500.0)));
            const startH = 15.0; // Start auf 15m Höhe (synchron mit GPGPU Shader)
            h = h * t + startH * (1 - t);
        }

        // 4. Village factor should only flatten the noise, not force it to 0 height
        // We apply it after the start point override but ensure it doesn't kill the base height
        const baseH = (distToCenter < 1500.0) ? 15.0 : 0.0;
        return baseH + (h - baseH) * villageFactor;
    }

    function getBiomeData(x, z, h) {
        // Diese Logik MUSS mit dem Clipmap-Shader in initClipmap übereinstimmen!
        const scale = 0.0002;
        
        // Einfacher 2D Value-Noise Nachbau für CPU (wie im Shader)
        const noise2D = (nx, nz) => {
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

        // Hauptdorf Check (Radius 1500)
        // Wenn wir uns im Hauptdorf befinden, lassen wir die statische initHauptdorfMeadow das Gras regeln
        const distToCenter = Math.sqrt(midX * midX + midZ * midZ);
        if (distToCenter < 1500) return;

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
                        pos: [sx, sh + 0.5, sz],
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

    function getRaycastHeight(x, z, fallbackHeight) {
        if (!clipmapMesh) return fallbackHeight;
        
        // Strahl von weit oben nach unten schießen
        rayOrigin.set(x, 2000, z); 
        decorationRaycaster.set(rayOrigin, rayDir);
        
        // Matrix-Update erzwingen für präzises Raycasting
        clipmapMesh.updateMatrixWorld();
        
        const intersects = decorationRaycaster.intersectObject(clipmapMesh);
        if (intersects.length > 0) {
            // console.log("[FPGraphics] Raycast Hit at:", intersects[0].point.y, "for X:", x, "Z:", z);
            return intersects[0].point.y;
        }
        
        // Falls kein Hit, GPU Height als Fallback
        return getGPUHeight(x, z) || fallbackHeight;
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
                let plant = null;
                let plantScale = 1.0;

                if (biome.name === 'jungle') {
                    try {
                        const palm = AssetsLibrary.get('NATURE', 'PALM_TREE') || 'PalmTree_1.gltf';
                        assetPath = AssetsLibrary.encode('Nature/glTF/' + palm);
                        plantScale = 8 + rng() * 10;
                    } catch(e) { plant = createPalm(rng); }
                } else if (biome.name === 'desert') {
                    if (rng() > 0.4) {
                        try {
                            const cactus = AssetsLibrary.get('NATURE', 'CACTUS') || 'Cactus_1.gltf';
                            assetPath = AssetsLibrary.encode('Nature/glTF/' + cactus);
                            plantScale = 5 + rng() * 6;
                        } catch(e) { plant = createCactus(rng); }
                    } else {
                        plant = createDesertRock(rng);
                    }
                } else if (biome.name === 'snow') {
                    if (rng() > 0.3) {
                        try {
                            const trees = AssetsLibrary.get('NATURE', 'TREES');
                            const pineList = Array.isArray(trees) ? trees.filter(t => t.includes('Pine')) : [];
                            if (pineList.length > 0) {
                                const pine = pineList[Math.floor(rng() * pineList.length)];
                                assetPath = AssetsLibrary.encode('Nature/glTF/' + pine);
                                plantScale = 6 + rng() * 8;
                            } else {
                                plant = createDetailedTree(tx, tz, th, rng, 0xffffff, 0.8);
                            }
                        } catch(e) { plant = createDetailedTree(tx, tz, th, rng, 0xffffff, 0.8); }
                    } else {
                        plant = createDeadTree(rng);
                    }
                } else if (biome.name === 'swamp') {
                    if (rng() > 0.4) {
                        try {
                            const trees = AssetsLibrary.get('NATURE', 'TREES');
                            const twistedList = Array.isArray(trees) ? trees.filter(t => t.includes('Twisted')) : [];
                            if (twistedList.length > 0) {
                                const tree = twistedList[Math.floor(rng() * twistedList.length)];
                                assetPath = AssetsLibrary.encode('Nature/glTF/' + tree);
                                plantScale = 7 + rng() * 7;
                            } else {
                                plant = createDetailedTree(tx, tz, th, rng, 0x2f351e, 1.2);
                            }
                        } catch(e) { plant = createDetailedTree(tx, tz, th, rng, 0x2f351e, 1.2); }
                    } else {
                        plant = createDeadTree(rng);
                    }
                } else {
                    // Forest / Plains / Mountains
                    try {
                        const isBirch = rng() > 0.6;
                        const treeList = AssetsLibrary.get('TREES', 'LIST');
                        const list = Array.isArray(treeList) ? (isBirch ? 
                            treeList.filter(t => t.includes('Birch')) :
                            treeList.filter(t => t.includes('Maple'))) : [];
                        
                        if (list.length > 0) {
                            const tree = list[Math.floor(rng() * list.length)];
                            assetPath = AssetsLibrary.encode('baeume/glTF/' + tree);
                            plantScale = 8 + rng() * 10;
                        } else {
                            plant = createDetailedTree(tx, tz, th, rng);
                        }
                    } catch(e) { plant = createDetailedTree(tx, tz, th, rng); }
                }
                
                if (assetPath) {
                    // Sicherstellen, dass der Pfad mit animation/ beginnt
                    const finalPath = assetPath.startsWith('animation/') ? assetPath : 'animation/' + assetPath;
                    loadModel(finalPath).then(model => {
                        if (!model) return;
                        // Bäume und große Objekte leicht in den Boden stecken für besseren Übergang,
                        // aber weniger tief als zuvor (-0.2 -> -0.05).
                        model.position.set(tx, th - 0.05, tz); 
                        model.scale.set(plantScale, plantScale, plantScale);
                        model.rotation.y = rng() * Math.PI * 2;
                        // Bäume werfen Schatten
                        model.traverse(child => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                        group.add(model);
                    }).catch(e => {});
                } else if (plant) {
                    // Auch generierte Pflanzen leicht anpassen
                    plant.position.set(tx, th - 0.05, tz); 
                    plant.rotation.y = rng() * Math.PI * 2;
                    plant.castShadow = true;
                    plant.receiveShadow = true;
                    group.add(plant);
                }
            }
        }

        // 2. Clutter (Instanced) - Biome-abhängig
        const clutterCount = 150 + Math.floor(rng() * 200);
        const instancedData = new Map(); // assetPath -> Array of {pos, scale, rot}
        
        for (let i = 0; i < clutterCount; i++) {
            const sx = x0 + rng() * DECORATION_CELL_SIZE;
            const sz = z0 + rng() * DECORATION_CELL_SIZE;
            const sh = getGPUHeight(sx, sz);
            
            if (sh > 2.2) {
                let assetPath = null;
                let scale = 1.0;

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
                    
                    // OFFSET FIX: Wir heben das Clutter (Steine/Gras) deutlich an (+0.3).
                    instancedData.get(finalPath).push({
                        pos: [sx, sh + 0.3, sz],
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

        // Große Basis-Ebene für den Hintergrund (verhindert das "blaue Nichts")
        // const baseGeo = new THREE.PlaneGeometry(5000, 5000);
        // const baseMat = new THREE.MeshStandardMaterial({ 
        //     color: 0x3d4f35, // Dunkles Grün/Erde
        //     roughness: 1.0,
        //     metalness: 0.0
        // });
        // const basePlane = new THREE.Mesh(baseGeo, baseMat);
        // basePlane.rotation.x = -Math.PI / 2;
        // basePlane.position.y = -5; // Tief genug unter dem eigentlichen Terrain
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

    function createDecorationCell(cx, cz) {
        const group = new THREE.Group();
        const seed = cx * 1337 + cz * 42;
        const rng = rndSeed(seed);
        
        const count = 12; // Weniger Bäume für Performance
        for (let i = 0; i < count; i++) {
            const x = (cx + rng()) * DECORATION_CELL_SIZE;
            const z = (cz + rng()) * DECORATION_CELL_SIZE;
            
            // WICHTIG: RaycastHeight für präzise Platzierung auf dem Clipmap-Terrain
            const h = getRaycastHeight(x, z, getGPUHeight(x, z));
            if (h < 5.0 || h > 300.0) continue; // Nur in moderaten Höhen spawnen
            
            const type = rng() > 0.5 ? 'pine' : 'oak';
            const tree = type === 'pine' ? createPine(rng) : createOak(rng);
            tree.position.set(x, h, z);
            
            // AOI Check: Dormant state falls zu weit weg
            // Jedes Material des Baums einzeln cullen
            tree.traverse(child => {
                if (child.isMesh) {
                    applyWorldCulling(child.material);
                }
            });
            
            group.add(tree);
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

            const h = getRaycastHeight(x, z, getGPUHeight(x, z));
            if (h < 5.0 || h > 200.0) continue;
            
            dummy.position.set(x, h, z);
            dummy.rotation.y = rng() * Math.PI;
            dummy.scale.set(2, 2, 2);
            dummy.updateMatrix();
            mesh3D.setMatrix(i, dummy.matrix);
        }
        group.add(mesh3D);
        
        // 2. 2D GRAS (Fernbereich - Xenoblade Style Cross-Planes)
        // Nutzt Sprite-Textur auf gekreuzten Planes für Volumen aus jeder Sicht
        const count2D = 25; // Erhöht für bessere Fernwirkung
        const grassTex2D = new THREE.TextureLoader().load(GRASS_PNG_PATH);
        const grassMat2D = new THREE.MeshBasicMaterial({ map: grassTex2D, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
        applyGrassShader(grassMat2D, false);
        
        // Xenoblade-Logik: Erstelle gekreuzte Planes für 2D Gras
        const plane1 = new THREE.PlaneBufferGeometry(1, 1);
        plane1.translate(0, 0.5, 0); // Ursprung an die Basis setzen
        const plane2 = plane1.clone();
        plane2.rotateY(Math.PI / 2);
        
        // Wir nutzen BufferGeometryUtils falls vorhanden, sonst manuell oder einfach plane1 als Fallback
        let billboardGeo = plane1;
        if (typeof THREE.BufferGeometryUtils !== 'undefined') {
            billboardGeo = THREE.BufferGeometryUtils.mergeBufferGeometries([plane1, plane2]);
        } else {
            // Manuelles Mergen falls Utils fehlen
            const merged = new THREE.Geometry();
            merged.fromBufferGeometry(plane1);
            const g2 = new THREE.Geometry();
            g2.fromBufferGeometry(plane2);
            merged.merge(g2);
            billboardGeo = new THREE.BufferGeometry().fromGeometry(merged);
        }

        const mesh2D = new THREE.InstancedMesh(billboardGeo, grassMat2D, count2D);
        mesh2D.layers.enable(0);
        mesh2D.layers.enable(3); // Grass-Layer
        for (let i = 0; i < count2D; i++) {
            const x = (cx + rng()) * GRASS_CELL_SIZE;
            const z = (cz + rng()) * GRASS_CELL_SIZE;
            const h = getRaycastHeight(x, z, getGPUHeight(x, z));
            if (h < 5.0 || h > 200.0) continue;
            
            // Korrektur: h statt h + 4.0, Skalierung angepasst für Cross-Planes
            dummy.position.set(x, h, z);
            dummy.rotation.y = rng() * Math.PI;
            dummy.scale.set(8, 8, 8);
            dummy.updateMatrix();
            mesh2D.setMatrix(i, dummy.matrix);
        }
        group.add(mesh2D);
        
        return group;
    }

    // --- PRIMITIVE ASSET CREATION ---
    function createPine(rng) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4), new THREE.MeshStandardMaterial({ color: PALETTE.trunk }));
        trunk.position.y = 2;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2d4c1e }));
        leaves.position.y = 6;
        g.add(trunk, leaves);
        g.scale.setScalar(1 + rng() * 0.5);
        return g;
    }

    function createOak(rng) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 3), new THREE.MeshStandardMaterial({ color: PALETTE.trunk }));
        trunk.position.y = 1.5;
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3a5f2a }));
        leaves.position.y = 5;
        g.add(trunk, leaves);
        g.scale.setScalar(1 + rng() * 0.5);
        return g;
    }

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
            
            // 1. GPGPU Update
            heightVariable.material.uniforms.time.value = time;
            gpuCompute.compute();
            
            // Gelegentliches Auslesen der Heightmap für CPU-Kollision (Container-Prinzip)
            const now = performance.now();
            if (now - GPGPU_Container.lastUpdate > GPGPU_Container.updateThreshold) {
                renderer.readRenderTargetPixels(gpuCompute.getCurrentRenderTarget(smoothVariable), 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, GPGPU_Container.heightData);
                GPGPU_Container.heightTexture = gpuCompute.getCurrentRenderTarget(smoothVariable).texture;
                GPGPU_Container.lastUpdate = now;
            }
            
        // 2. Clipmap Update
        if (clipmapMesh) {
            // Das Mesh folgt dem Spieler in 10m Schritten (verhindert Jittering durch Gleitkommafehler)
            const snap = 10;
            const snapX = Math.floor(playerPos.x / snap) * snap;
            const snapZ = Math.floor(playerPos.z / snap) * snap;
            
            clipmapMesh.position.set(snapX, 0, snapZ);
            clipmapMesh.updateMatrixWorld(); // Wichtig für präzises Raycasting
            
            if (clipmapMaterial.userData.shader) {
                const shader = clipmapMaterial.userData.shader;
                if (GPGPU_Container.heightTexture) shader.uniforms.heightMap.value = GPGPU_Container.heightTexture;
                if (shader.uniforms.meshOffset) shader.uniforms.meshOffset.value.set(snapX, snapZ);
                if (shader.uniforms.playerPos) shader.uniforms.playerPos.value.set(playerPos.x, playerPos.z);
            }

            // Gebäude-Höhen im Nahbereich validieren (Asset-Anchoring)
            fpVillageBuildings.forEach(b => {
                const dist = Math.hypot(b.position.x - playerPos.x, b.position.z - playerPos.z);
                if (dist < 100) { // Nur im Nahbereich für Performance
                    const h = getRaycastHeight(b.userData.seedX || b.position.x, b.userData.seedZ || b.position.z, b.position.y);
                    // Wir setzen y auf h, aber lassen eine winzige Toleranz gegen Z-Fighting
                    b.position.y = h;
                    b.updateMatrixWorld();
                }
            });
        }
            
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