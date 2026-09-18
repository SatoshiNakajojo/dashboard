"""
Icônes de l'app, dérivées du logo du club.

Une seule source — `assets/brand/logo-source.jpg` — et toutes les tailles en
sortent : PWA, écran d'accueil iOS, icône adaptative Android, splash. Les
regénérer après un changement de logo est une commande, pas une séance de
retouche.

    python3 scripts/make-icons.py
"""

from PIL import Image, ImageDraw
import os

SOURCE = "assets/brand/logo-source.jpg"
INK = (0x0A, 0x08, 0x06)  # le fond encre de l'app

def trimmed_logo() -> Image.Image:
    """Le logo débarrassé de sa marge noire, en RGBA."""
    logo = Image.open(SOURCE).convert("RGB")

    # Le fond du fichier est un noir presque pur ; on isole le dessin pour
    # recadrer au plus juste, sinon la marge d'origine décentre tout.
    mask = logo.point(lambda v: 255 if v > 40 else 0).convert("L")
    box = mask.getbbox()
    if box:
        logo = logo.crop(box)

    # Carré : le logo est un disque, il ne doit pas s'ovaliser.
    side = max(logo.size)
    square = Image.new("RGB", (side, side), INK)
    square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))

    # Découpe circulaire. Le noir du fichier source (#0D0D0D) n'est pas notre
    # encre (#0A0806) : sans ce masque, un carré plus clair se voit derrière le
    # disque. Le logo *étant* un disque, on ne perd rien.
    mask = Image.new("L", (side * 4, side * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side * 4 - 1, side * 4 - 1), fill=255)
    out = square.convert("RGBA")
    out.putalpha(mask.resize((side, side), Image.LANCZOS))
    return out

def render(logo: Image.Image, size: int, path: str, coverage: float, bg=INK) -> None:
    """Pose le logo, centré, occupant `coverage` du carré."""
    S = size * 4  # supersampling : les lettres du pourtour sont fines
    canvas = Image.new("RGB", (S, S), bg)
    target = round(S * coverage)
    scaled = logo.resize((target, target), Image.LANCZOS)
    offset = (S - target) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    canvas.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(f"  {path}  {size}×{size}")

def main() -> None:
    logo = trimmed_logo()
    os.makedirs("public", exist_ok=True)
    os.makedirs("assets", exist_ok=True)

    print("PWA :")
    # Le disque touche presque le bord : une marge de 4 % l'empêche d'être rogné.
    render(logo, 192, "public/icon-192.png", 0.92)
    render(logo, 512, "public/icon-512.png", 0.92)
    # Maskable : Android rogne jusqu'à 20 %. Le lettrage du pourtour doit tenir
    # dans la zone sûre, sinon « CRYPTOS CLUB » se fait couper.
    render(logo, 512, "public/icon-maskable-512.png", 0.62)
    # iOS n'accepte pas la transparence et arrondit lui-même les angles.
    render(logo, 180, "public/apple-touch-icon.png", 0.92)

    print("Application :")
    render(logo, 1024, "assets/icon.png", 0.92)
    # Icône adaptative Android : même zone sûre que la version maskable.
    render(logo, 1024, "assets/android-icon-foreground.png", 0.62)
    render(logo, 1024, "assets/android-icon-monochrome.png", 0.62)
    # Splash : le logo respire, le fond fait le reste.
    render(logo, 512, "assets/splash-icon.png", 0.80)
    # Marque affichée dans l'app (écran de connexion).
    render(logo, 512, "assets/brand/logo.png", 1.0)

    print("Favicon :")
    render(logo, 64, "assets/favicon.png", 0.92)

if __name__ == "__main__":
    main()
