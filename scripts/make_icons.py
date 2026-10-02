"""Dibuja los íconos de Coberturas (la entrada de fiesta sobre la noche). Uso: python scripts/make_icons.py (requiere Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
NIGHT = (34, 24, 61)       # #22183d
PISTA = (251, 238, 242)    # #fbeef2
COBALT = (47, 63, 216)     # #2f3fd8
FLASH = (255, 212, 71)     # #ffd447
S = 4                      # supermuestreo para bordes suaves
N = 1024 * S


def p(v):
    return int(v * S)


def ticket():
    img = Image.new('RGB', (N, N), NIGHT)
    d = ImageDraw.Draw(img)
    # Todo dentro de la zona segura de los íconos recortables (círculo de radio 40%).
    left, top, right, bottom, cut = 212, 332, 812, 692, 640
    d.rounded_rectangle([p(left), p(top), p(right), p(bottom)], radius=p(58), fill=PISTA)
    # Talón azul a la derecha.
    d.rounded_rectangle([p(cut), p(top), p(right), p(bottom)], radius=p(58), fill=COBALT)
    d.rectangle([p(cut), p(top), p(cut + 60), p(bottom)], fill=COBALT)
    # Troquelado: dos medias lunas y la línea punteada.
    r = 36
    for y in (top, bottom):
        d.ellipse([p(cut - r), p(y - r), p(cut + r), p(y + r)], fill=NIGHT)
    y = top + r + 22
    while y < bottom - r - 22:
        d.rounded_rectangle([p(cut - 4), p(y), p(cut + 4), p(y + 26)], radius=p(4), fill=PISTA)
        y += 46
    # Horario en el talón: dos rayas cortas.
    for yy in (450, 560):
        d.rounded_rectangle([p(686), p(yy), p(766), p(yy + 26)], radius=p(13), fill=PISTA)
    # Flash y el nombre de la fiesta.
    d.ellipse([p(270), p(392), p(354), p(476)], fill=FLASH)
    d.rounded_rectangle([p(270), p(530), p(560), p(566)], radius=p(18), fill=NIGHT)
    d.rounded_rectangle([p(270), p(598), p(460), p(626)], radius=p(14), fill=(109, 99, 131))
    return img


def save(img, size, path, margin=0):
    """margin: cuánto recortar de cada borde (sobre 1024) para que la entrada ocupe más."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if margin:
        img = img.crop((p(margin), p(margin), N - p(margin), N - p(margin)))
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(path.relative_to(ROOT), size)


base = ticket()
icons = ROOT / 'public' / 'icons'
# Los recortables (Android) necesitan margen; el resto, la entrada más grande.
save(base, 512, icons / 'icon-maskable-512.png')
save(base, 192, icons / 'icon-192.png', margin=140)
save(base, 512, icons / 'icon-512.png', margin=140)
save(base, 180, ROOT / 'src' / 'app' / 'apple-icon.png', margin=140)
save(base, 64, ROOT / 'src' / 'app' / 'icon.png', margin=190)
