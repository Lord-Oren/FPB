# Artwork

`ruben/` contains the pixel artwork extracted from the client-provided FPBPackAssets.pdf. Version A uses this pack with the original colors. `ruben-smooth/` contains curved drawings extracted from page 2 of Assets2FPB.pdf; version B uses this pack. Each `source-manifest.json` records the original source filename, hashes, and extraction details.

The original PDF files and internal extraction tools are not required to build the site. Keep the SVG artwork and manifests together. Preserve client attribution and ownership.

`television-pixel.svg`, `television.svg`, and `pixel-pond-a.svg` are supplemental artwork created for the site, not part of Ruben's supplied pack. Fonts are in `fonts/`, with their license files.

`RubenArtwork.astro` embeds shared SVG symbols. Pixel and smooth renderings are selected by `presentation.js`. The original mode preserves source colors; the adapted mode applies the brand palette.
