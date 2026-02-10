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
    const AOI_RADIUS = 10;      // Aktiver Simulationsradius (Bubble)
    const DORMANT_RADIUS = 15;  // Radius, ab dem Assets komplett einfrieren
    const GRASS_LOD_DIST = 15;  // Grenze zwischen 3D und 2D Gras
    const GRASS_MAX_DIST = 1500; // Maximale Sichtweite für 2D Gras
    const GRASS_PNG_PATH = 'https://raw.githubusercontent.com/noverato/System/main/animation/baeume/Grass_large.png';
    const CLIPMAP_SEGMENTS = 128; // Reduziert für Stabilität
    
    const DECORATION_CELL_SIZE = 256; 
    const DECORATION_RANGE = 4; 
    const GRASS_CELL_SIZE = 64;   // Kleinere Zellen für Gras-Chunks (feineres Culling)
    const GRASS_RANGE = 6;        // Radius der geladenen Gras-Zellen

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
                    varying vec2 vUV;
                ` + shader.vertexShader;

                // Wind-Animation für 3D-Gras
                if (is3D) {
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        `
                        #include <begin_vertex>
                        // Wind-Animation (Vertex Displacement)
                        // Nutze die Instanz-Position für koordinierte Wellenbewegung
                        float windStrength = 0.4;
                        float windSpeed = 2.5;
                        
                        // Wir holen uns die Welt-Position der Instanz aus der instanceMatrix
                        vec3 wPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                        
                        float wave = sin(time * windSpeed + wPos.x * 0.1 + wPos.z * 0.1) * (position.y * 0.3);
                        transformed.x += wave * windStrength;
                        transformed.z += wave * windStrength * 0.5;
                        `
                    );
                }

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
                    ${is3D ? 'if (vDist > lodDist) hide = true;' : 'if (vDist < lodDist || vDist > maxDist) hide = true;'}
                    if (hide) {
                        gl_Position.z = gl_Position.w * 2.0;
                    }
                    `
                );

                shader.fragmentShader = `
                    uniform float lodDist;
                    uniform float maxDist;
                    varying float vDist;
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

                void main() {
            ` + shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                // UV-Koordinaten für die Heightmap berechnen (Mapping von Welt- auf Textur-Koordinaten)
                vec2 worldXZ = (position.xz + meshOffset) + worldOffset;
                vec2 hUV = (worldXZ + (gpuWorldSize * 0.5)) / gpuWorldSize;
                
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
                
                // Welt-basierte UVs für Kachelung
                vec2 wUV = vWorldPos.xz * 0.05;
                
                // Texturen mischen
                vec3 texGrass = texture2D(grassTex, wUV).rgb;
                vec3 texStone = texture2D(stoneTex, wUV * 0.5).rgb;
                vec3 texDesert = texture2D(desertTex, wUV).rgb;
                
                // Steigungs-Check für Felsen (Normale berechnen)
                vec3 dX = dFdx(vWorldPos);
                vec3 dZ = dFdy(vWorldPos);
                vec3 normal = normalize(cross(dX, dZ));
                float slope = 1.0 - normal.y;
                
                // Biome-Logik basierend auf Höhe
                vec3 bioColor = plainsColor;
                
                if (vHeight < 3.0) bioColor = oceanColor; // Tiefer Ozean
                else if (vHeight < 8.0) bioColor = mix(oceanColor, plainsColor, smoothstep(3.0, 8.0, vHeight)); // Küste
                else if (vHeight > 400.0) bioColor = mix(plainsColor, snowColor, smoothstep(400.0, 700.0, vHeight)); // Schnee
                
                // Fels-Splatting bei Steigung
                float rockFactor = smoothstep(0.3, 0.6, slope);
                vec3 finalColor = mix(bioColor * texGrass, stoneColor * texStone, rockFactor);
                
                diffuseColor.rgb = finalColor;
                `
            );
        };

        clipmapMesh = new THREE.Mesh(geo, clipmapMaterial);
        clipmapMesh.rotation.x = -Math.PI / 2;
        clipmapMesh.frustumCulled = false; // Wir bewegen das Mesh mit dem Spieler
        clipmapGroup.add(clipmapMesh);
    }

    function initWater(scene) {
        const waterGeo = new THREE.PlaneGeometry(CLIPMAP_RADIUS * 2, CLIPMAP_RADIUS * 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: PALETTE.water,
            transparent: true,
            opacity: 0.6,
            roughness: 0.1,
            metalness: 0.5
        });
        
        globalWater = new THREE.Mesh(waterGeo, waterMat);
        globalWater.rotation.x = -Math.PI / 2;
        globalWater.position.y = 2.0; // Wasserhöhe
        scene.add(globalWater);
    }

    // --- DEKORATIONSSYSTEM (Bäume, Felsen, Gras) ---
    const decorationGrids = new Map(); // Map<string, Group>
    const grassGrids = new Map();       // Map<string, Group>

    function updateDecorations(playerPos) {
        if (!mainScene) return;
        
        const cellX = Math.floor(playerPos.x / DECORATION_CELL_SIZE);
        const cellZ = Math.floor(playerPos.z / DECORATION_CELL_SIZE);
        
        // 1. Dekorationen (Bäume/Felsen)
        for (let x = cellX - DECORATION_RANGE; x <= cellX + DECORATION_RANGE; x++) {
            for (let z = cellZ - DECORATION_RANGE; z <= cellZ + DECORATION_RANGE; z++) {
                const key = `${x}_${z}`;
                if (!decorationGrids.has(key)) {
                    const group = createDecorationCell(x, z);
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
                    const group = createGrassCell(x, z);
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
            
            const h = getGPUHeight(x, z);
            if (h < 5.0 || h > 300.0) continue; // Nur in moderaten Höhen spawnen
            
            const type = rng() > 0.5 ? 'pine' : 'oak';
            const tree = type === 'pine' ? createPine(rng) : createOak(rng);
            tree.position.set(x, h, z);
            
            // AOI Check: Dormant state falls zu weit weg
            applyWorldCulling(tree.material);
            
            group.add(tree);
        }
        return group;
    }

    function createGrassCell(cx, cz) {
        const group = new THREE.Group();
        const seed = cx * 999 + cz * 123;
        const rng = rndSeed(seed);
        
        // 1. 3D GRAS (Nahbereich)
        const count3D = 40;
        const grassGeo = new THREE.PlaneGeometry(1, 1);
        const grassMat3D = new THREE.MeshBasicMaterial({ color: 0x44aa44, side: THREE.DoubleSide, alphaTest: 0.5 });
        applyGrassShader(grassMat3D, true);
        
        const mesh3D = new THREE.InstancedMesh(grassGeo, grassMat3D, count3D);
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < count3D; i++) {
            const x = (cx + rng()) * GRASS_CELL_SIZE;
            const z = (cz + rng()) * GRASS_CELL_SIZE;
            const h = getGPUHeight(x, z);
            if (h < 5.0 || h > 200.0) continue;
            
            dummy.position.set(x, h + 0.5, z);
            dummy.rotation.y = rng() * Math.PI;
            dummy.scale.set(2, 2, 2);
            dummy.updateMatrix();
            mesh3D.setMatrix(i, dummy.matrix);
        }
        group.add(mesh3D);
        
        // 2. 2D GRAS (Fernbereich)
        // Nutzt Sprite-Textur für Performance
        const count2D = 15;
        const grassTex2D = new THREE.TextureLoader().load(GRASS_PNG_PATH);
        const grassMat2D = new THREE.MeshBasicMaterial({ map: grassTex2D, transparent: true, alphaTest: 0.5 });
        applyGrassShader(grassMat2D, false);
        
        const mesh2D = new THREE.InstancedMesh(grassGeo, grassMat2D, count2D);
        for (let i = 0; i < count2D; i++) {
            const x = (cx + rng()) * GRASS_CELL_SIZE;
            const z = (cz + rng()) * GRASS_CELL_SIZE;
            const h = getGPUHeight(x, z);
            if (h < 5.0 || h > 200.0) continue;
            
            dummy.position.set(x, h + 4.0, z);
            dummy.scale.set(12, 12, 12);
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

    function disposeGroup(group) {
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }

    function rndSeed(s) {
        let x = s;
        return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    }

    function getGPUHeight(x, z) {
        if (!gpuCompute || !heightVariable) return 15.0; // Fallback für Startpunkt
        
        // Mapping von Welt-Koordinaten auf Textur-Koordinaten (0.0 bis 1.0)
        const u = (x + (GPU_WORLD_SIZE * 0.5)) / GPU_WORLD_SIZE;
        const v = (z + (GPU_WORLD_SIZE * 0.5)) / GPU_WORLD_SIZE;
        
        if (u < 0 || u > 1 || v < 0 || v > 1) return -50.0;
        
        const tx = Math.floor(u * (GPU_TERRAIN_SIZE - 1));
        const ty = Math.floor(v * (GPU_TERRAIN_SIZE - 1));
        const idx = (ty * GPU_TERRAIN_SIZE + tx) * 4;
        
        return gpuHeightData[idx] || 0;
    }

    // --- MODULAR HOUSE SYSTEM ---
    const villageBuildings = [];

    function createModularHouse(type, seedX, seedZ) {
        const group = new THREE.Group();
        const rng = rndSeed(seedX * 100 + seedZ);
        
        // Versuch GLTF zu laden, sonst Fallback
        const modelPath = type === 'house' ? AssetsLibrary.get('BUILDINGS', 'HOUSE_SMALL') : AssetsLibrary.get('BUILDINGS', 'HOUSE_LARGE');
        
        // Da wir im Script-Kontext sind, nutzen wir einen Fallback-Box-Stil für Stabilität
        const houseBase = new THREE.Mesh(
            new THREE.BoxGeometry(10, 8, 10),
            new THREE.MeshStandardMaterial({ color: PALETTE.walls })
        );
        houseBase.position.y = 4;
        group.add(houseBase);
        
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(8, 6, 4),
            new THREE.MeshStandardMaterial({ color: PALETTE.roof })
        );
        roof.position.y = 11;
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        
        group.position.set(seedX, getGPUHeight(seedX, seedZ), seedZ);
        applyWorldCulling(houseBase.material);
        applyWorldCulling(roof.material);
        
        villageBuildings.push(group);
        return group;
    }

    // --- PUBLIC API ---
    window.FPGraphics = {
        init: (renderer, scene) => {
            initGPGPU(renderer);
            initClipmap(scene);
            initWater(scene);
            
            // Initialer Render-Pass für die Heightmap
            gpuCompute.compute();
            renderer.readRenderTargetPixels(gpuCompute.getCurrentRenderTarget(heightVariable), 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, gpuHeightData);
        },
        update: (renderer, playerPos, time) => {
            if (!gpuCompute) return;
            
            // 1. GPGPU Update
            heightVariable.material.uniforms.time.value = time;
            gpuCompute.compute();
            
            // Gelegentliches Auslesen der Heightmap für CPU-Kollision (nicht jeden Frame für Performance)
            if (Math.floor(time * 60) % 10 === 0) {
                renderer.readRenderTargetPixels(gpuCompute.getCurrentRenderTarget(heightVariable), 0, 0, GPU_TERRAIN_SIZE, GPU_TERRAIN_SIZE, gpuHeightData);
            }
            
            // 2. Clipmap Update
            if (clipmapMesh) {
                // Das Mesh folgt dem Spieler in 10m Schritten (verhindert Jittering durch Gleitkommafehler)
                const snap = 10;
                const snapX = Math.floor(playerPos.x / snap) * snap;
                const snapZ = Math.floor(playerPos.z / snap) * snap;
                
                clipmapMesh.position.set(snapX, 0, snapZ);
                clipmapMaterial.onBeforeCompile = (shader) => {
                    if (shader.uniforms.heightMap) shader.uniforms.heightMap.value = gpuCompute.getCurrentRenderTarget(heightVariable).texture;
                    if (shader.uniforms.meshOffset) shader.uniforms.meshOffset.value.set(snapX, snapZ);
                    if (shader.uniforms.playerPos) shader.uniforms.playerPos.value.set(playerPos.x, playerPos.z);
                };
            }
            
            // 3. Dekorationen
            updateDecorations(playerPos);
            
            // 4. Uniforms für Global Culling
            worldCullingUniforms.playerPos.set(playerPos.x, playerPos.z);
            worldCullingUniforms.time.value = time;
        },
        getGPUHeight,
        createModularHouse,
        villageBuildings,
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