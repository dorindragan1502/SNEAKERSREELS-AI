// test-video.js - primul test: poze -> video 9:16 cu zoom si tranzitii
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const photosFolder = path.join(__dirname, "test-photos");
const outputFile = path.join(__dirname, "test-reel.mp4");

const SECONDS = 3.5;                 // cat dureaza fiecare poza
const FPS = 30;
const FRAMES = Math.round(SECONDS * FPS);
const FADE = 0.5;                    // durata tranzitiei

// 1. Cautam pozele din folder
if (!fs.existsSync(photosFolder)) {
  console.log("Nu gasesc folderul 'test-photos'. Creeaza-l si pune poze in el.");
  process.exit(1);
}

const photos = fs.readdirSync(photosFolder)
  .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
  .sort()
  .slice(0, 5)
  .map(f => path.join(photosFolder, f));

if (photos.length === 0) {
  console.log("Folderul 'test-photos' nu contine poze (.jpg, .png, .webp).");
  process.exit(1);
}

console.log("Folosesc " + photos.length + " poze. Se creeaza videoclipul...");

// 2. Construim comanda pentru FFmpeg
const args = ["-y"];
photos.forEach(p => args.push("-i", p));

const filters = [];

// fiecare poza: umple cadrul 9:16 si primeste un zoom lent
photos.forEach((p, i) => {
  filters.push(
    `[${i}:v]scale=2160:3840:force_original_aspect_ratio=increase,` +
    `crop=2160:3840,setsar=1,` +
    `zoompan=z='1+0.25*on/${FRAMES}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${FRAMES}:s=1080x1920:fps=${FPS},format=yuv420p[v${i}]`
  );
});

// legam pozele cu tranzitii
let last = "v0";
for (let i = 1; i < photos.length; i++) {
  const out = "x" + i;
  filters.push(
    `[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${i * (SECONDS - FADE)}[${out}]`
  );
  last = out;
}

args.push(
  "-filter_complex", filters.join(";"),
  "-map", `[${last}]`,
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-r", String(FPS),
  "-movflags", "+faststart",
  outputFile
);

// 3. Rulam FFmpeg
const ffmpeg = spawn("ffmpeg", args, { stdio: "inherit" });

ffmpeg.on("error", () => {
  console.log("Nu pot porni FFmpeg. Inchide si redeschide VS Code, apoi incearca din nou.");
});

ffmpeg.on("close", code => {
  if (code === 0) {
    console.log("\nGATA! Videoclipul este: " + outputFile);
  } else {
    console.log("\nA aparut o eroare. Copiaza textul de mai sus si trimite-mi-l.");
  }
});