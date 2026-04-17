# Shadows — art pipeline & stilplan

Planerad 2026-04-16. Detta är en levande plan, inte hugget i sten.

## 🟢 Starta här nästa gång (2026-04-18+)

1. **Fas 2 är klart** — tränings-set ligger i `art-reference/training-set/`
   (20 bilder, blandning av biomer).
2. **Nästa steg: Fas 3 — LoRA-träning i kohya_ss.**
   - Verifiera att `kohya_ss` är installerat (GUI eller CLI).
   - Skriv caption-filer (.txt per PNG) med trigger-ord + beskrivning.
   - Kör träning ~30 min på 3080 Ti. Testa mot djungel-prompt.
3. När LoRAn är tränad → Fas 4 (tile-produktion) blir mycket lättare
   — dra på LoRA + använd tekniker från ART_PIPELINE.md Fas 4-sektionen.

## Vision

- **Genre:** 2D-plattformare med **skräck / goth / mörk** estetik.
- **Gameplay-hook:** karaktären **samlar ljus** för att rädda en mörk värld.
  Ljuset är både mekanik *och* visuell signatur — världen är mörk som bas,
  ljuset avslöjar färg, form och detalj.
- **Får INTE vara:** pixel-art, 80-tal, retro. Spelet ska sticka ut.

## Stilreferenser (låst 2026-04-16)

**Låst stil:** painted silhouettes i Hollow Knight / Ori and the Blind
Forest-maner. Scope reducerat till **organiska biom** — djungel, skog,
grotta, sumpmark. Ingen bebyggelse, ingen sci-fi/rymdskepp, ingen
gotisk katedral-arkitektur som primärt ämne.

**Nyckel-element som gör stilen:**
- Painted silhouetter i förgrund (pure black cut-outs utan interior-detalj)
- Subtle rim lighting i mellangrund
- Distant painted haze i bakgrund
- Dark desaturated blue-gray ambient palette
- Cyan/magenta reserverade för gameplay-ljus (pickups, effekter) — inte
  miljö-färg. Undantag: ett biom kan ha ambient tint *från* ljus-källorna
  (t.ex. "magenta crystal cavern" där kristallerna är ljus-källa som
  tintar atmosfären).
- Måne som ambient ljus utomhus, lokala ljus-källor inomhus/grotta

**Referenser:**
- **Hollow Knight** — painted silhouettes + glow accents, prioriterad ref
- **Ori and the Blind Forest / Will of the Wisps** — polished painted quality
- **Gris, Inside** — för minimalistisk tre-tons-variant (se nedan)

**Två sub-stilar inom samma värld:**

1. **Painted silhouettes (primär):** rikare, mjukare, mer detalj i
   mellangrund. Används för lush biom — djungel, skog, vegetation.
2. **Minimalist tre-tons-palett:** pure black förgrund, dark gray
   mellangrund, pale ambient tint i bakgrund (från ljuskällor). Används
   för karga biom — kristallgrottor, djupa tunnlar, avtrubbad mark.

**Biom-lista inom umbrella:**

| Biom | Prompt-subject |
|---|---|
| Lush glowing jungle | `dense dark alien jungle at night, hanging vines and giant fronds` |
| Dead/blighted forest | `dead blighted forest, withered trees, no bioluminescence, cold and sickly` |
| Swamp/wetlands | `dark murky swamp, mangrove roots, shallow reflective water, mist` |
| Cave system | `vast dark underground cavern, stalactites, rocky outcrops` |
| Deep canopy | `dense jungle canopy, almost no moonlight reaches the floor` |
| Ancient ruins in jungle | lush jungle prompt + `with ancient stone ruins partially buried in vines` |
| Magenta crystal cavern | cave prompt + `minimalist three-tone palette, pale magenta ambient tint` |

Alla använder samma style-anchor — bara subject varieras.

**Avfärdade spår (efter test):**
- Bioluminescent-överallt Avatar (för neon — färg stal gameplay-ljusets roll)
- Supercell/Brawl Stars painted render (för polish, tappade silhuetten)
- Gothic katedral-arkitektur som primärt ämne (bra, men utanför scope)
- Sci-fi bas-interiör (Dead Space/Alien) — intressant men helt annan genre

## Två parallella arbetsspår

### Spår A — AI-asset-pipeline (användaren driver)

**Fas 1: Hitta stilen (inga installationer än)**

