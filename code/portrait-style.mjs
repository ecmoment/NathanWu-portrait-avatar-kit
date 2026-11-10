#!/usr/bin/env node
/**
 * 确定性人物头像提示词生成器
 *
 * 视觉签名生成方法：
 *   1. 用 FNV-1a 对「agent id」做哈希
 *   2. 用 13 个独立 salt 从各自的词池里各抽一条 → 组成「视觉签名」
 *   3. 把签名灌进固定模板 → 生成 prompt
 *   4. 交给图像模型渲染
 *
 * 同一组参数产生相同的签名与提示词；图像生成结果不保证相同。
 *
 * 用法：
 *   node portrait-style.mjs cards  <name>[:gender] ...      打印签名卡
 *   node portrait-style.mjs prompt <name>[:gender]          打印完整 prompt
 *   node portrait-style.mjs batch  <outDir> <name>[:gender] ...  写 prompt 文件
 *
 * gender: feminine | masculine | androgynous（默认 androgynous）
 */
import fs from 'node:fs';
import path from 'node:path';

/* ─────────── 哈希（FNV-1a 32bit） ─────────── */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
const pickFromHash = (arr, h, salt) => arr[((h ^ salt) >>> 0) % arr.length];

/* ─────────── 年龄分段（2~80 岁） ─────────── */
export const AGE_BANDS = {
  kid:    { label: 'kid',    ages: ['6', '7', '8', '9', '10', '11'] },
  teen:   { label: 'teen',   ages: ['14', '15', '16', '17', '18', '19'] },
  young:  { label: 'young',  ages: ['21', '23', '24', '25', '26', '27', '28', '29', '30', '32'] },
  prime:  { label: 'prime',  ages: ['33', '34', '35', '36', '37', '38', '39', '40'] },
  mid:    { label: 'mid',    ages: ['38', '41', '43', '45', '47', '49', '51', '53'] },
  senior: { label: 'senior', ages: ['58', '61', '63', '65', '67', '69'] },
  elder:  { label: 'elder',  ages: ['72', '74', '76', '78', '80'] },
};

