// server.js - SneakerReels AI (poze intregi + 4 stiluri + captions + text pe video)
const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { generateCaption } = require("./captions");

const app = express();
const PORT = 3000;

// foldere de lucru (se creeaza singure)
const uploadsDir = path.join(__dirname, "uploads");
const videosDir = path.join(__dirname, "videos");
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

// primirea pozelor: pastram extensia, acceptam doar jpg/png/webp
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: { files: 10, fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /\.(jpe?g|png|webp)$/i.test(file.originalname));
  }
});

// ---------------------------------------------------------
// CELE 4 STILURI
// bars = inaltimea benzilor negre de sus si de jos (doar Cinematic)
// zoom = cat de puternica e miscarea
// ---------------------------------------------------------
const STYLES = {
  "Cinematic": {
    seconds: 4,
    fade: 0.8,
    zoom: 0.18,
    bars: 170,
    motions: ["zoomIn", "panLeft", "zoomOut", "panRight", "tiltUp"],
    transitions: ["fade", "fadeblack", "dissolve"],
    grade:
      "eq=contrast=1.12:saturation=0.9:brightness=-0.02," +
      "colorbalance=rs=-0.06:bs=0.08:rh=0.08:bh=-0.06," +
      "vignette=angle=PI/4," +
      "drawbox=x=0:y=0:w=iw:h=170:color=black:t=fill," +
      "drawbox=x=0:y=ih-170:w=iw:h=170:color=black:t=fill",
    fadeInOut: true
  },
  "Streetwear": {
    seconds: 2.6,
    fade: 0.35,
    zoom: 0.22,
    bars: 0,
    motions: ["zoomIn", "panRight", "zoomIn", "panLeft", "tiltUp"],
    transitions: ["slideleft", "wipeleft", "slideup", "pixelize", "hlslice"],
    grade:
      "eq=contrast=1.25:saturation=1.35:brightness=0.01," +
      "noise=alls=14:allf=t+u," +
      "unsharp=5:5:0.8",
    fadeInOut: false
  },
  "Luxury": {
    seconds: 4.5,
    fade: 1.0,
    zoom: 0.12,
    bars: 0,
    motions: ["zoomIn", "tiltUp", "zoomOut", "panRight"],
    transitions: ["fade", "dissolve", "fadeblack"],
    grade:
      "eq=contrast=1.1:saturation=0.8:brightness=-0.05," +
      "colorbalance=rm=0.06:gm=0.02:bm=-0.05:rh=0.07:bh=-0.07," +
      "vignette=angle=PI/3.2",
    fadeInOut: true
  },
  "TikTok Style": {
    seconds: 1.8,
    fade: 0.25,
    zoom: 0.35,
    bars: 0,
    motions: ["zoomIn", "zoomOut"],
    transitions: ["zoomin", "circleopen", "slideleft", "radial", "slideup", "fadewhite"],
    grade: "eq=contrast=1.15:saturation=1.4:brightness=0.03",
    fadeInOut: false
  }
};

// ---------------------------------------------------------
// FONTURI (cele care vin cu Windows) SI TEXTUL DE PE VIDEO
// ---------------------------------------------------------
const FONT_DIR = "C:/Windows/Fonts/";
const FONTS = {
  "Cinematic":    { font: "georgiab.ttf", upper: false },
  "Streetwear":   { font: "impact.ttf",   upper: true  },
  "Luxury":       { font: "times.ttf",    upper: false },
  "TikTok Style": { font: "arialbd.ttf",  upper: true  }
};

function findFont(name) {
  for (const f of [name, "arialbd.ttf", "arial.ttf"]) {
    if (fs.existsSync(FONT_DIR + f)) return FONT_DIR + f;
  }
  return null;
}

// FFmpeg vrea ca ":" din calea fontului sa fie scris "\:"
function ffPath(p) {
  return p.replace(/:/g, "\\:");
}