Använd webb-tjänster (Leonardo.ai / Mage.space / replicate.com gratiskrediter).
Generera 10-15 wide-shot concept pieces med varianter av:

```
dark gothic 2D side-scroller environment, abandoned cathedral, moonlight,
heavy shadows, painted concept art, muted palette, atmospheric fog
```

Byt miljö (cathedral / catacombs / dead forest / swamp) och stilreferens
(`Mike Mignola style`, `Limbo game style`, `Tim Burton style`,
`Hollow Knight style`). Spara de 5 du älskar mest — det är stil-facit.

**Fas 2: Lokal SDXL-setup**

Hårdvara: RTX 3080 Ti (12 GB VRAM) — OK för SDXL, inte för batcher.

1. ComfyUI portable (Windows zip, packa upp, `run_nvidia_gpu.bat`).
2. `sd_xl_base_1.0.safetensors` från HuggingFace → `models/checkpoints/`.
3. Gothic/dark-fantasy LoRA från Civitai som matchar Fas 1-känslan →
   `models/loras/`.
4. `ComfyUI-Manager` för att installera ControlNet-noder + `rembg` /
   `BiRefNet` för bakgrundsborttagning.

VRAM-flaggor vid behov: `--medvram`. Stäng andra GPU-förbrukare.

**Fas 3: LoRA-träning (stil-lås)**

När 15-20 bilder är spikade i exakt rätt stil → träna LoRA i `kohya_ss`
(~30 min på 3080 Ti). Därefter är stilen reproducerbar.

**Fas 4: Tile-produktion — fyra tekniker**

AI-genererade tiles är *svårare* än concept art. SDXL är tränad på bilder
med kontext (himmel, mark, horisont) — den vill inte producera en isolerad
repeterbar tile. Lösningen är flera tekniker i kombination, inte en
magisk prompt.

**Teknik 1: Isolated-object + rembg** (för dekorations-tiles)

För fristående objekt — svampar, kristaller, rötter, ljuskällor, plantor.

Prompt-mall:
```
single [OBJEKT], isolated on pure black background, centered, studio shot,
stylized 2D cartoon, clean smooth shapes, flat rendering, bioluminescent,
game asset, no environment, no ground, no sky
```

Efter generering: `rembg` eller `BiRefNet`-nod → alpha PNG → direkt till
`client/src/assets/sprites/`.

Enklast. Funkar för ~50% av alla tiles.

**Teknik 2: img2img-restyle av befintliga tiles** (för terräng/struktur)

**Den bästa tekniken för oss.** Vi har redan `cave.png`, `world.png`,
`water.png` med rätt silhuett och kollisions-shape. AI:n ska bara **måla
om dem i ny stil**, inte hitta på från noll.

ComfyUI-kedja:
- `Load Image` → `VAE Encode` → `KSampler` (med `latent_image` från bilden)
- `denoise: 0.4-0.6` — lägre = mer original-struktur bevaras
- ControlNet lineart/canny ovanpå → låser silhuetten hårdare
- Prompt: Avatar-gothic-stilen + LoRA

Resultat: samma kollisions-shape, helt ny look. Gameplay-logik fortsätter
fungera identiskt, bara estetiken byts.

**Teknik 3: Slice-from-concept-art**

När vi har 5-10 konceptbilder vi älskar (Fas 1) — klipp ut bitar i
Photoshop/Krita/GIMP. En bit stenvägg blir wall-tile. En gren blir hängande
dekoration. Inte AI, bara traditionell asset-extraction.

Ofta det snabbaste för unika element (specifika ruiner, statyer, landmärken)
som skulle vara jobbiga att beskriva tillbaka till SDXL.

**Teknik 4: Stil-LoRA (från Fas 3) som multiplikator**

Alla tekniker ovan körs *med stil-LoRA:n aktiv*. Det är LoRA:n som
garanterar att Teknik 1-genererade dekorationer hör ihop med Teknik 2-
restyladge terräng, som hör ihop med Teknik 3-slicade koncept-bitar.

Utan LoRA blir det 100 tiles som inte matchar varandra.

**Integration i spelet:**

- Terräng-tiles → `client/src/assets/tiles/<stilnamn>/*.png`
- Dekorations-tiles (icke-solid) → `client/src/assets/sprites/<kategori>/*.png`
- Kör `npm run extract-tiles` efter nya terräng-tiles
- Dekorationer plockas upp automatiskt via glob-import