/* ─────────── 13 个维度词池 ─────────── */
export const POOLS = {
  age: ['21', '23', '24', '25', '26', '27', '28', '29', '30', '32'],

  presentationFeminine: [
    'feminine, softly pretty face with large clear eyes and a small refined nose',
    'feminine, soft heart-shaped face with full lips and bright doe eyes',
    'feminine, delicate youthful features with rounded soft cheeks',
    'feminine, gently pretty face with high cheekbones and a graceful neck',
    'feminine, classic youthful face with a soft jaw and big warm eyes',
  ],
  presentationMasculine: [
    'masculine, refined features with deep clear eyes',
    'masculine, soft handsome face with a strong nose and full lashes',
    'masculine, sharp jaw and high cheekbones, a face with quiet intensity',
    'masculine, gentle refined features with a clear thoughtful gaze',
    'masculine, slim face with expressive dark eyes',
  ],
  presentationAndrogynous: [
    'gentle androgynous beauty, soft refined features with a warm clear gaze',
    'softly androgynous, delicate features with deep expressive eyes',
    'softly androgynous, balanced symmetrical features and a kind direct gaze',
    'softly androgynous, refined youthful face with full lashes and a small nose',
    'softly androgynous, pretty refined features with a calm expression',
  ],

  skin: [
    'fair porcelain with a faint pink undertone',
    'cool ivory',
    'warm cream',
    'soft beige',
    'golden olive',
    'warm tan',
    'sun-warmed honey',
    'rich olive',
  ],

  hairColor: [
    'raven black with a blue undertone',
    'soft espresso brown',
    'warm chestnut with copper highlights',
    'deep auburn',
    'honey blonde',
    'icy platinum',
    'cool ash brown',
    'fiery copper red',
    'jet black with one bleached streak in front',
    'mossy dark green dyed tint',
    'warm caramel blonde',
    'soft pastel-pink ends fading into natural brown',
  ],

  hairStyleFeminine: [
    'long soft waves falling over one shoulder',
    'a chin-length soft bob with a gentle inward curl',
    'shoulder-length and softly tousled, parted in the middle',
    'a single low ponytail with face-framing strands',
    'a wide halo of natural curls framing the face softly',
    'wavy hair tucked behind one ear, falling past the shoulder',
    'a soft half-up topknot with the rest falling in waves',
    'long straight hair with a soft curtain fringe',
    'a sweet bob with side-swept fringe just brushing the chin',
  ],
  hairStyleMasculine: [
    'soft tousled hair brushed casually forward',
    'an undercut with a long textured top swept to one side',
    'tight coils cropped close to the scalp, sharp hairline',
    'a clean tapered fade with a coiled crown',
    'medium-length hair tucked loosely behind the ears',
    'short waves with natural volume on top',
    'a soft fringe sweeping across the forehead',
    'a chin-length mullet, soft and modern',
    'a sharp shape-up with refined natural texture on top',
  ],
  hairStyleAndrogynous: [
    'shoulder-length and tucked loosely behind the ears',
    'a soft chin-length bob with a center part',
    'medium-length tousled hair with a gentle curtain fringe',
    'shoulder-length wavy hair, free and loose',
    'a low tied-back length with loose face-framing strands',
  ],

  signature: [
    'a small beauty mark just under the left eye',
    'a constellation of light freckles across the nose and cheekbones',
    'a single dimple on the left cheek that shows when smiling',
    'long curling eyelashes that catch light',
    'an asymmetric raised eyebrow at rest, full of personality',
    'a small mole at the corner of the mouth',
    'a faint natural blush at the apples of the cheeks',
    'a small delicate gold stud earring',
    'a soft pink flush across the cheeks and nose bridge',
    'a sweet softly rounded chin',
  ],

  glasses: [
    'no glasses',
    'no glasses',
    'no glasses',
    'thin gold wire-frames worn low on the bridge',
    'small round wire-frames',
    'narrow rectangular tortoiseshell frames',
    'oversized rounded clear-acetate frames',
    'thin matte-black wire-frames',
    'reading glasses pushed up into the hair',
  ],

  accessory: [
    'a single small gold hoop earring',
    'a thin silver chain at the neck',
    'a graphite pencil tucked behind one ear',
    'a soft knit scarf loosely draped',
    'a single oversized ring on the index finger',
    'a delicate layered necklace',
    'small stacked ear cuffs along one ear',
    'a watch with a worn leather strap',
    'a pair of slim headphones resting around the neck',
    'nothing extra — clean and unadorned',
  ],

  wardrobeFeminine: [
    'a soft baby-blue cardigan over a light camisole',
    'a simple cream silk blouse',
    'a relaxed linen shirt in warm sand',
    'a charcoal fine-knit turtleneck',
    'a faded denim jacket over a white tee',
    'a soft sage wrap dress',
    'a pale terracotta knit vest over a collared shirt',
  ],
  wardrobeMasculine: [
    'a sage linen shirt with the top buttons open',
    'a charcoal crew-neck knit over a white tee',
    'an olive canvas work jacket',
    'a simple white oxford shirt, sleeves rolled',
    'a soft grey marl hoodie',
    'a worn indigo denim jacket',
    'a cream brushed-cotton shirt',
  ],
  wardrobeAndrogynous: [
    'an oversized oatmeal knit sweater',
    'a clean white shirt with a soft collar',
    'a muted slate chore jacket',
    'a relaxed grey crew-neck sweatshirt',
    'a sand-coloured linen overshirt',
  ],

  artStyle: [
    'oil painting with visible directional brushwork, loaded impasto in the lit planes, deep transparent glazes in the shadow planes, classical portrait sensibility with a modern editorial edge',
    'rich gouache painting with visible brush strokes and layered opaque darks, slightly naive proportions, contemporary picture-book sensibility painted by someone who understands value',
    'crisp ink-line illustration with dense gouache washes that build up real depth, magazine-cover feel, inked shadows rather than grey shading',
    'risograph-style portrait, two-colour halftone with a heavy ink layer, slight registration offset, pulpy paper texture',
    'mid-century editorial illustration, geometric and graphic, confident flat shapes with two deep accent colours and a solid dark ground',
    'charcoal and conté portrait with soft rubbed shadows and bright chalk highlights, archival tonal drawing on toned paper',
    'soft chalk pastel on dark tinted paper, smudgy deep shadows, a few sharp warm highlights, slightly impressionistic',
    'pen-and-ink line drawing with dense cross-hatching that carries the shadows, no grey wash, archival-portrait sensibility',
    'textured acrylic portrait with palette-knife passages, strong chiaroscuro, the darks built up thick and matte',
    'oil-painted editorial cover portrait, dramatic single-source lighting, rich saturated midtones and near-black shadow shapes',
  ],

  background: [
    'warm beige paper with subtle grain',
    'soft sage with a hint of paper texture',
    'pale terracotta gradient',
    'cool slate with paper grain',
    'cream with subtle warm texture',
    'soft peach wash',
    'muted lavender mist',
    'matte off-white',
    'warm cinnamon haze',
    'pale ochre with grain',
    'dusty teal flat colour',
  ],

  vibe: [
    'mid-laugh, eyes crinkling into a real smile',
    'a playful smirk just starting at the corner of the mouth',
    'quietly amused, eyes nearly closing into a smile',
    'bright open joy, head tilted with delight',
    'a knowing grin, eyes alive with mischief',
    'caught mid-thought with a small private smile',
    'warm and engaged, eyes catching the viewer',
    'cool confidence with a slight raised eyebrow, charming and direct',
    'a delighted laugh frozen mid-moment',
    'a soft chic smile with sparkle in the eyes',
  ],

  beard: [
    'a clean smooth face — no beard',
    'a clean smooth face — no beard',
    'a soft short stubble', 'a neat trimmed beard', 'a full soft beard',
  ],

  headAngle: [
    'three-quarter angle to the left, head tilted with curiosity, gaze meeting the camera',
    'three-quarter angle to the right, mid-turn as if just noticed something',
    'nearly frontal with a playful head tilt and a soft smile',
    'looking back over the shoulder with a quick warm glance',
    'leaning forward a little, fresh open gaze',
    'head tipped slightly back in mid-laugh, eyes crinkled',
    'almost-frontal, head cocked to the side with a small smile',
    'three-quarter angle, hand-near-chin pose, thinking but amused',
    'profile turning toward the camera with a soft natural smile',
  ],
};

