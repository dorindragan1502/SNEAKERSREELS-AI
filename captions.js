// captions.js - generator de texte in romana pentru SneakerReels AI

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickMany(list, count) {
  const copy = [...list];
  const result = [];
  while (result.length < count && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(i, 1)[0]);
  }
  return result;
}

// prima propozitie, in functie de stil
const HOOKS = {
  "Cinematic": [
    "Unele perechi merită privite cu răbdare. 🎬",
    "Detaliile fac diferența. 🎞️",
    "Fiecare pas are o poveste. 👟"
  ],
  "Streetwear": [
    "Fit-ul începe de la pantofi. 👟🔥",
    "Asta e vibe-ul de oraș. 🏙️",
    "Stradă, stil, atitudine. 🔥"
  ],
  "Luxury": [
    "Eleganță în fiecare detaliu. ✨",
    "Când stilul nu are nevoie de explicații. 🖤",
    "Rafinament, pas cu pas. ✨"
  ],
  "TikTok Style": [
    "Stai, ai văzut perechea asta? 👀",
    "POV: găsești perechea perfectă 😍",
    "Dă-mi un semn dacă ți-ar plăcea și ție 👟"
  ]
};

// apeluri la actiune pentru cresterea paginii
const GROWTH_CTA = [
  "Urmărește pagina pentru mai mult conținut despre sneakers! 👟",
  "Salvează reel-ul și trimite-l unui prieten pasionat de sneakers. 📲",
  "Spune-ne în comentarii: ți-ar plăcea perechea asta? 👇"
];

// apeluri la actiune pentru vanzare
const SALES_CTA = [
  "Interesat? Scrie-ne în DM! 📩",
  "Pentru detalii și comenzi, trimite-ne un mesaj privat. 📩",
  "Îți place? Scrie-ne în DM și îți răspundem cât mai repede. 📩"
];

// hashtaguri
const BASE_TAGS = [
  "#sneakers", "#sneakerhead", "#sneakersromania", "#sneakeri",
  "#kicks", "#romania", "#bucuresti"
];
const GROWTH_TAGS = ["#reels", "#reelsromania", "#sneakerlover", "#kickstagram"];
const SALES_TAGS = ["#devanzare", "#sneakersforsale", "#sneakersshop"];
const STYLE_TAGS = {
  "Cinematic": ["#cinematic", "#sneakerfilm"],
  "Streetwear": ["#streetwear", "#streetstyle"],
  "Luxury": ["#luxurysneakers", "#luxurystyle"],
  "TikTok Style": ["#tiktokromania", "#fyp"]
};

// curata textul primit din formular
function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function generateCaption(options) {
  const objective = options.objective || "growth";
  const style = HOOKS[options.style] ? options.style : "Streetwear";
  const model = clean(options.model, 80);
  const price = clean(options.price, 20);
  const sizes = clean(options.sizes, 60);

  const wantsGrowth = objective === "growth" || objective === "both";
  const wantsSales = objective === "sales" || objective === "both";

  const lines = [pick(HOOKS[style])];

  // detalii de produs (doar pentru vanzare)
  if (wantsSales) {
    const details = [];
    if (model) details.push("👟 " + model);
    if (price) details.push("💰 " + price + " lei");
    if (sizes) details.push("📏 Mărimi disponibile: " + sizes);
    if (details.length > 0) lines.push(details.join("\n"));
  } else if (model) {
    lines.push("👟 " + model);
  }

  if (wantsSales) lines.push(pick(SALES_CTA));
  if (wantsGrowth) lines.push(pick(GROWTH_CTA));

  // hashtaguri
  let tags = pickMany(BASE_TAGS, 4);
  if (wantsGrowth) tags = tags.concat(pickMany(GROWTH_TAGS, 2));
  if (wantsSales) tags = tags.concat(pickMany(SALES_TAGS, 2));
  tags = tags.concat(pickMany(STYLE_TAGS[style], 2));
  tags = [...new Set(tags)];

  return {
    caption: lines.join("\n\n"),
    hashtags: tags.join(" ")
  };
}

module.exports = { generateCaption };