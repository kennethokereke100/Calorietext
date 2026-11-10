# Image conversion dependencies

- [libheif-js 1.23.5](https://github.com/catdad-experiments/libheif-js):
  LGPL-3.0, an unmodified npm-distributed WebAssembly build of
  [libheif](https://github.com/strukturag/libheif). Used on the server to decode
  the primary image in HEIC/HEIF containers. Upstream source and license notices
  remain available in the linked repository and installed package.
- [jpeg-js 0.4.4](https://github.com/jpeg-js/jpeg-js): BSD-3-Clause.
  Used to encode resized pixels as JPEG, and decode synthetic test images.

No user photo is included in the repository. The small HEIC test fixture is an
original, generated green rectangle encoded with Pillow-Heif 1.1.1.
