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

    const CLIPMAP_RADIUS = 2000; // Größere Sichtweite für 8000x8000 Map
    const AOI_RADIUS = 500;      // Aktiver Simulationsradius (Bubble)
    const DORMANT_RADIUS = 600;  // Radius, ab dem Assets komplett einfrieren
    const CLIPMAP_SEGMENTS = 128; // Reduziert für Stabilität
    
    const DECORATION_CELL_SIZE = 256; 
    const DECORATION_RANGE = 4; 
    const GRASS_CELL_SIZE = 64;   // Kleinere Zellen für Gras-Chunks (feineres Culling)
    const GRASS_RANGE = 6;        // Radius der geladenen Gras-Zellen

    // Globale Uniforms für das Culling-System (Bubble-Prinzip / Glocke)
    const worldCullingUniforms = {
        playerPos: { value: new THREE.Vector2(0, 0) },
        clipRadius: { value: CLIPMAP_RADIUS }
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
                    // Außerhalb des AOI-Radius wird das Bild minimal entsättigt oder dunkler,
                    // um den "statischen" Charakter der dormant Assets zu unterstreichen.
                    if (vDist > aoiRadius) {
                        gl_FragColor.rgb *= 0.85; // Leicht abdunkeln
                    }
                    `
                );
            };
        });
    }
    
    // --- GPGPU TERRAIN SETTINGS ---
    const GPU_TERRAIN_SIZE = 512; 
    const GPU_WORLD_SIZE = 10000; // Erhöht auf 10km x 10km (100km²) für die 86km² Anforderung
    
    // --- LOD SETTINGS entfernt für Clipmap ---
    
    let gpuCompute;
    let heightVariable;
    let smoothVariable;
    let gpuHeightData = new Float32Array(GPU_TERRAIN_SIZE * GPU_TERRAIN_SIZE * 4);
    
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
                // Wir berechnen die Welt-Position basierend auf der modelMatrix (Rotation-safe).
                // Wir nutzen einen internen Namen (_wPos), um Konflikte mit Three.js 'worldPosition' zu vermeiden.
                vec4 _wPos = modelMatrix * vec4(position, 1.0);
                vec2 worldXZ = _wPos.xz;
                
                // UV für Heightmap (0-1 Bereich) basierend auf dem GPGPU Zentrum (worldOffset)
                vec2 hUv = (worldXZ - worldOffset) / max(gpuWorldSize, 1.0) + 0.5;
                
                // HÖHEN-ABTASTUNG
                float h = getSmoothHeight(hUv);
                vHeight = h;

                // Displacement anwenden: Wir setzen die Höhe h direkt in die Weltposition
                vWorldPos = vec3(worldXZ.x, h, worldXZ.y);
                
                // Wir setzen die lokale Position so, dass sie nach der Transformation h entspricht.
                // Da das Mesh -90° X-rotiert ist (PlaneBufferGeometry), ist lokal Z = Welt Y.
                vec3 transformed = vec3(position.x, position.y, h);
                
                // vDist für radiale Effekte
                vDist = length(worldXZ - playerPos);
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <beginnormal_vertex>',
                `
                // Normalen-Berechnung (verfeinert für korrekte Beleuchtung)
                vec4 _worldPos = modelMatrix * vec4(position, 1.0);
                vec2 _hUv = (_worldPos.xz - worldOffset) / max(gpuWorldSize, 1.0) + 0.5;
                
                float texelSize = 1.0 / 512.0; 
                float hL = getSmoothHeight(_hUv - vec2(texelSize, 0.0));
                float hR = getSmoothHeight(_hUv + vec2(texelSize, 0.0));
                float hD = getSmoothHeight(_hUv - vec2(0.0, texelSize));
                float hU = getSmoothHeight(_hUv + vec2(0.0, texelSize));
                
                float wStep = gpuWorldSize / 512.0;
                
                // Normalen-Vektor in Object Space (Z ist Höhe)
                // In Object-Space (-90° X-Rot) ist die Z-Achse die Höhe (Y in World).
                vec3 objectNormal = normalize(vec3(hL - hR, hD - hU, 2.0 * wStep));
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `
                // Wir nutzen transformed (mit h), damit Three.js die richtige Position projiziert
                vec4 mvPosition = viewMatrix * modelMatrix * vec4(transformed, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                // PERFORMANCE-OPTIMIERUNG: Distanz-Culling im Vertex Shader
                if (vDist > clipRadius + 150.0) {
                    gl_Position.z = gl_Position.w * 2.0; 
                }
                `
            );

            shader.fragmentShader = `
                uniform vec3 plainsColor;
                uniform vec3 desertColor;
                uniform vec3 snowColor;
                uniform vec3 jungleColor;
                uniform vec3 swampColor;
                uniform vec3 stoneColor;
                uniform vec3 pathColor;
                
                // Neue Biome-Farben
                uniform vec3 oceanColor;
                uniform vec3 forestColor;

                uniform sampler2D grassTex;
                uniform sampler2D stoneTex;
                uniform sampler2D desertTex;
                uniform sampler2D leavesTex;
                uniform sampler2D flowersTex;

                uniform float clipRadius;
                uniform float aoiRadius;
                varying vec3 vWorldPos;
                varying float vHeight;
                varying float vDist;
                // vNormal wird von Three.js bereitgestellt

                // Simple hash for noise
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
                }

                vec3 getBiomeColor(vec3 pos, float h, vec3 normal) {
            // --- TEXTUR-MIXING & ALPHA-LAYER (Konzeptuell) ---
            // Wir mischen die Test-Farbe mit einer Detail-Textur
            vec2 detailUv = pos.xz * 0.1;
            float detailNoise = noise(detailUv);
            vec3 baseCol = vec3(0.133, 0.545, 0.133); // #228B22
            
            // Simulierter Alpha-Layer: Gras-Strukturen über der Basis
            float grassPattern = smoothstep(0.4, 0.6, detailNoise);
            vec3 finalCol = mix(baseCol * 0.8, baseCol * 1.2, grassPattern);
            
            return finalCol; 

                    // Biome-Noise (Original-Logik folgt hier, falls reaktiviert)
                    float scale = 0.0002; 
                    float temp = noise(pos.xz * scale) * 2.0 - 1.0;
                    float humidity = noise(pos.xz * scale + vec2(100.0)) * 2.0 - 1.0;

                    // 7 Biome Gewichte
                    float wOcean = 0.0, wDesert = 0.0, wSnow = 0.0, wJungle = 0.0, wSwamp = 0.0, wForest = 0.0, wPlains = 0.0;

                    // Biome Logik basierend auf Temp/Humid
                    if (temp > 0.5) {
                        if (humidity < -0.3) wDesert = 1.0;
                        else if (humidity > 0.3) wJungle = 1.0;
                        else wForest = 1.0;
                    } else if (temp < -0.4) {
                        // SNOW FIX: Reduziere Wahrscheinlichkeit für reines Weiß am Anfang
                        wSnow = 0.2; 
                        wPlains = 0.8;
                    } else {
                        if (humidity > 0.6) wSwamp = 1.0;
                        else if (humidity < -0.5) wDesert = 0.5;
                        else if (temp > 0.0) wForest = 1.0;
                        else wPlains = 1.0;
                    }

                    // Ocean (Tiefland)
                    if (h < 2.0) {
                        float oceanF = smoothstep(2.0, -5.0, h);
                        wOcean = oceanF;
                        // Andere Gewichte reduzieren
                        float invOcean = 1.0 - oceanF;
                        wDesert *= invOcean; wSnow *= invOcean; wJungle *= invOcean; wSwamp *= invOcean; wForest *= invOcean; wPlains *= invOcean;
                    }

                    // HÖHEN-BIOME & STEILHEIT
                    float stoneStart = 60.0;
                    float snowStart = 130.0;
                    
                    float slope = 1.0 - normal.y;
                    float wStone = smoothstep(0.4, 0.7, slope);
                    
                    if (h > stoneStart) {
                        wStone = max(wStone, smoothstep(stoneStart, stoneStart + 20.0, h));
                    }
                    
                    if (wStone > 0.0) {
                        float reduce = 1.0 - wStone;
                        wOcean *= reduce; wDesert *= reduce; wSnow *= reduce; wJungle *= reduce; wSwamp *= reduce; wForest *= reduce; wPlains *= reduce;
                        
                        if (h > snowStart) {
                            float snowHFactor = smoothstep(snowStart, snowStart + 30.0, h);
                            wSnow = mix(wSnow, 1.0, snowHFactor);
                            wStone *= (1.0 - snowHFactor);
                        }
                    }

                    // Startpunkt (0,0) erzwingt Plains
                    float distToStart = length(pos.xz);
                    float startEffect = 1.0 - smoothstep(100.0, 300.0, distToStart);
                    wPlains = mix(wPlains, 1.0, startEffect);
                    wOcean = mix(wOcean, 0.0, startEffect);

                    // Normalisieren der Gewichte
                    float total = wOcean + wDesert + wSnow + wJungle + wSwamp + wForest + wPlains + wStone;
                    if (total > 0.0) {
                        wOcean /= total; wDesert /= total; wSnow /= total; wJungle /= total; wSwamp /= total; wForest /= total; wPlains /= total; wStone /= total;
                    }

                    // Textur-Mapping
                    vec2 tUv = pos.xz * 0.02; // Kleinere UV-Skalierung für weniger Kachelung
                    
                    vec3 grassCol = texture2D(grassTex, tUv).rgb * plainsColor;
                    vec3 stoneCol = texture2D(stoneTex, tUv).rgb * stoneColor;
                    vec3 desertCol = texture2D(desertTex, tUv).rgb * desertColor;
                    vec3 leavesCol = texture2D(leavesTex, tUv).rgb * jungleColor;
                    vec3 flowersCol = texture2D(flowersTex, tUv).rgb;
                    
                    // FALLBACK: Falls Texturen nicht geladen wurden (weiß sind), nutze Biome-Farben
                    if (length(grassCol) < 0.01) grassCol = plainsColor;
                    if (length(stoneCol) < 0.01) stoneCol = stoneColor;
                    if (length(desertCol) < 0.01) desertCol = desertColor;

                    vec3 col = oceanColor * wOcean + 
                               desertCol * wDesert + 
                               mix(stoneCol, vec3(0.9, 0.95, 1.0), 0.8) * wSnow + 
                               leavesCol * wJungle + 
                               mix(leavesCol, swampColor, 0.6) * wSwamp + 
                               mix(grassCol, forestColor, 0.4) * wForest + 
                               mix(grassCol, flowersCol, 0.1) * wPlains +
                               stoneCol * wStone;

                    // Mikro-Rauschen
                    float n = hash(pos.xz * 0.1);
                    col *= 0.95 + 0.1 * n;
                    
                    // Helligkeits-Boost reduziert (Gegen Überstrahlung)
                    float hBoost = smoothstep(50.0, 500.0, h) * 0.2 + 1.0;
                    col *= hBoost; 
                    
                    // Schatten-Simulation
                    float shadow = smoothstep(0.2, 0.9, slope);
                    col *= mix(1.0, 0.6, shadow); 
                    
                    // Rim-Light nur bei hohen Bergen
                    float rim = 1.0 - max(dot(normal, vec3(0.0, 1.0, 0.0)), 0.0);
                    rim = pow(rim, 4.0) * smoothstep(100.0, 400.0, h);
                    col += vec3(0.1, 0.15, 0.2) * rim;
                    
                    return clamp(col, 0.0, 1.0);
                }

            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `
                diffuseColor.rgb = getBiomeColor(vWorldPos, vHeight, vNormal);
                
                // --- ÜBERSTRAHLUNGS-SCHUTZ ---
                // Falls der Boden immer noch weiß ist, könnte die Lichtintensität zu hoch sein.
                // Wir begrenzen die Helligkeit hier hart.
                diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.95)); 
                
                // HELLIGKEITS-ANPASSUNG FÜR SICHTBARKEIT
                diffuseColor.rgb *= 0.6; // Weiter reduziert auf 0.6, um Überstrahlung zu verhindern
                
            // --- KONTRAST-BOOST FÜR BERGE ---
                if (vHeight > 40.0) {
                    diffuseColor.rgb = pow(diffuseColor.rgb, vec3(0.9)); // Mehr Kontrast durch niedrigeren Exponenten
                }
                
                // --- STRUKTUR-LICHT VERSTÄRKEN ---
                // Simulierter Lichteinfall von oben/vorne für bessere Formdefinition
                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
                float NdotL = max(dot(vNormal, lightDir), 0.0);
                diffuseColor.rgb *= (NdotL * 0.4 + 0.8);
                
                // Sanftes Ausblenden am Rand - ERWEITERT
                // Wir nutzen einen größeren Bereich für das Ausblenden, damit es nicht so abrupt ist
                float edgeFade = smoothstep(clipRadius, clipRadius * 0.8, vDist);
                diffuseColor.rgb = mix(diffuseColor.rgb * 0.5, diffuseColor.rgb, edgeFade);
                
                // AOI-System: Außerhalb des AOI-Radius leicht abdunkeln (Dormant-Zone Visuelle Markierung)
                if (vDist > aoiRadius) {
                    diffuseColor.rgb *= 0.85;
                }
                
                // DISCARD LOGIK FÜR DIE GLOCKE
                // Wenn vDist > clipRadius, wird das Fragment verworfen.
                // Dies verhindert das "weiße" Aufblitzen, falls das Mesh über den Radius hinausragt.
                // if (vDist > clipRadius) discard;
                `
            );

            clipmapMaterial.userData.shader = shader;
        };


        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.receiveShadow = true; 
        clipmapMesh.castShadow = false;
        clipmapMesh.frustumCulled = false; // Gegen Verschwinden bei hohen Bergen
        
        // Exponiere das Mesh für Kollisionsprüfungen in fp_wald.js
        FPGraphics.terrainMesh = clipmapMesh;
        
        clipmapGroup.add(clipmapMesh);

        // --- GLOBAL WATER SURFACE ---
        const waterPath = AssetsLibrary.get('TERRAIN', 'OCEAN');
        loadModel(waterPath).then(waterModel => {
            globalWater = waterModel;
            // Skalierung auf die gesamte Map-Sichtweite (CLIPMAP_RADIUS * 2)
            // Wir nehmen 10000x10000, damit es wie ein Ozean unter der gesamten Map liegt
            globalWater.scale.set(10000, 1, 10000); 
            globalWater.position.y = 2.0; // Muss mit waterLevel im Shader übereinstimmen
            
            // Culling auf alle Meshes im Modell anwenden (Ocean ist Terrain, also isTerrain=true)
            globalWater.traverse(child => {
                if (child.isMesh) {
                    applyWorldCulling(child.material, true);
                    
                    // WASSER-TRANSPARENZ & FARBE ERZWINGEN (Fix für Weiß-Problem)
                    if (child.material) {
                        const oldMat = child.material;
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0x4fa3e1,
                            transparent: true,
                            opacity: 0.6,
                            side: THREE.DoubleSide,
                            depthWrite: false,
                            blending: THREE.NormalBlending,
                            fog: false // Nebel-Einfluss deaktivieren
                        });
                        oldMat.dispose();
                    }
                    child.layers.set(1); // Wasser auf Layer 1 legen
                }
            });
            
            clipmapGroup.add(globalWater);
            console.log("🌊 Globales Ozean-Modell geladen (Skalierung 10000):", waterPath);
        }).catch(err => {
            console.warn("Konnte ocean.glb nicht laden, nutze Fallback-Plane:", err);
            const waterGeo = new THREE.CircleGeometry(CLIPMAP_RADIUS, 32);
            const waterMat = new THREE.MeshStandardMaterial({
                color: PALETTE.water,
                transparent: true,
                opacity: 0.6,
                roughness: 0.1,
                metalness: 0.5,
                side: THREE.DoubleSide
            });
            globalWater = new THREE.Mesh(waterGeo, waterMat);
            globalWater.rotation.x = -Math.PI / 2;
            globalWater.position.y = 2.0;
            applyWorldCulling(globalWater.material, true);
            clipmapGroup.add(globalWater);
        });

        // Backup Plane entfernt - Terrain_Grass.glb übernimmt die Basis-Funktion
        /*
        const backGeo = new THREE.CircleGeometry(CLIPMAP_RADIUS + 10, 32);
        const backMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a2a1a, 
            transparent: true, 
            opacity: 0.3 
        });
        clipmapBackupMesh = new THREE.Mesh(backGeo, backMat);
        clipmapBackupMesh.rotation.x = -Math.PI / 2;
        clipmapBackupMesh.position.y = -5;
        clipmapGroup.add(clipmapBackupMesh);
        */

        // --- STATIC TERRAIN BASE (The Nest Master Rule) ---
        // Das Terrain_Grass.glb wird nur für das Wald-Biom (Zentrum) geladen.
        const terrainBasePath = AssetsLibrary.get('TERRAIN', 'GRASS_MODEL');
        loadModel(terrainBasePath).then(terrainBase => {
            // Skalierung auf 1.0 (Originalgröße des Assets für das Hauptdorf)
            terrainBase.scale.set(1.0, 1.0, 1.0); 
            terrainBase.position.set(0, 2.5, 0); // Zentral im Hauptdorf positioniert
            
            terrainBase.traverse(child => {
                if (child.isMesh) {
                    applyWorldCulling(child.material, true); 
                    child.receiveShadow = true;
                    child.frustumCulled = false;
                    
                    // Standard-Layer 0, damit es für alle Kameras sichtbar ist
                    child.layers.set(0); 
                    
                    if (child.material) {
                        child.material.color.set(0x228B22); // Dunkelgrün #228B22
                        child.material.transparent = false;
                        child.material.depthWrite = true;
                    }
                }
            });
            
            scene.add(terrainBase);
            console.log("🌲 Hauptdorf-Terrain geladen (Scale 1.0, Y=2.5):", terrainBasePath);
        }).catch(err => {
            console.warn("Konnte Terrain-Basis nicht laden:", err);
        });
    }

    function updateClipmap(px, pz, renderer) {
        if (!clipmapMesh || !gpuCompute) return;

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
        if (!gpuCompute) return noFallback ? null : getCPUHeight(x, z);
        
        const ox = heightVariable.material.uniforms.offset.value.x;
        const oz = heightVariable.material.uniforms.offset.value.y;
        
        // Relative Position in UV umrechnen (0 bis 1)
        const u = (x - ox) / GPU_WORLD_SIZE;
        const v = (z - oz) / GPU_WORLD_SIZE;
        
        if (u < 0 || u > 1 || v < 0 || v > 1) {
            return noFallback ? null : getCPUHeight(x, z);
        }

        // Bilineare Interpolation für glatteres Terrain
        const fx = u * (GPU_TERRAIN_SIZE - 1);
        const fz = v * (GPU_TERRAIN_SIZE - 1);
        const ix = Math.floor(fx);
        const iz = Math.floor(fz);
        const tx = fx - ix;
        const tz = fz - iz;

        const getH = (x, z) => {
            const idx = (z * GPU_TERRAIN_SIZE + x) * 4;
            return gpuHeightData[idx];
        };

        const h00 = getH(ix, iz);
        const h10 = getH(Math.min(ix + 1, GPU_TERRAIN_SIZE - 1), iz);
        const h01 = getH(ix, Math.min(iz + 1, GPU_TERRAIN_SIZE - 1));
        const h11 = getH(Math.min(ix + 1, GPU_TERRAIN_SIZE - 1), Math.min(iz + 1, GPU_TERRAIN_SIZE - 1));

        const h = (h00 * (1 - tx) + h10 * tx) * (1 - tz) +
                  (h01 * (1 - tx) + h11 * tx) * tz;
        
        // Fallback wenn GPGPU noch keine Daten hat oder noch initialisiert
        // h === 0 ist am Anfang oft ein Zeichen für "noch nicht bereit"
        if (h === 0) {
            // Wenn wir am Startpunkt (0,0) sind, wissen wir, dass die Höhe eigentlich ~15 sein sollte.
            // Wenn wir 0 erhalten, ist die GPGPU also noch nicht bereit.
            if (noFallback) return null;
            return getCPUHeight(x, z);
        }
        
        return h;
    }
    
    // Basis-Pfad für Assets (Lokal vs. GitHub flexibel)
    // Dieser Pfad wird jetzt zentral in AssetsLibrary.js verwaltet.
    
    let chunks = new Map(); // Nur noch für Kollision/Vegetation im Hintergrund (Veraltet)
    let villageBuildings = [];
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

    async function createModularHouse(type = 'small', seedX = 0, seedZ = 0) {
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
        if (gpuCompute && gpuHeightData && gpuHeightData.length > 0) {
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

    function createCactus(rng) {
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

   // Deterministischer Zufall für Chunks
    function mulberry32(a) {
        return function() {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    const instanceCache = new Map(); // Cache für InstancedMesh-Vorlagen (Geometry/Material)

    async function getModelInstanceData(path) {
        if (instanceCache.has(path)) return instanceCache.get(path);
        
        const model = await loadModel(path);
        let mesh = null;
        model.traverse(obj => {
            if (obj.isMesh && !mesh) mesh = obj;
        });

        if (mesh) {
            const isTerrain = path.includes('/Terrain/') || path.includes('Terrain_Grass') || path.includes('ocean.glb');
            applyWorldCulling(mesh.material, isTerrain);
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
        const midH = getTerrainHeight(midX, midZ);
        const biome = getBiomeData(midX, midZ, midH);
        
        // Ocean/Water check
        if (midH < 2.0) return;

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
            const sh = getTerrainHeight(sx, sz);
            
            if (sh > 1.5) {
                let assetPath = null;
                let scale = 1.0;

                if (biome.name === 'desert') {
                    // Wüste bekommt vorerst gar nichts, bis Terrain steht
                    /*
                    const grass = AssetsLibrary.get('NATURE', 'GRASS');
                    if (Array.isArray(grass) && grass.length > 0) {
                        assetPath = AssetsLibrary.encode('Nature/glTF/' + grass[0]);
                        scale = 0.5 + rng() * 1.0;
                    }
                    */
                } else if (biome.name === 'snow') {
                    // Kein Gras im Schnee
                } else {
                    const rand = rng();
                    if (rand > 0.4) {
                        // Hauptgras (Terrain_Grass.glb aus /Terrain/)
                        assetPath = AssetsLibrary.get('TERRAIN', 'GRASS');
                        scale = 1.0 + rng() * 0.5;
                    } else if (rand > 0.1) {
                        // Grass_Large oder Grass_Small (jetzt aus /baeume/glTF/)
                        const grassList = AssetsLibrary.get('TREES', 'GRASS');
                        assetPath = rng() > 0.5 
                            ? AssetsLibrary.encode('baeume/glTF/' + grassList[0])
                            : AssetsLibrary.encode('baeume/glTF/' + grassList[1]);
                        scale = 0.8 + rng() * 0.4;
                    } else {
                        // Blumen reaktivieren
                        const flowerList = AssetsLibrary.get('TREES', 'FLOWERS');
                        if (Array.isArray(flowerList) && flowerList.length > 0) {
                            const flower = flowerList[Math.floor(rng() * flowerList.length)];
                            assetPath = AssetsLibrary.encode('baeume/glTF/' + flower);
                            scale = 1.0 + rng() * 1.5;
                        }
                    }
                }

                if (assetPath) {
                    // Sicherstellen, dass der Pfad mit animation/ beginnt
                    const finalPath = assetPath.startsWith('animation/') ? assetPath : 'animation/' + assetPath;
                    if (!instancedData.has(finalPath)) instancedData.set(finalPath, []);
                    
                    // OFFSET FIX: Wir heben das Gras deutlich an (+0.5), um sicher über dem Boden zu sein.
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
            getModelInstanceData(path).then(data => {
                if (!data) return;
                const instancedMesh = new THREE.InstancedMesh(data.geo, data.mat, instances.length);
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
                instancedMesh.castShadow = false; // Gras wirft keinen Schatten für Performance
                instancedMesh.receiveShadow = true;
                group.add(instancedMesh);
            }).catch(e => {});
        }
    }

    let decorationRaycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3(0, -1, 0);

    function getRaycastHeight(x, z, fallbackHeight) {
        if (!FPGraphics.terrainMesh) return fallbackHeight;
        
        rayOrigin.set(x, 2000, z); // Starte über dem höchsten Berg (max 1500)
        decorationRaycaster.set(rayOrigin, rayDir);
        
        const intersects = decorationRaycaster.intersectObject(FPGraphics.terrainMesh);
        if (intersects.length > 0) {
            return intersects[0].point.y;
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
            console.warn("[FPGraphics] Keine Umgebung (env) übergeben!");
            return;
        }

        // GPGPU Initialisierung
        if (renderer) {
            initGPGPU(renderer);
            initClipmap(scene);
            // Erste Berechnung erzwingen
            updateClipmap(0, 0, renderer);
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
        if (globalWater) {
            // Animiertes Wasser (simpler Wave-Effekt)
            globalWater.position.y = 2.0 + Math.sin(Date.now() * 0.001) * 0.2;
        }
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
            let modularHouse;
            if (name === "Schmiede") {
                modularHouse = await createModularHouse('calibration', x, z);
            } else {
                // Alle Häuser nutzen jetzt standardmäßig das neue House_1.glb
                modularHouse = await createModularHouse('house1', x, z);
            }
            modularHouse.isBuildingGroup = true; // Markierung für Kalibrierung
            modularHouse.userData.name = name;
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
        if (clipmapGroup) {
            scene.remove(clipmapGroup);
            clipmapGroup.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            clipmapGroup = null;
        }

        // Dekorationen aufräumen
        decorationGroups.forEach(group => {
            scene.remove(group);
            group.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
        });
        decorationGroups.clear();
        
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
        get CLIPMAP_RADIUS() { return CLIPMAP_RADIUS; },
        get chunks() { return chunks; },
        get isInterior() { return isInterior; },
        get currentInterior() { return currentInterior; },
        get villageBuildings() { return villageBuildings; },
        get clipmapMesh() { return clipmapMesh; },
        initWorld,
        initMountains,
        initRiver,
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
        updateGPGPU,
        getGPUHeight,
        updateClipmap,
        initClipmap,
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
        selectNearestHouse,
        updateCalibration,
        cleanup,
        PALETTE
    };
})();