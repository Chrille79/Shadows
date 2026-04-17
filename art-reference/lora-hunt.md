# LoRA-hunt guide

Tagning 2026-04-16. För att boosta hit-rate mot vår låsta stil
(painted silhouettes, Hollow Knight/Ori-ref, desaturerad + magenta
pickup-accent).

## 🔒 Jakt-status: AVSLUTAD (2026-04-16 kväll)

Uttömmande sökning på Civitai + Shakker genomförd. **Ingen
marknads-LoRA matchar exakt vårt behov** (dark gothic painted
silhouette 2D platformer environment är en nisch i en nisch).

**Kvar att testa:** Zavy Dark Atmospheric Contrast, Atmospheric
Gothic Forest. Seamless Textures sparad för Fas 4.

**Huvudvägen framåt:** träna egen LoRA i Fas 3 på våra egna
keepers + Zavy-boostade bilder. Marknads-LoRAs kompletterar,
de ersätter inte.

Se "Nedladdade LoRAs" sektionen för test-protokoll per LoRA.
Hoppa över all "Strategi"/"Söktermer"-info nedan — den behövs
inte längre.

## Strategi

Två parallella spår, båda värda att testa innan vi tränar egen LoRA:

1. **Stil-LoRA** — pushar generellt mot painted 2D-platformer-estetik
2. **Environment/background-LoRA** — hjälper SDXL producera miljöer
   istället för default-karaktärer

Planera **2-3 kandidater per kategori**, ladda ner, testa med våra
låsta prompter. Om stacking av 2 LoRAs på låg vikt (0.3-0.5 var)
pushar hit-rate från 50% → 80% → vi slipper träna egen LoRA.

## Primär källa: civitai.com

Direktlänk med rätt filter:
```
https://civitai.com/models?baseModels=SDXL%201.0&types=LORA&sort=Most%20Downloaded
```

**Filter som MÅSTE vara satta:**
- Model types: `LoRA`
- Base Model: `SDXL 1.0` (inte Illustrious, inte Pony, inte Flux, inte SD 1.5)
- Sort: `Most Downloaded` eller `Highest Rated`

Utan dessa filter får du 80% irrelevanta träffar.

## Söktermer att testa (i prioritetsordning)

### Stil-LoRA (direkta träffar på vår estetik)

1. `hollow knight` — direktträff, helig graal om det finns en SDXL-version
2. `ori blind forest` eller `ori will of the wisps`
3. `painted silhouette`
4. `2D platformer background`
5. `atmospheric concept art`
6. `dark fantasy environment`

### Environment/miljö-LoRA (fixar "SDXL vill rita karaktärer"-problemet)

1. `environment concept`
2. `background art`
3. `scenery`
4. `landscape painting`
5. `matte painting`
6. `wallpaper` (märkligt men miljö-tunga)

### Tekniska LoRAs (skruva silhuett/komposition)

1. `silhouette art`
2. `flat shading`
3. `parallax background`
4. `game background`

## Vad du ska kolla på varje LoRA-sida

Innan du laddar ner:

1. **Base Model:** måste vara `SDXL 1.0` (inte Illustrious, inte Pony)
2. **Exempelbilder:** matchar de din låsta stil? Om LoRAn bara visar
   anime-karaktärer → skippa även om namnet låter lovande
3. **Rekommenderad strength:** noterar siffran (ofta 0.6-0.9). Den ska
   sänkas när du stackar flera.
4. **Trigger words:** många LoRAs kräver specifika ord i prompten för
   att aktiveras. Skriv upp dem.
5. **Downloads + reviews:** sortera ut skräp via metrics

## Sekundära källor (om Civitai saknar)

- **HuggingFace** — några LoRAs postas där istället
- **Tensor.art** — alternativ LoRA-hub
- **Reddit r/StableDiffusion** — sökning där hittar community-rekommendationer
- **Shakker.ai / LiblibAI** — kinesiska sajter med vissa unika LoRAs

95% av det du behöver ligger på Civitai. De andra är backup.

## ComfyUI setup för LoRA-stacking

I ComfyUI, mellan `Load Checkpoint` och `KSampler`:

```
Load Checkpoint ──► Load LoRA (A) ──► Load LoRA (B) ──► Load LoRA (C) ──► KSampler
                    strength 0.4       strength 0.3       strength 0.3
```

