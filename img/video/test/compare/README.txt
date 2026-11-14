Mobile Hero video - CRF comparison images (test material, not used by the website)

Columns in every image, left to right:
  mp4_*   source crop of hero.mp4 (x=872, 816x1440) | villa-hero-mobile.mp4 (CRF 20, current) | test/villa-hero-mobile-crf19.mp4 (CRF 19)
  webm_*  source crop of hero.mp4 (x=872, 816x1440) | villa-hero-mobile.webm (CRF 31, current) | test/villa-hero-mobile-crf29.webm (CRF 29)

Frames: 0, 24, 28, 75, 150, 285, plus the frames with the largest measured gain of the alternative
(MP4: 32 and 48; WebM: 9 and 39). Frame numbers are 0-based (frame n = time n/30 s).

Scales:
  *_1to1.png  256x256 px regions at native size
  *_2x.png    the same regions enlarged 2x (nearest neighbour, no smoothing)

Regions (x, y of the 256x256 tile inside the 816x1440 crop):
  frame 0    chandelier (200,250), window mullions (300,60), foliage (180,580), upholstery (0,830), rug (300,1050)
  frame 150  window frames (80,380), glass/mullions (440,380), smooth ceiling (200,40), floor reflections (200,1100)
  frame 285  sky gradient (240,100), sea (300,640), sand gradient (300,1150)
  others     chandelier/window (240,180), foliage/furniture (300,640), rug/floor (120,1080)

Special images:
  *_blocking-test_x8contrast_4x.png
      Smooth areas (frame 150 ceiling 200,60; frame 285 sky 300,160; frame 285 sand 330,1250), 128x128 px,
      contrast stretched x8 around the source tile's own mean (same mapping for all three columns), enlarged 4x.
      Any 8x8 block structure becomes visible here. Note: the source itself (left column) already contains
      block structure from the original H.264 export.
  *_difference-x8_alternative-vs-current.png
      Left: the alternative's frame (greyscale). Right: |alternative - current| amplified x8.