**Realistisk förväntning:** ~70% av genererade tiles behöver manuell
efterjustering (crop, alpha, skala). ~50% förkastas helt. En komplett
tileset för ett område = 20-30 genereringar + 2-3 h efterarbete.

**Fas 5 (senare): Normal maps via ControlNet**

När ljussystemet i spåret B är på plats — generera matching normal
maps för varje tile via ControlNet-depth/normal, så 2D-ljuset får
riktig reaktion på ytor.

### Spår B — Ljussystem i koden (Claude + användaren)

Oberoende av vilken stil som väljs behöver spelet ett 2D-ljussystem.
Det är *den* visuella signaturen. Kan börjas direkt på nuvarande
placeholder-tiles.

Planerade steg (kräver egen planering när det är dags):

1. **Mörker-pass.** Render-target som hela scenen dimmas genom. Tiles
   ritas mörka som bas.
2. **Point lights runt spelaren.** Additiv blending ovanpå mörker-pass,
   avslöjar färg och form.
3. **Insamlingsbara ljuskällor** som världsentiteter. Editor-stöd för
   att placera dem. Kopplat till en "ljus"-räknare.
4. **Bloom / glow** på samlade ljus — visuellt kvitto på pickup.
5. **(Valfritt senare) Normal maps** på tiles för ytreaktion.

Filerna som sannolikt berörs: [renderer.ts](client/src/engine/renderer.ts),
[spriteRenderer.ts](client/src/engine/spriteRenderer.ts),
[stage.ts](client/src/game/stage.ts), [main.ts](client/src/main.ts).

## Beslut som fortfarande är öppna

- **Silhuett-intensitet inom Avatar-cartoon-riktningen** — mer ren silhuett
  (Hollow Knight) eller mer rendered (Arcane)? Avgörs under Fas 1 när
  vi ser fler bilder.
- **Starta ljussystem nu eller efter Fas 1?** Parallellt rekommenderas —
  båda informerar varandra. Tiles måste se bra ut både i mörker och
  upplyst, och cartoon-stilen behöver testas mot ljusrenderingen.
- **Lokalt vs kommersiellt?** Lokalt valt — ComfyUI + SDXL är installerat
  och fungerar. Kommersiella alternativ (Retro Diffusion, Pixellab,
  Scenario.gg) avfärdade för nu.

## Checklista — vad gör vi härnäst

- [x] Installera ComfyUI Desktop + SDXL base — **klart**
- [x] Första lyckade gen (validerade setup) — **klart**
- [x] Fas 1: stil-utforskning — **klart**. 4 keepers i låst stil
      (painted silhouettes, Hollow Knight/Ori-ref, dark desaturated).
      Sparade lokalt av användaren.
- [x] Stil låst. Scope reducerat till organiska biom (se ovan).
- [x] Bekräftat: SDXL base producerar stilen med ~50% hit-rate. Stabil
      nog för exploration, **för flaky för batch-produktion av 50+ tiles**
      → LoRA behövs innan skarp tile-produktion.
- [x] **Fas 2: Samla LoRA-träningsset.** ✅ **20/20 klart (2026-04-17).**
      `art-reference/training-set/`: 4 original keepers + 3 jungle_dark +
      4 swamp + 2 cave + 4 dead_forest + 3 deep_canopy. Zavy @ 0.6/0.6
      aktiv under hela batchen (Gothic Forest kasserad, för arkitektur-drift).
- [ ] **Fas 3: Träna stil-LoRA** i `kohya_ss` på 3080 Ti (~30 min).
      Dataset = 15-20 valda keepers. Testa LoRA mot samma prompter,
      verifiera att hit-rate går upp.
- [ ] **Fas 4: Tile-produktions-graphs** i ComfyUI med LoRA aktiv:
      - Teknik 1: isolated-object + rembg för dekorations-tiles
      - Teknik 2: img2img-restyle av befintliga
        `cave.png`/`world.png`/`water.png`
- [ ] **Spår B (parallellt, när som helst):** prototypa ljussystemets
      första pass i `renderer.ts`. Oberoende av tile-status, kan köras
      på placeholder-tiles. Designbeslut som påverkar tile-produktion
      senare (behöver vi normal maps? bloom? etc).
- [ ] Producera första batchen tiles, integrera via `npm run extract-tiles`
      (terräng) eller direkt filsläpp till `assets/sprites/` (dekorationer)

## Framtida idéer / deferred

Idéer som dykt upp under Fas 1-utforskningen men ligger utanför nuvarande
scope. Anteckna här för att inte glömma.

