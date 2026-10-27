# Catalog thumbnails

These JPEGs are reduced-size derivatives of the corresponding files in `assets/portraits/`. They are display assets for the catalog table, not separate provenance evidence. The original portrait remains the canonical image in `data/media-provenance.json` and the full-size gallery.

When a source portrait changes, regenerate its thumbnail and review both images. The following optional maintenance command needs Pillow; the application and its standard checks do not:

```python
from pathlib import Path
from PIL import Image, ImageOps

for source in Path('assets/portraits').glob('*.jpg'):
    with Image.open(source) as image:
        thumbnail = ImageOps.exif_transpose(image).convert('RGB')
        thumbnail.thumbnail((120, 180), Image.Resampling.LANCZOS)
        thumbnail.save(Path('assets/portrait-thumbs') / source.name,
                       'JPEG', quality=82, optimize=True, progressive=True)
```

Run `npm run media:update` only after reviewing intentional changes to the original images, then run `npm run check` and `npm test`.
