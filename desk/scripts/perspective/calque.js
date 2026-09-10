/* Poser les quads releves sur le DESSIN par-dessus la PHOTO.
 * Un chiffre juste sur le dessin ne vaut rien si le dessin n'est pas cale
 * sur la photo : c'est cette superposition-la qu'il faut voir, pas la liste. */
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const [fond, regionsJson, sortie, n] = process.argv.slice(2);
  const R = JSON.parse(fs.readFileSync(regionsJson, "utf8"));
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: R.W, height: R.H } });
  const uri = "data:image/jpeg;base64," + fs.readFileSync(fond).toString("base64");
  await pg.setContent("<canvas id=c></canvas><style>body{margin:0}</style>");
  const png = await pg.evaluate(async ({ uri, R, n }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = uri; });
    const cv = document.getElementById("c");
    cv.width = R.W; cv.height = R.H;
    const c = cv.getContext("2d");
    c.drawImage(img, 0, 0, R.W, R.H);
    c.lineWidth = 2.5;
    c.font = "bold 20px monospace";
    R.mesures.slice(0, n).forEach((m, i) => {
      const q = m.quad.map(([x, y]) => [x * R.W / 100, y * R.H / 100]);
      const t = `hsl(${(i * 47) % 360} 100% 55%)`;
      c.strokeStyle = t; c.beginPath();
      q.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath(); c.stroke();
      const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
      c.fillStyle = "#000"; c.fillRect(cx - 15, cy - 13, 30, 24);
      c.fillStyle = t; c.fillText(String(i), cx - 11, cy + 5);
    });
    return cv.toDataURL("image/png");
  }, { uri, R, n: Number(n) });
  fs.writeFileSync(sortie, Buffer.from(png.split(",")[1], "base64"));
  await b.close();
  console.log("ecrit " + sortie);
})();
