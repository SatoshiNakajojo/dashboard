/* Poser les angles candidats SUR le texte peint et regarder lequel s'y couche. */
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const [src, sortie, spec] = process.argv.slice(2);
  const cas = JSON.parse(spec);
  const K = 5;
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent("<canvas id=c></canvas><style>body{margin:0}</style>");
  const png = await pg.evaluate(async ({ uri, cas, K }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = uri; });
    const W = Math.max(...cas.map(c => c.w)) * K;
    const H = cas.reduce((s, c) => s + c.h * K + 24, 0);
    const cv = document.getElementById("c");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#111"; c.fillRect(0, 0, W, H);
    let y = 0;
    for (const B of cas) {
      c.drawImage(img, B.x, B.y, B.w, B.h, 0, y, B.w * K, B.h * K);
      const cxp = B.w * K / 2, cyp = y + B.ancre * K;
      B.angles.forEach((a, i) => {
        const t = a * Math.PI / 180, L = B.w * K * 0.46;
        c.strokeStyle = ["#0ff", "#f0f", "#ff0"][i % 3];
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cxp - L * Math.cos(t), cyp - L * Math.sin(t));
        c.lineTo(cxp + L * Math.cos(t), cyp + L * Math.sin(t));
        c.stroke();
        c.fillStyle = ["#0ff", "#f0f", "#ff0"][i % 3];
        c.font = "bold 15px monospace";
        c.fillText(a + "°", cxp + L * Math.cos(t) + 4, cyp + L * Math.sin(t));
      });
      c.fillStyle = "#fff"; c.font = "bold 15px monospace";
      c.fillText(B.nom, 6, y + B.h * K + 17);
      y += B.h * K + 24;
    }
    return cv.toDataURL("image/png");
  }, { uri: "data:image/jpeg;base64," + fs.readFileSync(src).toString("base64"), cas, K });
  fs.writeFileSync(sortie, Buffer.from(png.split(",")[1], "base64"));
  await b.close();
})();
