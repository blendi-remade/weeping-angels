from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
folder=root/'assets'/'source'
for name in ['limestone','floor','wood']:
    for channel in ['basecolor','normal','roughness']:
        source=folder/f'{name}-{channel}.png'
        if source.exists():
            out=root/'public'/'assets'/f'{name}-{channel}.webp'
            with Image.open(source) as img:img.save(out,'WEBP',quality=92,method=6)
            print(out.name,out.stat().st_size)