/* ─────────── 各年龄段专属池（覆盖上面的默认值） ───────────
   原则：
   - 孩子：不能有胡子/耳环/戒指，皮肤是小孩的，衣服是小孩的
   - 老人：必须有真实的年龄痕迹（纹路、银发），不能磨平成中年人
   未列出的维度沿用默认池。
*/
export const BAND_POOLS = {
  child: {
    presentation: [
      "a child's round soft face with bright curious eyes and plump cheeks",
      "a child's open friendly face, small nose, wide clear eyes",
      "a child's delicate features, soft skin, a gap-toothed grin",
      "a child's sturdy round face with warm watchful eyes",
    ],
    skin: [
      "smooth child's skin, warm cream",
      "smooth child's skin, soft beige with a natural flush on the cheeks",
      "smooth child's skin, light honey",
      "smooth child's skin, deep warm brown",
    ],
    hairColor: [
      'soft towhead blond', 'warm chestnut brown', 'inky black',
      'copper red', 'deep brown with sun-bleached ends', 'straight jet black',
    ],
    hairStyle: [
      "a child's short tousled bowl cut",
      "two small pigtails tied with simple elastics",
      "a neat short crop with a side part",
      "loose shoulder-length hair with a crooked part",
      "a slightly messy fringe and hair that will not lie flat",
      "small braids gathered at the back",
    ],
    glasses: ['no glasses', 'no glasses', 'small round translucent frames'],
    accessory: [
      'nothing extra', 'a small cloth hair tie', 'a tiny plaster on one finger',
      'nothing extra', 'a slightly crooked collar',
    ],
    wardrobe: [
      "a striped cotton t-shirt",
      "a small knitted jumper over a collared shirt",
      "a faded denim dungarees over a long-sleeve tee",
      "a soft corduroy shirt, sleeves rolled up twice",
      "a simple school sweatshirt",
    ],
    beard: ['a clean, smooth child\'s face — no facial hair at all'],
    vibe: [
      'grinning wide with a gap-toothed smile, eyes bright',
      'looking up with frank open curiosity',
      'caught mid-laugh, whole face lit up',
      'a shy half-smile, peeking out from behind their own shoulder',
      'a serious, thoughtful little frown of concentration',
      'a mischievous grin, about to do something they should not',
    ],
  },

  teen: {
    presentation: [
      'youthful adolescent features, still settling into the face',
      'a teenage face with clear eyes and a slightly awkward openness',
      'angular teenage features, a hint of the adult face to come',
      'soft adolescent features with a bright direct gaze',
    ],
    skin: [
      "teenage skin with a faint natural flush", 'clear youthful skin, warm cream',
      'young skin, light olive', 'smooth brown skin with warm undertones',
    ],
    wardrobe: [
      'an oversized hoodie', 'a simple band t-shirt under an open flannel',
      'a school blazer worn loose over a tee', 'a plain crew-neck sweatshirt',
      'a denim jacket covered in small enamel pins',
    ],
    beard: ['a clean smooth face — no facial hair yet', 'a faint wispy first stubble'],
  },

  prime: {
    presentation: [
      'adult features with real character, the first faint lines at the eyes but nothing settled into age yet',
      'a grown-up face with clear bone structure and an easy, unforced confidence',
      'adult features, expressive and distinct, at the point where the face has become itself',
      'a mature-but-not-aged face with strong eye contact and quiet presence',
      'grown-up features with character, a face that has stopped being young but has not started being old',
    ],
    skin: [
      'adult skin with a little natural texture', 'warm skin with honest texture and a few fine lines',
      'skin with faint expression lines at the eyes', 'warm clear skin with a natural finish',
    ],
    hairColor: [
      'dark brown with the first grey at the temples',
      'soft espresso brown', 'warm chestnut', 'deep black', 'cool ash brown',
      'auburn with a hint of grey', 'dark blonde', 'jet black',
    ],
    wardrobe: [
      'a fine-gauge knit over a collared shirt',
      'a soft wool blazer over a plain tee',
      'a good cotton shirt with the collar open',
      'a relaxed linen overshirt',
      'a dark denim jacket over a crew-neck',
      'a textured knit cardigan',
    ],
    beard: [
      'a clean smooth face', 'a short neat stubble', 'a trimmed beard',
      'a clean smooth face', 'light stubble along the jaw',
    ],
  },

  mid: {
    presentation: [
      'settled adult features with character, faint expression lines at the eyes',
      'a lived-in face with real character and warmth around the eyes',
      'strong adult features, softened by a few years of real life',
      'a mature face with clear bone structure and an easy warmth',
    ],
    skin: [
      'warm skin with the first fine lines', 'skin with natural texture and a few sun freckles',
      'maturing skin with honest texture', 'warm skin showing its history lightly',
    ],
    hairColor: [
      'salt-and-pepper dark brown', 'a rich brown threaded with grey',
      'deep black with grey at the temples', 'warm chestnut going softly grey',
      'dark auburn with silver strands',
    ],
    wardrobe: [
      'a well-worn chambray shirt', 'a soft merino crew-neck over a collared shirt',
      'a textured wool jacket', 'a simple linen shirt with the sleeves rolled',
      'a quilted gilet over a fine knit',
    ],
  },

  senior: {
    presentation: [
      'mature features with real depth, smile lines firmly set',
      'a face that has been lived in — deep laugh lines and kind eyes',
      'distinguished older features, strong bone structure, softened skin',
      'a warm weathered face with real presence',
    ],
    skin: [
      'skin with real age lines at the eyes and mouth',
      'mature skin with sun history and soft wrinkles',
      'skin creased by years of laughing',
      'warm older skin with honest texture',
    ],
    hairColor: [
      'silver white', 'iron grey', 'soft white with a hint of steel',
      'silver threaded through dark hair', 'pure white',
    ],
    hairStyle: [
      'short silver hair combed back', 'a neat silver crop',
      'hair pulled back into a low bun, silver at the temples',
      'a soft grey bob with a side part',
      'short cropped silver hair',
    ],
    wardrobe: [
      'a soft tweed jacket over a knitted vest', 'a good cotton shirt buttoned to the collar',
      'a lambswool cardigan over a checked shirt', 'a simple dark knit with a soft scarf',
      'a well-cut wool overcoat',
    ],
    accessory: [
      'a pair of reading glasses pushed up', 'a slim leather-strap watch',
      'a simple gold wedding band', 'a thin silver chain',
      'nothing extra', 'a soft knitted scarf',
    ],
  },

  elder: {
    presentation: [
      'deeply lined features, wise and warm eyes, a face full of history',
      'fragile-boned older features with pale clear eyes',
      'a very old face, deeply kind, with fine translucent skin',
      'an elderly face with soft deep creases and steady eyes',
    ],
    skin: [
      'thin, finely lined very old skin', 'pale skin with deep gentle creases',
      'deeply weathered skin with real texture', 'soft translucent older skin',
    ],
    hairColor: ['pure white', 'snow white', 'white with a faint silver sheen'],
    hairStyle: [
      'fine white hair combed back', 'a sparse soft white crop',
      'white hair gathered into a small bun', 'a soft white bob',
      'very short white hair',
    ],
    wardrobe: [
      'a soft cardigan buttoned over a cotton blouse',
      'a warm wool shawl over a simple collar',
      'a knitted waistcoat over a checked shirt',
      'a soft brushed-cotton shirt',
      'a simple dark jacket with a warm scarf',
    ],
    accessory: [
      'small round spectacles', 'a slim watch on a worn strap',
      'a plain gold ring', 'a hearing-aid tucked behind one ear',
      'nothing extra',
    ],
    beard: [
      'a neat white beard', 'a soft white stubble', 'a clean-shaven lined face',
      'a short white moustache',
    ],
  },
};

