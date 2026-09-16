from pathlib import Path
from PIL import Image

folder = Path("thumbnails")          # folder to process
out = folder / "flattened"       # or set out = folder to overwrite in place
out.mkdir(exist_ok=True)

for path in folder.glob("*.png"):
    img = Image.open(path).convert("RGBA")
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    Image.alpha_composite(white, img).convert("RGB").save(out / path.name)