- Flera `Load LoRA`-noder kopplade i kedja
- Varje tar `model` och `clip` från föregående
- `strength_model` och `strength_clip` brukar sättas lika
- **Summera aldrig över ~1.2-1.5 total** — då går bilden sönder. Börja
  lågt (0.3 per LoRA), skruva upp.

## Placering av nedladdade LoRAs

```
<din-comfyui-modellmapp>/loras/<filnamn>.safetensors
```

Efter kopiering: starta om ComfyUI eller tryck `R` för refresh. Sen
dyker LoRAn upp i `Load LoRA`-nodens dropdown.

## Utvärderings-test imorgon

När du laddat ner 2-3 kandidater:

1. Kör djungel-prompten från `prompts.md` utan LoRA → notera hit-rate
   över 5 seeds (baseline, ska vara ~50%)
2. Kör samma prompt med varje LoRA var för sig @ 0.6 → notera hit-rate
3. Kör stacking av de 2-3 bästa @ 0.3 styck → notera hit-rate
4. **Jämför:** om någon kombo pushar hit-rate till >75% → använd den
5. Om ingen förbättring → kasta LoRAerna, träna egen istället

## Fallback: om Civitai inte har rätt LoRA

Då är Fas 3 (träna egen LoRA i `kohya_ss`) vår väg. Det är inte hemskt
— dina 4 keepers + 10-15 till = bra dataset. Cirka 30 min träning på
3080 Ti. Men spara det till när Civitai-jakten misslyckas.

## Budget-förslag

Lägg max **2 timmar** på LoRA-jakt imorgon. Om du inte hittat bra
kandidater på den tiden → gå direkt till egen LoRA-träning. Inte värt
att fastna i "kanske finns det något bättre"-tunnelvision.

---

## Nedladdade LoRAs (inventarium)

Spårar vad vi har lokalt och när varje LoRA ska aktiveras. Uppdatera
denna lista varje gång du laddar ner en ny.

### 1. Zavy's Dark Atmospheric Contrast (🟢 topprioritet att testa)

- **Filnamn i ComfyUI:** `zavy-cntrst-sdxl`
- **URL:** https://civitai.com/models/295530/zavys-dark-atmospheric-contrast-sdxl
- **Typ:** Stil-LoRA (mörker-kvalitet-booster)
- **Base model:** SDXL 1.0 ✓
- **Trigger words:** `dark`, `chiaroscuro`, `low-key` (fungerar även utan — affekterar mörka scener automatiskt)
- **Rekommenderad strength:** 0.6-2.0, 1.3 som skaparens tip
- **Community:** 21.7k downloads, 2397 Overwhelmingly Positive reviews

**Gör:** preserverar tonal range i mörker, rik chiaroscuro, löser SDXL:s
kända problem att tappa detalj i dark scenes.

**Gör INTE:** ändrar stil till painted (tränad på fotografiska/
cinematiska mörka scener — risk för foto-real-drift vid hög strength).

**När används:** Fas 2 och framåt för ALLA atmospheric scene-
genereringar. Kan bli en alltid-aktiv komplement till vår stil-LoRA
(Fas 3).

**Test-protokoll:**
1. Baseline: djungel-prompt utan LoRA, 3 seeds → notera hit-rate
2. Test @ 0.6: samma prompt + Zavy @ 0.6, 3 seeds → jämför
3. Test @ 1.0: samma prompt + Zavy @ 1.0, 3 seeds → jämför
4. Test med triggers: lägg till `dark, chiaroscuro` i positive, Zavy @ 0.8
5. **Bedömning:** förbättrar den hit-rate märkbart? Driftar den mot photoreal?

**Varning:** om hög strength pushar bilderna mot fotografisk look,
sänk till 0.5-0.7 eller kassera för våra painted-prompts.

---

### 2. Atmospheric Gothic Forest (🟢 lovande, verifiera först)

- **Filnamn i ComfyUI:** `Atmospheric_Gothic_f0r3st`
- **URL:** https://civitai.com/models/2395335/atmospheric-gothic-forest
- **Typ:** Stil-LoRA (miljö-specifik)
- **Base model:** SDXL 1.0 ✓
- **Trigger word:** `Atmospheric Gothic f0r3st` (notera "0" istället för "o")
- **Rekommenderad strength:** inte angiven, börja på 0.6
- **Community:** 56 downloads, 12 reviews (4 positiva) — LÅG validering