/* 13 个 salt —— 每个维度独立，避免维度之间相关 */
const SALTS = {
  age:         0x9E3779B9,
  presentation:0x85EBCA6B,
  skin:        0xC2B2AE35,
  hairColor:   0x27D4EB2F,
  hairStyle:   0x165667B1,
  signature:   0x3A4F1B7D,
  glasses:     0xD8163841,
  accessory:   0xA1B5E5A7,
  wardrobe:    0x53C5DA4D,
  artStyle:    0xB7E15162,
  background:  0x6F4A7E13,
  vibe:        0xE9B5DBE1,
  headAngle:   0xCB1AB31F,
  beard:       0x7C3E2A91,
};

export function visualSignatureFor(agentId, gender = 'androgynous', ageBand = 'young') {
  const h = hashStr(agentId);
  const P = POOLS;
  const band = BAND_POOLS[ageBand] || {};
  // 年龄段专属池优先；没定义就回落到性别/默认池
  const pick = (key, fallbackArr) => {
    const arr = band[key] || fallbackArr;
    return pickFromHash(arr, h, SALTS[key] ?? SALTS.age);
  };
  const presentationPool =
    gender === 'feminine' ? P.presentationFeminine
    : gender === 'masculine' ? P.presentationMasculine
    : P.presentationAndrogynous;
  const hairStylePool =
    gender === 'feminine' ? P.hairStyleFeminine
    : gender === 'masculine' ? P.hairStyleMasculine
    : P.hairStyleAndrogynous;
  const wardrobePool =
    gender === 'feminine' ? P.wardrobeFeminine
    : gender === 'masculine' ? P.wardrobeMasculine
    : P.wardrobeAndrogynous;

  const agePool = (AGE_BANDS[ageBand] || AGE_BANDS.young).ages;

  return {
    band:         ageBand,
    age:          pickFromHash(agePool,        h, SALTS.age),
    presentation: band.presentation ? pick('presentation') : pickFromHash(presentationPool, h, SALTS.presentation),
    skin:         band.skin         ? pick('skin')         : pickFromHash(P.skin,        h, SALTS.skin),
    hairColor:    band.hairColor    ? pick('hairColor')    : pickFromHash(P.hairColor,   h, SALTS.hairColor),
    hairStyle:    band.hairStyle    ? pick('hairStyle')    : pickFromHash(hairStylePool, h, SALTS.hairStyle),
    signature:    pickFromHash(P.signature,    h, SALTS.signature),
    glasses:      band.glasses      ? pick('glasses')      : pickFromHash(P.glasses,     h, SALTS.glasses),
    accessory:    band.accessory    ? pick('accessory')    : pickFromHash(P.accessory,   h, SALTS.accessory),
    wardrobe:     band.wardrobe     ? pick('wardrobe')     : pickFromHash(wardrobePool,  h, SALTS.wardrobe),
    beard:        gender === 'feminine' ? 'a clean smooth face — no beard, no moustache, no stubble' : band.beard ? pick('beard') : pickFromHash(P.beard || ['a clean smooth face'], h, SALTS.beard ?? 0x1234567),
    artStyle:     pickFromHash(P.artStyle,     h, SALTS.artStyle),
    background:   pickFromHash(P.background,   h, SALTS.background),
    vibe:         band.vibe        ? pick('vibe')        : pickFromHash(P.vibe,        h, SALTS.vibe),
    headAngle:    pickFromHash(P.headAngle,    h, SALTS.headAngle),
    gender,
  };
}