// imparte textul lung pe mai multe randuri
function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const w of words) {
    if (current && (current + " " + w).length > maxChars) {
      lines.push(current);
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
}

// un text care apare cu fade intre secundele a si b
function textFilter(fontPath, fileName, size, a, b, y) {
  const fi = 0.4;
  const alpha =
    `if(lt(t,${a.toFixed(2)}),0,` +
    `if(lt(t,${(a + fi).toFixed(2)}),(t-${a.toFixed(2)})/${fi},` +
    `if(lt(t,${(b - fi).toFixed(2)}),1,` +
    `if(lt(t,${b.toFixed(2)}),(${b.toFixed(2)}-t)/${fi},0))))`;
  return (
    `drawtext=fontfile='${ffPath(fontPath)}':textfile='${fileName}':expansion=none:` +
    `fontsize=${size}:fontcolor=white:line_spacing=12:` +
    `x=(w-text_w)/2:y=${y}:` +
    `box=1:boxcolor=black@0.5:boxborderw=26:alpha='${alpha}'`
  );
}

// ---------------------------------------------------------
// MISCAREA POZEI (fara sa taie nimic din ea)
// r = marimea pozei fata de cadrul maxim (1 = atinge marginile)
// ---------------------------------------------------------
function motionFor(type, zoom, bars, S) {
  const COS = `cos(PI*min(t/${S},1))`;
  const low = Math.max(0.6, 1 - zoom);
  const pan = Math.max(0.6, low - 0.04);

  let a = low;
  let b = 1;
  let x = "(W-w)/2";
  let y = "(H-h)/2";

  switch (type) {
    case "zoomOut":
      a = 1;
      b = low;
      break;
    case "panLeft":
      a = pan;
      b = pan + 0.06;
      x = `(W-w)/2+min(max((W-w)/2*0.9,0),160)*${COS}`;
      break;
    case "panRight":
      a = pan;
      b = pan + 0.06;
      x = `(W-w)/2-min(max((W-w)/2*0.9,0),160)*${COS}`;
      break;
    case "tiltUp":
      a = pan;
      b = pan + 0.06;
      y = `(H-h)/2+min(max(((H-h)/2-${bars})*0.85,0),200)*${COS}`;
      break;
    case "zoomIn":
    default:
      break;
  }

  const P = `((1-${COS})/2)`;
  const r = `(${a.toFixed(3)}+(${(b - a).toFixed(3)})*${P})`;
  return { r, x, y };
}

// creeaza videoclipul cu FFmpeg
function buildReel(photos, outputFile, styleName, info) {
  return new Promise((resolve, reject) => {
    const style = STYLES[styleName] || STYLES["Cinematic"];
    const fontInfo = FONTS[styleName] || FONTS["Cinematic"];
    const FPS = 30;
    const S = style.seconds;
    const F = style.fade;
    const FRAMES = Math.round(S * FPS);
    const n = photos.length;
    const total = n * S - (n - 1) * F;
    const bars = style.bars || 0;
    const boxH = 1920 - 2 * bars;

    const args = ["-y", "-hide_banner", "-loglevel", "error", "-nostdin"];
    photos.forEach(p => args.push("-i", p));

    const filters = [];

    // fiecare poza: fundal incetosat + poza intreaga deasupra, cu miscare
    photos.forEach((p, i) => {
      const motion = style.motions[i % style.motions.length];
      const m = motionFor(motion, style.zoom, bars, S);

      filters.push(`[${i}:v]format=yuv420p,split=2[a${i}][b${i}]`);

      // fundalul: aceeasi poza, umpluta pe tot cadrul si incetosata
      filters.push(
        `[a${i}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,` +
        `gblur=sigma=6,scale=1080:1920:flags=bicubic,` +
        `eq=brightness=-0.12:saturation=1.1,setsar=1,` +
        `loop=loop=${FRAMES - 1}:size=1:start=0,setpts=N/(${FPS}*TB)[bg${i}]`
      );

      // poza intreaga, incadrata in cadru, cu marire/micsorare
      filters.push(
        `[b${i}]scale=1080:${boxH}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1,` +
        `loop=loop=${FRAMES - 1}:size=1:start=0,setpts=N/(${FPS}*TB),` +
        `scale=w='trunc(iw*${m.r}/2)*2':h='trunc(ih*${m.r}/2)*2':eval=frame:flags=bicubic[fg${i}]`
      );

      // le punem una peste alta
      filters.push(
        `[bg${i}][fg${i}]overlay=x='${m.x}':y='${m.y}':eval=frame:shortest=1,` +
        `fps=${FPS},format=yuv420p[v${i}]`
      );
    });

    // tranzitii
    let last = "v0";
    for (let i = 1; i < n; i++) {
      const out = "x" + i;
      const transition = style.transitions[(i - 1) % style.transitions.length];
      const offset = (i * (S - F)).toFixed(3);
      filters.push(
        `[${last}][v${i}]xfade=transition=${transition}:duration=${F}:offset=${offset}[${out}]`
      );
      last = out;
    }

    // ---- text pe video ----
    const tempFiles = [];
    const textFilters = [];
    const fontPath = findFont(fontInfo.font);

    function addCard(label, text, size, a, b, y) {
      if (!fontPath || !text || b - a < 0.8) return;
      const name = "t-" + Date.now() + "-" + label + ".txt";
      fs.writeFileSync(path.join(uploadsDir, name), text, "utf8");
      tempFiles.push(path.join(uploadsDir, name));
      textFilters.push(textFilter(fontPath, name, size, a, b, y));
    }

    const fix = t => (fontInfo.upper ? t.toUpperCase() : t);
    const introEnd = Math.min(3.2, total * 0.5);
    const endStart = Math.max(introEnd + 0.3, total - 3.4);
    const endEnd = total - 0.1;

    if (info.model) {
      addCard("model", fix(wrapText(info.model, 18)), 70, 0.3, introEnd, "h*0.66");
    }
    if (info.showSales) {
      if (info.price) {
        addCard("pret", fix(info.price + " lei"), 96, endStart, endEnd, "h*0.58");
      }
      if (info.sizes) {
        addCard("marimi", fix(wrapText("Mărimi: " + info.sizes, 26)), 52, endStart, endEnd, "h*0.58+190");
      }
    }

    // culori, text, aparitie/disparitie
    const finalChain = [style.grade, ...textFilters];
    if (style.fadeInOut) {
      finalChain.push("fade=t=in:st=0:d=0.5");
      finalChain.push(`fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6`);
    }
    finalChain.push("format=yuv420p");
    filters.push(`[${last}]${finalChain.join(",")}[outv]`);

    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[outv]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-movflags", "+faststart",
      outputFile
    );

    // ffmpeg ruleaza din folderul "uploads" ca sa gaseasca fisierele text
    const ff = spawn("ffmpeg", args, { cwd: uploadsDir });
    let log = "";
    ff.stderr.on("data", d => {
      log = (log + d.toString()).slice(-4000);
    });
    ff.on("error", () => {
      tempFiles.forEach(f => fs.unlink(f, () => {}));
      reject(new Error("Nu pot porni FFmpeg."));
    });
    ff.on("close", code => {
      tempFiles.forEach(f => fs.unlink(f, () => {}));
      code === 0 ? resolve() : reject(new Error(log));
    });
  });
}

