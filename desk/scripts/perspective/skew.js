/* L'angle du texte peint, par profil de projection.
 *
 * On ne cherche plus « le bas des lettres » : un biseau brillant au bord de
 * la boite suffisait a le faire mentir de dix degres. On fait tourner la
 * vignette et on retient l'angle ou l'encre se range le mieux en lignes —
 * quand la ligne de base est horizontale, le profil par rangee est un
 * creneau franc ; de travers, il s'etale. C'est la mesure de biais
 * classique, et elle ne depend d'aucun pixel en particulier.
 */
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const src = process.argv[2];
  const cas = JSON.parse(process.argv[3]);
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent("<canvas id=c></canvas>");
  const out = await pg.evaluate(async ({ uri, cas }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = uri; });
    const cv = document.getElementById("c");
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const res = [];
    for (const B of cas) {
      // On dessine une source PLUS LARGE que la fenetre d'analyse, pour que
      // celle-ci reste entierement couverte a tous les angles. Sans ca, le
      // bord transparent de la vignette tournee est la transition la plus
      // franche de l'image et le score choisit toujours zero degre : le
      // detecteur mesurait son propre cadre.
      const marge = Math.ceil((Math.abs(B.w) + Math.abs(B.h)) * 0.32) + 6;
      const SW = B.w + 2 * marge, SH = B.h + 2 * marge;
      cv.width = SW; cv.height = SH;
      let best = null;
      const scores = [];
      for (let a = -16; a <= 16.0001; a += 0.25) {
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.clearRect(0, 0, SW, SH);
        cx.translate(SW / 2, SH / 2);
        cx.rotate(-a * Math.PI / 180);          // redresser
        cx.drawImage(img, B.x - marge, B.y - marge, SW, SH, -SW / 2, -SH / 2, SW, SH);
        cx.setTransform(1, 0, 0, 1, 0, 0);
        // n'analyser que la fenetre centrale, toujours pleine
        const d = cx.getImageData(marge, marge, B.w, B.h).data;
        const n = B.w * B.h;
        const lum = new Float64Array(n);
        const vus = new Float64Array(n);
        for (let i = 0, q = 0; i < n; i++, q += 4) {
          lum[i] = 0.2126 * d[q] + 0.7152 * d[q+1] + 0.0722 * d[q+2];
          vus[i] = lum[i];
        }
        const tri = Array.from(vus).sort((u, v) => u - v);
        const med = tri[tri.length >> 1];
        const prof = new Float64Array(B.h);
        for (let y = 0; y < B.h; y++) {
          let sm = 0;
          for (let x = 0; x < B.w; x++) sm += Math.abs(lum[y * B.w + x] - med);
          prof[y] = sm;
        }
        let sc = 0;
        for (let y = 1; y < B.h; y++) { const dd = prof[y] - prof[y-1]; sc += dd * dd; }
        scores.push([a, sc]);
        if (!best || sc > best[1]) best = [a, sc];
      }
      const i = scores.findIndex((s) => s[0] === best[0]);
      let fin = best[0];
      if (i > 0 && i < scores.length - 1) {
        const [y0, y1, y2] = [scores[i-1][1], scores[i][1], scores[i+1][1]];
        const den = y0 - 2 * y1 + y2;
        if (den !== 0) fin = best[0] + 0.125 * (y0 - y2) / den * 2;
      }
      res.push({ nom: B.nom, angle: fin });
    }
    return res;
  }, { uri: "data:image/jpeg;base64," + fs.readFileSync(src).toString("base64"), cas });
  await b.close();
  for (const r of out) console.log(`  ${r.nom.padEnd(12)} ${r.angle.toFixed(2).padStart(7)}`);
})();