### Spelarkaraktär som "ljus-bärare" (glödande silhuett)

Från Shakker-referens (2026-04-16): spelarkaraktären renderad som
**glödande outline/line-art mot den mörka världen**. Mekanisk logik:
världen är mörk, spelaren är ljus = bokstavligen "du bär ljuset du
samlar". Förstärker gameplay-hooken visuellt.

Referensbild sparad i
[art-reference/inspiration/external/](art-reference/inspiration/external/README.md).

Inte relevant för Fas 2-4 (tile-produktion). Plocka upp när spelar-
karaktärens rendering designas (Fas 5+).

## Spara keeper-set

Användaren har 4 stil-spikade bilder sparade lokalt. **Förvara dessa
som facit** — de är input till LoRA-träning i Fas 3, och visuellt mål
för alla tiles som produceras i Fas 4.

**Rekommenderad plats:** `art-reference/fas1-keepers/` i repo-roten
(utanför `client/src/` — det här är arbets-referenser, inte
spel-assets). Skapa mappen och flytta de 4 PNG:erna dit. Lägg till
`art-reference/` i `.gitignore` om du vill, alternativt commita dem
för versionerad historik.

ComfyUI lägger in prompt-metadata i PNG:erna automatiskt. För att
återfå exakt prompt + seed för en bild: dra PNG:n tillbaka på ComfyUI-
canvasen, så rekonstrueras hela workflown.

## Låsta prompter

Dessa är de prompts som faktiskt producerade stil-konsekventa keepers.
Kopiera till ComfyUI när du återupptar arbetet.

### Negative (delas av alla prompter)

```
people, character, portrait, face, human, figure, photorealistic, photograph, realistic texture, noisy, cluttered, bright daylight, sunny, cheerful, vibrant rainbow colors, neon environment, glowing scenery, cyan dominant, saturated, anime, manga, cel shading, hard cel shadow, thick black outlines, ink lines, flat cartoon, children's book, storybook, supercell chibi characters, cartoon mascot, cute, kawaii, chibi, low quality, blurry, watermark, text, signature, pixel art, deformed, distorted
```

### Djungel (primär stil-prompt)

```
dense dark alien jungle at night, hanging vines and giant fronds, painted silhouettes in foreground, parallax layered depth with distant moonlit haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated organic shapes, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground plants as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

### Grotta / underjorden

```
vast dark underground cavern, hanging stone stalactites in silhouette, rocky outcrops and boulders as foreground silhouettes, distant shaft of pale moonlight piercing through a cracked ceiling opening, parallax layered depth with distant foggy haze, stylized painted 2D game art in the style of Hollow Knight and Ori and the Blind Forest, digital painted silhouettes with subtle rim lighting, chunky exaggerated rock formations, hand-painted textures, volumetric silhouette forms, dark desaturated blue-gray ambient palette, single magenta glow from bioluminescent foreground crystals and fungi as gameplay light accents, atmospheric fog, 2D platformer background art, no people, empty scene, horizontal composition
```

### Minimalist tre-tons (för karga/kristall-biom)

```
vast underground cavern with tall thin rock spires, strict three-tone palette, pure black silhouette foreground with no interior detail, dark gray stone formations in middle distance, pale magenta-lavender atmospheric haze in background, heavy silhouette hierarchy, graphic minimalist composition, painted with restrained color, stylized 2D platformer game art in the style of Hollow Knight and Gris and Inside, atmospheric gradient from dark silhouette to pale ambient light, magenta crystal light sources tinting only the distant air, 2D game background art, no people, empty scene, horizontal composition
```

### Variant-biom (byt bara subject-delen i djungel-prompten)

| Biom | Subject att ersätta |
|---|---|
| Dead forest | `dead blighted forest, withered dry trees, no bioluminescent plants, cold and sickly, gnarled bare branches` |
| Swamp | `dark murky swamp with twisted mangrove roots, shallow reflective water, mist hugging the water surface` |
| Deep canopy | `dense jungle canopy so thick almost no moonlight reaches the floor, extreme darkness, hanging vines` |
| Jungle ruins | `dense dark alien jungle at night with ancient stone ruins partially buried in vines and roots` |

### KSampler-inställningar (samma för alla)

- width/height: 1024 × 1024
- steps: 25
- cfg: 7
- sampler: euler
- scheduler: normal
- seed: randomize (flera försök per prompt — hit-rate ~50% på base SDXL)