/* ─────────── prompt 模板（人物插画与构图规则） ─────────── */
export const COMPOSITION_RULE = '- Single subject, head-and-shoulders, final square canvas, head horizontally centred for a natural circular crop. Keep the complete head, including all hair and any head-top accessories (glasses, hats, etc.), fully inside the frame and circular crop without clipping. Target top headroom of 7% of the final square canvas height (acceptable range: 6–8%), measured as uninterrupted background from the highest hair strand or head-top accessory, whichever is highest, to the top edge; never measure from the forehead or scalp. Continue the existing background to the edges; do not add a white border.';

export function buildPrompt({ name, role, persona, id, gender = 'androgynous', ageBand = 'young' }) {
  const v = visualSignatureFor(id, gender, ageBand);

  // 年龄对应的自称与「必须看起来像几岁」的硬规则（不能所有年龄段都写"必须年轻"）
  // 开场白也要按年龄段换 —— 不能对 4 岁小孩写 "a face you'd notice in a coffee shop"
  const OPENING = {
    child: `Draw ${name} — a young character, drawn as an illustration. This is a drawn character in a painted or illustrated style, not a photograph and not a portrait of an actual person.`,
    kid: `Draw ${name} — a young character, drawn as an illustration. This is a drawn character in a painted or illustrated style, not a photograph and not a portrait of an actual person.`,
    teen: `Draw ${name} — a young person with real presence. Not a "model type", not a yearbook photo. The look a teenager has when they are not performing for anyone.`,
    young: `Draw ${name} — a striking, characterful individual. Beautiful in a distinctive, interesting way (not a generic "model type", not a "professional headshot"). The kind of person you'd notice in a coffee shop because their face has personality.`,
    prime: `Draw ${name} — a grown adult with real presence. Not a corporate headshot, not a stock photo. The look someone has when the camera catches them off guard and they simply meet it.`,
    mid: `Draw ${name} — a person with a real face and a real life behind it. Not a corporate headshot, not a stock photo. The look someone has when the camera catches them off guard.`,
    senior: `Draw ${name} — an older person with a face worth painting. Not a "senior stock photo", not airbrushed. The look someone has after a lifetime of being themselves.`,
    elder: `Draw ${name} — an elderly person whose face holds a whole life. Not sentimental, not frail-stereotype, not airbrushed. The look someone has when they have stopped caring what anyone thinks.`,
  };

  const AGE_CLAUSE = {
    child: {
      who: `a child of about ${v.age}`,
      rule: `- This is an ILLUSTRATED CHILD CHARACTER, clearly drawn, never photoreal. Child proportions and a child's simple haircut, but rendered as art — no photographic skin texture, no camera lens, no stock-photo realism.`,
      mood: `bright and unguarded, mid-laugh or mid-thought, the energy of a child who has forgotten they are being drawn`
    },
    teen: {
      who: `a teenager of about ${v.age}`,
      rule: `- Must read as a TEENAGER of about ${v.age} — adolescent proportions, still-settling features. Not a small adult, not a child.`,
      mood: `a little self-conscious and a little defiant, caught between kid and adult`,
    },
    young: {
      who: `a young adult of about ${v.age}`,
      rule: `- Must read as a YOUNG ADULT of about ${v.age} (early 20s to early 30s) — never 35+, never weathered.`,
      mood: `alive, candid, caught mid-moment`,
    },
    prime: {
      who: `an adult of about ${v.age}`,
      rule: `- Must read as a real ADULT of about ${v.age} — grown-up bone structure, a settled face, at most a few faint expression lines. Not a teenager, not a smooth twentysomething, and not middle-aged yet.`,
      mood: `relaxed and direct, at ease in their own skin`,
    },
    mid: {
      who: `an adult of about ${v.age}`,
      rule: `- Must read as a real adult of about ${v.age} — settled features, the beginning of real expression lines. Not smoothed into youth, not aged into old age.`,
      mood: `settled and comfortable in their own face, with real warmth`,
    },
    senior: {
      who: `an older person of about ${v.age}`,
      rule: `- Must read as an OLDER PERSON of about ${v.age} — genuine age lines, silver/white hair, skin that has lived. Do NOT smooth or de-age the face.`,
      mood: `warm, dignified, with the humour of someone who has seen a lot`,
    },
    elder: {
      who: `an elderly person of about ${v.age}`,
      rule: `- Must read as an ELDERLY person of about ${v.age} — deep lines, thin translucent skin, white hair, elderly bone structure. Do NOT smooth, do NOT de-age, do NOT make them middle-aged.`,
      mood: `calm, deeply kind, a whole life visible in the face`,
    },
  }[ageBand] || {
    who: `a person of about ${v.age}`,
    rule: `- Must read as a person of about ${v.age}.`,
    mood: `alive and candid`,
  };

  const ac = AGE_CLAUSE;

  const genderClause =
    gender === 'feminine'
      ? `${name} is ${ac.who}, a female character with softly feminine features and styling.`
      : gender === 'masculine'
        ? `${name} is ${ac.who}, with clearly masculine features and presentation.`
        : `${name} is ${ac.who}, whose gender presentation is intentionally androgynous and refined.`;
  const hint = (persona ?? '').slice(0, 240);

  return [
    `${OPENING[ageBand] || OPENING.young} ${ac.mood}. ${genderClause}`,

    ``,
    `Who ${name} is. EVERY detail below is required and must be visible:`,
    `• Apparent age: ${v.age} years old (look exactly this age — no older, no younger)`,
    `• Build / presentation: ${v.presentation}`,
    `• Skin: ${v.skin}`,
    `• Hair: ${v.hairStyle} — coloured ${v.hairColor}`,
    `• A distinctive feature: ${v.signature}  ← include this clearly`,
    `• Eyewear: ${v.glasses}`,
    `• Wearing: ${v.wardrobe}`,
    `• Accessory: ${v.accessory}`,
    `• Facial hair: ${v.beard}`,

    ``,
    `Pose & emotional tone:`,
    `• Framing: ${v.headAngle}`,
    `• Vibe right now: ${v.vibe}`,
    role ? `• Their role: ${role}` : '',
    hint ? `• Inner essence the face should hint at: ${hint}` : '',

    ``,
    `RENDER STYLE — this defines the artistic identity:`,
    `${v.artStyle}.`,
    `Background: ${v.background}.`,

    ``,
    `LIGHT & VALUE RANGE — this is what gives the portrait weight (highest priority):`,
    `- Render the FULL tonal range. The darkest passages (hair mass, deep folds, the shadow side of the face, the background behind the shoulder) must go to near-black, roughly 5–15% luminance — never stop at grey.`,
    `- Aim for a real contrast spread: dark areas around 15–20% luminance, lit skin around 80–90%, nothing flat in the middle.`,
    `- One clear directional key light from one side, with the opposite side falling into genuine shadow. Not evenly lit, not flat, not selfie-lit.`,
    `- Shadows are shapes with edges, not a global darkening filter. Build them with real pigment/dark line, not by dulling the whole image.`,
    `- At least a quarter of the frame should read as clearly dark. A washed-out, high-key pastel result is a failure.`,

    ``,
    `Skin & line quality:`,
    `- Skin should look like real skin in honest light — not shiny, not wet, not airbrushed.`,
    `- No makeup highlighter, no glossy lip highlights, no contouring.`,
    `- Line weight should be confident and deliberate, never sketchy or wobbly.`,
    `- Textural grain belongs in the background and clothing, not as highlights on the face.`,

    ``,
    `Hard rules:`,
    COMPOSITION_RULE,
    `- This is ${name}, not a stand-in. Lean hard into the specific features above; do not soften them toward an average.`,
    ac.rule,
    `- The pose must feel ALIVE and CANDID — never stiff, never "official headshot", never "model gaze".`,
    `- Distinctive and full of personality — striking features, a real face. Avoid a generic "average face".`,
    `- Respect the gender presentation above; do not contradict it.`,
    `- No nudity, no suggestive styling, no glamour posing.`,
    `- No text. No logos. No background figures. No stock-photo realism. No anime / chibi. No sultry glamour.`,
    `- Should feel like a profile in a magazine that cares who this person is — Kinfolk / Cereal / Refinery29 energy.`,
  ].filter(Boolean).join('\n');
}

