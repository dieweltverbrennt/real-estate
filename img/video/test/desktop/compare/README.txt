Desktop Hero video - CRF comparison images (test material, not used by the website)

Columns in every sheet, left to right:
  mp4_*   hero.mp4 (source) | villa-hero.mp4 (production, CRF 21) | test/desktop/villa-hero-crf20.mp4 | test/desktop/villa-hero-crf19.mp4
  webm_*  hero.mp4 (source) | villa-hero.webm (production, CRF 32) | test/desktop/villa-hero-crf30.webm | test/desktop/villa-hero-crf28.webm

Frames (0-based, frame n = time n/30 s): 0, 24, 28, 75, 150, 285; the frames with the largest measured gain of the
alternatives (MP4: 19 and 33; WebM: 3 and 7); and frame 105, the frame with the most camera movement.

Scales (lossless PNG, identical crops and scaling for all columns):
  *_1to1.png  384x384 px regions at native 2560x1440 resolution
  *_2x.png    the central 256x256 px of the same regions, enlarged 2x (nearest neighbour, no smoothing)

Regions (top-left x,y of the 384x384 region in the 2560x1440 frame):
  frame 0    chandelier (960,260), window mullions (1150,420), potted tree (40,440), mezzanine (420,260),
             distant skyline (1700,470), upholstery (780,820), rug (1400,1000)
  frame 24   chandelier (1100,120), foliage (980,480), skyline (1800,470), upholstery (450,900), rug (1900,980), ceiling beam (300,0)
  frame 28   chandelier (1100,40), mullions (2100,200), foliage (1050,470), skyline (1800,520), upholstery (380,960), rug (40,1040)
  frame 75   wood panel (0,300), chandelier (1100,0), foliage (1450,420), upholstery (1900,800), marble table (1100,1050), glass (2100,60)
  frame 150  door frames (580,380), door frames/garden (1250,380), wood slats (1640,300), floor reflections (700,1050), ceiling (800,0)
  frame 285  sky (1000,40), sea (1000,520), surf (1000,820), sand (1000,1050)
  others     (1088,120), (300,560), (1088,560), (1900,560), (1088,1000)

Special images:
  *_blocking-test_x8contrast_4x.png
      128x128 px smooth areas (frame 150 ceiling 900,40; frame 285 sky 1100,120; frame 285 sand 1100,1200), contrast
      stretched x8 around the source tile's own mean (same mapping for all columns), enlarged 4x. Note: the source
      (left column) already contains 8x8/16x16 block structure from the original H.264 export.
  *_difference-x8_<alternative>-vs-production.png
      Left: the alternative's frame (greyscale). Right: |alternative - production| amplified x8.