**Gör:** (påstått) dark moody gothic forest scenes. Oklart utan att
testa själv.

**Gör INTE:** verifierat ännu — LoRA är 2 månader gammal, låg adoption.

**När används:** specifikt för forest/jungle-biom i Fas 2 och framåt.

**Test-protokoll (kritiskt, eftersom den är oprövad):**
1. Kör djungel-prompten + trigger `Atmospheric Gothic f0r3st` i
   positive prompt + LoRA @ 0.6, 3 seeds
2. Jämför direkt mot baseline (utan LoRA)
3. Om dramatisk förbättring → keeper
4. Om marginell/ingen → delete (low-validation LoRA, inte värd plats)
5. Strength-sweep 0.4 / 0.6 / 0.8 om första försöket ser lovande

**Risk:** kan vara undertränad eller för niche. Ärligt test krävs.

---

### 3. Hand-Painted 2D Seamless Textures (✅ Fas 4-verktyg)

- **Filnamn i ComfyUI:** `Hand-Painted_2d_Seamless_Textures-000007`
- **URL:** https://civitai.com/models/483692/hand-painted-2d-seamless-textures
- **Typ:** Teknik-LoRA (tileability), INTE stil-LoRA
- **Base model:** SDXL 1.0 ✓
- **Trigger word:** `2d seamless hand-painted texture`
- **Rekommenderad strength:** 0.3-0.4 när stackad
- **Community:** 3.7k downloads, Overwhelmingly Positive

**Gör:** producerar seamless tileable texturer (designed för stenblock,
funkar bredare).

**Gör INTE:** stil-lås mot Hollow Knight/Ori, atmosfäriska scener,
karaktärer, dekorations-tiles.

**När används:** Fas 4 (tile-produktion), specifikt för **terräng-tiles**
(mark, väggar, stenblock). Stacka med:
- Vår egenränade stil-LoRA (från Fas 3) @ 0.6
- Ev. Zavy @ 0.3
- Denna textur-LoRA @ 0.3

Positive prompt ska innehålla trigger `2d seamless hand-painted texture`
+ vår stil-prompt + subject.

**Viktigt:** ComfyUI måste ha tiling-mode aktiverat (`Circular VAE Decode`-
nod eller `Asymmetric Tiling` på modellen innan sampling). Lös
detaljerna när Fas 4 startar.

**Använd INTE för:** background/atmospheric scenes (Fas 1-2-output).
Texturer och backgrounds är separata asset-format.

---

### 4. DnD Darkest Fantasy v2 (🟡 karaktär, begränsad nytta)

- **Filnamn i ComfyUI:** `DnDDarkestFantasyV2SDXL`
- **URL:** https://civitai.com/models/637882 (DnD Darkest Fantasy SDXLv2)
- **Typ:** Karaktär/mood-LoRA (främst porträtt)
- **Base model:** SDXL 1.0 ✓
- **Trigger word:** `DNDDARKESTFANTASY`
- **Rekommenderad strength:** 1.0 (kan vara för aggressivt — testa lägre)
- **Community:** legit skapare, 362 downloads version 2

**Gör:** D&D-hjälte/karaktärs-porträtt med mörk fantasy-mood. Mignola-
/Midjourney-aktig look.

**Gör INTE:** miljöer, parallax-backgrounds, tiles. Exempelbilderna
är alla porträtt.

**Varning:** direkt konflikt med vår `no people, character, portrait,
face, human, figure` negative prompt. Kör bara om du medvetet vill
generera karaktärer — inte för tile-pipeline.

**När används:** **inte i nuvarande pipeline**. Håll i biblioteket
för ev. framtida karaktärsdesign (spelarkaraktär, NPCs, fiender).

**Test-protokoll:** *skippa tester*. Inte relevant för Fas 2-4 tile-
produktion.

---

<!-- Lägg till fler LoRAs här när de laddas ner. Format:

### <nummer>. <namn>

- **Filnamn i ComfyUI:**
- **URL:**
- **Typ:** (stil / teknik / miljö / karaktär — skippa karaktärs-LoRAs)
- **Base model:** SDXL 1.0 ✓ / fel version
- **Trigger words:**
- **Rekommenderad strength:**
- **Community:** downloads / reviews
- **Gör:**
- **Gör INTE:**
- **När används:** Fas X
- **Test-protokoll:**
- **Notering:**

-->