export function signatureCard(name, gender, ageBand = 'young') {
  const v = visualSignatureFor(name, gender, ageBand);
  return { name, gender, band: ageBand, hash: '0x' + hashStr(name).toString(16), ...v };
}

/* ─────────── CLI ─────────── */
// 名字格式：Name:gender[:band]   例: Maggie:feminine:senior
const USAGE = '用法: node code/portrait-style.mjs cards|prompt <Name:gender:band> ...\n      node code/portrait-style.mjs batch <输出目录> <Name:gender:band> ...';
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(0);
}
if (!['cards', 'prompt', 'batch'].includes(cmd) ||
    (cmd === 'prompt' && rest.length !== 1) ||
    (cmd === 'cards' && rest.length < 1) ||
    (cmd === 'batch' && rest.length < 2)) {
  console.error(USAGE);
  process.exit(1);
}
const parseName = (s) => {
  const [n, g, b, extra] = s.split(':');
  const gender = g || 'androgynous', ageBand = b || 'young';
  if (!n || /[\\/\x00-\x1f]/.test(n) || ['.', '..'].includes(n) || extra !== undefined ||
      !['feminine', 'masculine', 'androgynous'].includes(gender) || !Object.hasOwn(AGE_BANDS, ageBand)) {
    console.error('无效人物参数；使用 Name:gender:band，性别和年龄段见 README。');
    process.exit(1);
  }
  return { name: n, gender, ageBand };
};
// Validate all names before batch creates or overwrites files.
for (const arg of cmd === 'batch' ? rest.slice(1) : rest) parseName(arg);