// pagina principala
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// videoclipurile gata facute
app.use("/videos", express.static(videosDir));

// generarea videoclipului
app.post("/generate", (req, res) => {
  upload.array("photos", 10)(req, res, async err => {
    if (err) {
      return res.status(400).json({ error: "Maxim 10 poze, fiecare sub 25 MB." });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({
        error: "Nu am primit poze valide. Folosește fișiere .jpg, .png sau .webp."
      });
    }

    const style = req.body.style;
    const objective = req.body.objective;
    console.log(`Cerere noua: ${files.length} poze | stil: ${style} | obiectiv: ${objective}`);

    const info = {
      model: cleanText(req.body.model, 60),
      price: cleanText(req.body.price, 10).replace(/[^\d.,]/g, ""),
      sizes: cleanText(req.body.sizes, 50),
      showSales: objective === "sales" || objective === "both"
    };

    const fileName = "reel-" + Date.now() + ".mp4";
    const outputFile = path.join(videosDir, fileName);

    try {
      await buildReel(files.map(f => f.path), outputFile, style, info);
      console.log("Videoclip gata: " + fileName);

      const text = generateCaption({
        objective: objective,
        style: style,
        model: req.body.model,
        price: req.body.price,
        sizes: req.body.sizes
      });
      res.json({ url: "/videos/" + fileName, caption: text.caption, hashtags: text.hashtags });
    } catch (e) {
      console.log("Eroare FFmpeg:\n" + e.message);
      res.status(500).json({ error: "Nu am putut crea videoclipul. Vezi detalii în terminal." });
    } finally {
      files.forEach(f => fs.unlink(f.path, () => {}));
    }
  });
});

app.listen(PORT, () => {
  console.log("SneakerReels AI funcționează!");
  console.log("Deschide în browser: http://localhost:" + PORT);
});