if (cmd === 'cards') {
  for (const arg of rest) {
    const { name, gender, ageBand } = parseName(arg);
    const c = signatureCard(name, gender, ageBand);
    console.log(`\n■ ${c.name}  [${c.gender}/${c.band}]  hash=${c.hash}`);
    console.log(`   age         ${c.age}`);
    console.log(`   face        ${c.presentation}`);
    console.log(`   skin        ${c.skin}`);
    console.log(`   hair        ${c.hairStyle}`);
    console.log(`               ${c.hairColor}`);
    console.log(`   feature     ${c.signature}`);
    console.log(`   glasses     ${c.glasses}`);
    console.log(`   beard       ${c.beard}`);
    console.log(`   outfit      ${c.wardrobe}`);
    console.log(`   accessory   ${c.accessory}`);
    console.log(`   art         ${c.artStyle}`);
    console.log(`   bg          ${c.background}`);
    console.log(`   vibe        ${c.vibe}`);
    console.log(`   angle       ${c.headAngle}`);
  }
} else if (cmd === 'prompt') {
  const { name, gender, ageBand } = parseName(rest[0]);
  console.log(buildPrompt({ name, id: name, gender, ageBand }));
} else if (cmd === 'batch') {
  const [outDir, ...names] = rest;
  fs.mkdirSync(outDir, { recursive: true });
  const meta = [];
  for (const arg of names) {
    const { name, gender, ageBand } = parseName(arg);
    const p = buildPrompt({ name, id: name, gender, ageBand });
    fs.writeFileSync(path.join(outDir, `${name}.txt`), p);
    meta.push(signatureCard(name, gender, ageBand));
  }
  fs.writeFileSync(path.join(outDir, '_signatures.json'), JSON.stringify(meta, null, 2));
  console.log(`✅ ${meta.length} 个 prompt 已写入 ${outDir}`);
} else {
  console.log('用法: node portrait-style.mjs cards|prompt|batch <名字:性别:年龄段> ...');
}
