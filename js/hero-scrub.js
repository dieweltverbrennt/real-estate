/* Scroll-controlled hero video - cinematic playback.
   Scroll progress through #hero decides where the camera should be; the camera gets there like a real
   camera move instead of jumping frame by frame:
   - it moves over the clip's real camera positions (the villa clip repeats every 5th frame; repeats are skipped)
   - inertial "dolly" camera while the visitor scrolls: a gliding target gives it weight; a critically damped follower,
     pushed by the target's speed (the push builds up smoothly), eases every start. Limits fade in - no hard switches.
     Integrated in 4 ms sub-steps, so the path is the same at 30, 60 or 120 Hz. The follower stays close to the scroll
     (~0.1-0.2 s), so no backlog builds up that would have to be played after the visitor stops (it used to trail by up
     to ~0.5 s and 50-120 positions, replayed for 1-1.7 s after the page had stopped).
   - landing: once the scroll stops and the camera no longer speeds up, it picks its resting frame - sharp, within the
     sync window around the scroll position, never behind its direction of travel - and slows down to it in one
     continuous movement: a quintic from its current speed and braking to zero speed and zero braking, about as long as a
     coast (T = 2 x distance / speed: then speed = v0 x (1 - smoothstep(t/T)) - the braking builds up and eases off
     again). Only curves whose speed never rises are used (no slow-down - speed-up - slow-down, as the old landing zone
     did). The frame and T are chosen for a short landing (LAND_T) whose last frame interval stays short (LAND_LAST).
     The picture changes only by whole frames (the nearest to the camera), so the final half position before the resting
     frame is invisible.
     Scrolling again cancels the landing and hands back to the follower without a jump in speed or acceleration.
     Touch: from the moment the finger lifts, the landing aims at where the page's own momentum will stop (estimated
     from the scroll speed, refined every frame) instead of following that momentum's slow tail frame by frame; it is
     longer (LAND_T_FLING), like the momentum itself. At 30 Hz or less a landing frame is never held shorter than the
     one before it (no 1-/2-frame judder).
   - a top speed, lower on touch devices (the portrait crop magnifies each step's motion ~2.2x)
   - first and last frames stay exact
   Watchdog: a seek that never completes or a start that never gets its first frame is retried (never more than one
   seek at a time); a poster under the video (css/hero-video.css) covers any moment without a frame.
   The video never plays on its own: only currentTime is set, one seek at a time. Only original frames are
   shown - nothing is generated, blended or sharpened.
   Hero look (approved "Variant 5", styles in css/hero-video.css): the original sand fade rises only over the last
   20% of the hero's scroll (--hero-sand), and a soft adaptive gradient behind the white text (scrim opacity) follows how bright
   the frame behind the text is. The top headings (header over the hero) follow the same principle: an eased ink/white
   tone per zone (--hb brand, --hn navigation) and a per-heading feathered shade, no light glow. The secondary hero
   button's colour follows --hero-sand in CSS (no sampling).
   The header's brightness read runs outside the seek loop (own task, at most every 150 ms) and reads a precomputed
   luminance table per video source (<video file>-lum-<webm|mp4>.webp next to the video), not the video's pixels; only
   when no matching table is available does it read the video (GPU canvas), as before.
   Two hero sources, chosen by <source media> in the homepages (the browser downloads only one): the landscape clip
   (2560x1440) and, on portrait phones, villa-hero-mobile-k5.mp4 - the exact 816x1440 centre crop (x=872) of the same
   master, so the same frames and composition. Per-clip data (CLIP_REL / CLIP_BRIGHT and the table layout) follows the
   clip actually playing; the camera, scroll mapping and seek control are the same for both.
   Touch devices: --hero-sand is set on the hero (not <body>); the stage is sized for the toolbar-hidden viewport
   (mobile CSS block).
   "Horizon Chapter" (css/hero-video.css): when the Method section follows the hero, it rises over the last part of
   the video. Computed in the same scroll call as the sand fade - no extra loop and no pixel reads: --hero-out (heading
   and buttons leave, 46-58% of the hero's scroll), .is-out, a light late haze instead of the full sand fade (66-78%),
   .hdr-past on the header and .ch-hold on the WhatsApp button (IntersectionObservers), and Method's landing point and
   the steps' position for the veil behind them (--ch-land, --ch-steps; measured on load / resize only).
   Backups of earlier versions: see the RESTORE notes in the backup folders. */
(function () {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero || !hero.classList.contains('is-scrub')) return;
  var stage = hero.querySelector('.hero2-stage');
  var video = hero.querySelector('video');
  if (!stage || !video) return;

  var FPS = 30;
  // Measured for img/video/villa-hero (292 frames): frame 5k+1 repeats frame 5k, and each unique frame's
  // sharpness relative to its neighbours (x100). If the clip is replaced and no longer has 292 frames, the
  // script falls back to all frames with equal weight. Regenerate this data when the video changes.
  var CLIP_FRAMES = 292;
  var CLIP_REL = '96,92,93,96,87,87,96,104,101,98,99,104,98,98,106,107,107,103,98,103,98,96,102,102,104,102,98,104,99,97,101,102,103,101,96,105,97,97,101,102,104,99,96,105,97,94,101,104,104,98,96,106,98,92,101,105,102,94,99,110,99,93,101,108,101,93,96,108,96,93,102,107,103,95,96,107,95,97,102,107,106,101,90,111,96,95,100,106,101,93,94,112,94,95,99,104,96,91,94,104,97,97,108,111,104,102,100,112,98,96,98,108,101,97,92,109,96,97,96,111,97,98,92,101,88,87,92,106,103,103,99,110,94,95,95,103,93,95,96,109,93,99,104,108,101,95,93,106,96,99,108,113,106,102,98,110,96,95,105,111,104,96,94,110,94,87,104,115,106,82,95,125,94,81,99,128,100,87,84,115,85,99,98,108,94,97,90,99,93,97,115,112,112,103,95,102,95,92,106,107,111,103,96,105,100,94,102,104,106,95,93,108,103,95,102,100,100,100,93,106,103,93,104,101,102,98,89,101,93,91,97,99,96';

  // Brightness of each frame (80th percentile, 0-255) on a 4x4 grid, row by row, 2 hex digits per cell; measured for
  // img/video/villa-hero. Drives the adaptive text gradient. Regenerate together with CLIP_REL when the video changes.
  var CLIP_BRIGHT = '708780768898d2da97859a9e907b809b708780768898d2da97859a9e907b809b708881748a98d2da96869a9d91787f9d708a80748b97d2dc97869a9e91767e9e6f8a83748a98d2de96879c9d91757ea06f8a86758997d2de91889c9d917279a4708a86768997d2de91889c9d917279a4708a89768697d1df90899d9c927174a5708a8f778097d1df8a899d9d947170a3708a95777c97d1df858a9d9a94706da2708a9d777797d1de828c9d95926f6ba1708a9d777797d1de828c9d95926f6ba1708aa0767596d0de818e9e96906d6b9e7189a4777496d0df818f9e978a6e6c9e7489a5767395d0df81909e99856f6c9e7789a77a7295cfdf82919f9b7f6e6f9f7789a77a7295cfdf82919f9b7f6e6f9f7889a8807294cfdf82919e9d7c6e70a07b89a9857294cedf83919d9f796e73a17f89aa877294cddf83929da1786e74a18189ac8e7293cddf85929da3766e76a08189ac8e7293cddf85919da3766e76a08388ac917293cdde85929ca4766f789f8488ac9d7292ccdd86929da47770799d8588aba77192ccdd86929da577707b9d8687adb27192cbdd88929ea477717c9b8687adb27192cbdd88929ea477717c9b8687adb97191cadc89929ea577727c9c8687acbb7190cadc89919ea578737c9c8687adbb7190c9dc8a929ea778747d9c8788aebb718fc9dc8b929daa77767d9c8788aebb718fc9dc8b929daa77767d9c8787acba718ec8da8b929dac76777c9c8788abba718fc6d98d929bab74787b9a8689acba718fc5d98c939aad727a7a99868aaab9718fc4d88d9497af6f7c7b97868aaab9718fc4d88d9497af6f7c7b97868baab9708fc3d88f9497b06c7d7b97858aacb9708ec2d78f9296b36b807c93858aacb9708ec2d7909194b468827d8f8488aeb8708cc2d6919093b466847e888488aeb8708cc2d6919093b467847e888387aeb7708bc1d5949091b266847f848284aeb6708abed5978e90b0678580828086aeb6708abdd4998d8fb2668681827c87adb6708bbcd49c8c8cb6648882827c87adb6708bbcd49c8c8cb6648882827988adb5708cbad29c8c8cb7638984827389acb5708bb7d19f8b89ba648a8582728aacb5708bb7d0a08b88bc638b8681728aacb4708bb7cfa18b88bd618c8883728aacb4708bb7cfa18b88bd618c8783728aaab3708ab2cea28a87bc628c8885718aa8b3708aafcda28b84bc698d8884718aa7b2708aadcda28b83be738c8986718ba5b26f88accca38c82c0888b8b8f718ba5b26f88accca38c82c0888b8b8f718ba2b27087a9cba28c80c2928a8c91718ca2b07086a7caa08c7dc19d8a9091728ca2b07086a5c99e8d7cc0a78a9194728ca2b07084a3c99d8c7cc1af8a949a728ca2b07084a3c99d8c7cc1af8b949a728ca1af70829fc89b8c7bbfb48a9799728ca0af717f9bc79b8c79bcb68a9b9a728ca1af707e98c79c8c78bbb98c9aa1728ca3ae717c97c69d8d77bfb98a97a7728ca3af717c97c69d8d77bfb98a97a7728ca1ae727a95c59d8c77c1b98994a3728da3ad747892c49c8d77bebc898ba4738daaad767791c69b8d77bbbd8a8da7738dabac777791c59a8e77b5ba8b91a5738dabac777791c59a8e77b5ba8b91a5738daea977768dc5988e77acb98c8ca4738eb89d77758bc4968f78a2b8887e7c738ec0977a748ac4978f78a3b4807879738ec79282738bc69d8f7ba3b27b746e738ec79282738bc69d8f7ba3b27b746e738fcb91857387c59f907ba3b37a70717390cc91867385bfa5907c9fbb7a6c697390c8918b7383bda9917c9fac7969647491ba998c737db5aa937ba294736a5f7491ba998c737db5aa937ba294736a5f7491a5a48c7378b1a992799f8a6e695e749197b18a7276a8a89279997a6c6c5c749299b38a7276a2a694788c716c6b5c74939cb787727596a1977a866c6a6b5874939bb787727596a1977a866c6a6b58749494c58472748d9e987b856b676b58749590c97e7273909d9b7b826c686b5574958fcf7c73728f9c9c7c816b666b56749591cd78737388989d7e816a6a7557749591cd78737388989d7e816a6a7558749690cc77757284969d80806b686f5b74968fcd727e727f919f857b6f666a5b749690c97284727c91a4887b766a6a5d74978fc6708a72738daa8c7c716a656074978fc6708a72738daa8c7c716a6560749790c56f8d726d8cab8e7f6c6a6063749890c66d90726b8dae927f697d6067749890c16c9372698aad967f6c825d68749990ab6b9672578cac9a7984886369749990ab6b9672578dac9a798488636974988fa46c9a714f87ae9c759a90666873988ead6b9f715ca5afa06dac96646273988ea76ea17163adaea371ac93655f73978f8c70a6705da6ada76db9876a6072978f8c70a6705da6ada76db9876a6072978f8372a87060a3aca769af876f5d72978e8471ac706aa0aca56fb98d856371968d8073af6f6f99aea67dbb908c5572968c7378b06e708faf9d89b39aa25872968c7378b06e708faf9d89b39aa25872948c6f7cad6d708fb0a690ac9ca77172928b6c80aa6c748fb2a981aea4aa897b90706c82a46b7893b4ab82aca8ada58a8e6f6d859e6a769ab69a97a3a9a0b68a8e6f6d859d6a769ab69a97a3a9a0b68e8c6e6d949b6971a3b890a097ab94c0937e6e6d9e9d6770aebba7a793c163b29a716d6daa976670b5beafac7ec45bcaa4706d6dba90676dbcbeb8b286bd72bba4706d6dba90676ebcbeb8b286bd72bbad706c6cc083676cc0b9b4a4baa175aab76f6b6cc666666cc6b59290d2a8c2afbe6e6b6cc764666dc8af748ed4b7c4c0c36d6a6ccc65666eceab738cb9beccbec36d6a6ccc65666eceab738cb9beccbec96c6a6bcd65686ed1ab768eb9bebd84cb6b6a6ad268686dd6ab7b8ab8a79076cd6a6969d56b676dd7aa8389bda98374cb696869d36e676cd7ab8986b9af7677cb696869d36e676cd7ab8986b9af7677c1686669ce6d686ec6ab908cadb076769b666568c16e6870a3ac9286b2b1767295656468be6e6770a7ad9085b8ac747488646368b771666bafad9277b7a9738088646368b771666bafad9277b7a973806562636a7672656593af926eb77371875360626b4679626052b28665b36f778f535d616b3f7d615d50b47d60af6b8295545b5f6c3a80615c52b47b69886a97a3545b5f6c3a80615b52b47b69886a97a3545a5e6b3a83605a53b37c7466699fa553585e6b3d87605954b17a865f6aafa353575f6c3f88635955af7e955d6cb39252575f6c408d655456ad849c5c8ab39752575f6c408d655456ad849c5c8ab39752565e6f428f685357ad859f5d9fada650555a71459568495aae7fa161af93574e54577144996d425bae7fa262b18a4d4d54567145ab72475cad8d9f61b071534d54567145ab72475cad8d9f61b071534c53556e45b573475cae939e62ad6d574b50546b47bb794b5eae989972ae6a5e4a4f535947bc7d505eaf9c899ca86b604a50544848cb876362b0a164a5956b624a50544848cb876362b0a164a5956b624a5054414dcd887064b1a43fa7766b614752544057ce89676cb1a42faa6c6b4b465253525ccf8f646fb1a43baa6a6c5b4853535461cf957c72b1a243a76983674853535461cf957c72b1a243a76983664b53516e63cf968072af9f4ba06a966e5150503564ce9b7072ae9f50856c9a895652503169cea86f74ad9f4d6f6da0884f53533562cebb796caca04d5e6fa78f4f53533562cebb796caca04d5e6fa7903f5454365ccec0805baca14b5b6fa99c3955553b4fcdc9874faba24e5a71aba23856563a4fcdc97c4aaba3485a71aea53b57573b55cdca6555aba4435b87b3a83b57573b55cdca6555aba4435b87b3a83e57583b57cdc95159aba3415d8eb3a53b5a5c3e56cdc95640aaa2475493b2a33a5c5e4057cdc95932aba3485094b19e3d5e63425ccdca5f31aba64c4e9399663e5e63425ccdca5f31aba64c4e9399663c6266475ccdca612baaa64d48908c5d4263694959cdca5e2aaaa5405491875c48656a4c54cdca5f2aa9a53a598c835c4d696c5665cdca6630aaa6355b8581614d696c5665cdca6630aaa6355b8581614c6b6e5761cdca652eaaa5375b8580644d6d705d5fcdc97741a9a5436186806a4f70726263ccc9784baaa54a6187816d517275665fccc97952a9a5535e868270527275665fccc97952a9a5535e8682705373786760ccc97b59a9a4545c85816f55767a6866ccc97d63a9a55b5c85806257797d696accc97e65a9a5605685805d5b7c7f696ccbc98167a8a5675384805b5b7c7f696ccbc98167a8a5675384805b5c7d81696ccbc98268a8a56c4f8481585f7e836a6dccc9876ba7a471528583586181856c6dccc9886da7a575538785566484886d6acbc99770a6a4785786845b6484886d6acbc99770a6a4785786855b66868a6f6ccbc9a370a5a3795b86855e698a8c716ecbc9876fa5a3785f86855e6c8c8e7270cbc97e6ca4a2785e878660708f907474cbc97669a5a3795c888763708f907374cbc97669a5a3795c88876370afaf7575cbc9756aa3a2795988866573b0ae7478cbc9776ea2a07a5988846273b0ae7575cbc97470a2a17a5889855f72b0ad7669cbc96d72a2a17d5289865a72b0ad7669cbc86d72a2a17d5289865a73b0ac7857cbc86a77a0a07e4f89865778b0ab7e5ccbc8717ba09f7f5689855485afab815fcbc8797aa09f8156898553b1afaa8975cbc88a799f9e8452898656b1afaa8975cbc88a799f9e8452898656b4afaa9584cbc890799f9e8453888559b4aeaaa6a6cbc8a07c9e9d825c888460b5aea9a5bdcbc8ae7e9f9e805e888561b6aea9a5c9cac8b284a1a1816187866cb6aea9a5c9cac8b284a1a1816187866cb6ada9a4c9cac8b481a1a38264868670b6ada8a4cacac8b57ea4a6836887886cb5ada7a2cbcac8b67ca8aa836888886db4aca69fcdcac8b77aa9ae826488886eb4aca69fcccac7b67aa8ae826488886eb4aca69eccc9c7b678abbc826387876cb5aca69ecdc9c7b879bcc47f63878669b5aba69ecec9c7b97dc0cb806187866ab5aba69ecec8c6ba84c3d28062858573b5aba69ecec8c6ba84c3d28162858573b5aba59dcdc8c5bb8ac7d58166838378b6aaa5a0cec7c4be93cad4867284827bb8aaa49fcec7c4c097cbd38a7483817bbba8a4a0cec6c3c29dcbd1907681827bbba8a4a0cec6c3c29ecbd1907681827bb9a8a4a0cdc5c3c1a5cbd0977b80897abaa7a4a2ccc4c2c1b9c9cea98285cf79b9a7a3a2cbc4c1c0c1c8cdb688a2d27cb7a7a3a5cbc3c1c0c6c8ccc7aebed5ceb7a7a3a5cbc3c1c0c6c8ccc7aebed5ceb6a7a3a6cac3c0c0c6c7cbc8b6c6d5d1b5a6a3a9c9c2c0bfc7c7c9c8c0ced6d4b5a6a3a9c9c2bfbec6c6c9c6c1cfd6d3b5a6a3a9c9c1bebdc6c6c8c5c4d1d8d5b5a6a3a9c8c1bebdc6c5c8c5c4d1d8d5b5a6a3a7c8c1bdbdc6c4c7c2c5d0d7d5b4a6a3a7c7c0bdbcc4c4c5c0c9d1d5d2b4a6a3a7c7c0bcbcc4c3c4bfc8d1d4d4b4a6a3a7c7bfbcbcc4c2c3bec7d0d4d4b4a6a3a7c7bfbcbcc4c2c3bec7d0d4d4b4a6a4a7c6bebcbbc3c1c2bdc5cfd4d4b4a6a4a7c6bebbbbc2c0c1bbc9d0d4d3b4a7a4a7c6bebbbbc1bfc0bac7d0d4d3b4a7a5a8c6bdbbbbc0bdbfb8c4cfd4d3b4a7a5a8c6bdbbbbc0bdbfb8c4cfd4d3b4a7a5a8c5bdbbbabebabdb4c3cdd3d3b4a7a6aac4bdbbbabbb8bab1c4cdd1cfb4a8a6aac4bcbababab7b8afc4cdd1cfb4a8a6aac3bcbabab8b5b6adc2ccd1d0b4a8a6aac3bcbabab8b5b6adc2ccd1d0b5a8a7abc3bcbab9b6b3b4acc1cbd0d0b5a8a7abc3bcbab9b5b1b3abc2cccfceb5aaa8abc3bcbab9b5b0b2abc1cbcfceb5aaa8abc3bcbab9b4afb2adc0c9ceceb5aaa8abc3bcbab9b4afb2adbfc9ceceb5aba8abc3bbb9b9b4aeb2adbfc8cdcfb6abaaacc2bbb9b9b6b0b6b0bfc7cbccb6acaaacc2bbb9b9b8b1b9b2bfc7cbccb6acaaacc2bbb9b8b9b2bcb5bfc6caccb6acabacc2bbb9b8b8b2bcb5bfc6caccb6acabacc2bbb9b8bab5beb7bfc6c9ccb7adabacc2bbb9b7bdb9c1babfc6c8c8b8adacacc2bbb9b7c0bbc7bcbfc6c8c7b8adacadc1bbb9b7c4bfcbc4bfc5c7c5b8adacadc1bbb9b7c4bfcbc4bfc5c7c5b8aeacadc1bab8b6c9c3cdc9bec4c6c5b8aeadaec1bab8b6d7caced0bfc4c5c1b9aeaeaec1bab8b6dbd0cfd4bfc5c4c0b9afaeafc1bab8b5ded7d3d9bec4c4c0baafaeafc1bab8b5ded7d3d9bec4c4c0baafafb0c0bab8b4dfdad6dbbec4c3c0baafafb2c0bab7b2e2dedaddbfc4c3bfbbb0afb3c0bab7afe4e0dbddbfc2c2bfbbb2b0b4c0b9b6ace3e2dddcbec1c2c0bbb2b0b4c0b9b6ace3e2dddcbec1c2c0bbb2b0b4bfb9b4aae3dfdddabec0c1c0bbb3b2b4beb8b2a9e2dadbd5bec0c0bfbbb3b2b5beb6b0a7e0d9d7d2bec0c0bfbcb4b4b5bdb5afa6ded9d4d1bdbfc0c0bcb4b4b5bdb5afa6ded9d4d1bdbfc0c0bcb4b4b5bcb4aea5dddad4d0bdbfc0c0bcb4b4b5bcb3aba4dddad3d0bebfbfc0bcb4b5b5bbb2aaa2dcd9d4d1bebfbfc0bcb5b5b5bab1a8a1dbd8d6d4bebfbfc0bcb5b5b5bab0a8a1dbd8d6d4bebfbfc0';
  // The same data for the portrait clip (img/video/villa-hero-mobile-k5.mp4, 816x1440 crop x=872 of the master, 292 frames):
  // CLIP_REL measured on the crop of the master, CLIP_BRIGHT on the portrait encode itself - the same methods that give
  // the landscape values above exactly (sharpness: Laplacian variance at half size vs the median of the 15 surrounding
  // unique frames; brightness: 80th percentile per cell of a 4x4 grid over the portrait frame at quarter size).
  var CLIP_REL_PORTRAIT = '102,99,95,97,91,91,98,102,101,99,98,103,98,98,106,106,107,102,97,101,95,96,103,103,106,104,100,104,98,97,102,101,102,101,95,105,98,97,101,102,104,99,96,104,99,97,100,102,104,99,95,106,99,92,101,106,104,95,98,108,99,95,101,105,104,93,97,108,96,93,101,107,107,95,95,106,92,94,102,108,105,100,98,104,97,99,100,101,96,95,98,104,95,99,103,104,100,98,97,103,99,98,103,104,100,104,95,110,98,98,95,106,100,97,92,99,89,91,94,101,96,101,100,108,96,98,106,118,112,110,102,112,93,100,98,100,95,98,102,108,99,103,104,102,100,100,94,107,97,100,99,105,97,106,93,109,91,96,104,99,99,105,91,109,100,97,99,101,95,106,88,107,79,82,87,86,87,86,96,101,91,108,100,104,95,103,100,101,97,104,114,109,110,108,99,103,97,95,103,103,106,104,94,103,100,96,103,100,103,97,93,106,105,94,102,101,99,102,92,107,102,90,108,101,102,93,88,103,97,92,98,101,99';
  var CLIP_BRIGHT_PORTRAIT = '84928a7892c9b3cb76948f987590797e84928a7892c9b3cb76948f987590797e8692897992cab1cb77968f98738c797b8893857993ccafca7c959096718c79798894857993cfaeca80949197718d79778895837b93d0aacb868d9298708674648895837b93d0aacb868d9298708674648895837c92d2abca8a89929a707c725e8798837e92d1a9ca9185909c71746d60879c868192d1a9ca9382919b71706e63879f888693d1a9cb977e919d6f6b7267879f888693d1a9cb977e919d6f6b7267869f889492d0a6cb9b7e909e6c6b746986a28ba190cea7cc9f7c8fa06a70796e86a48ca590cfa7cca07d8fa067727b7086a78fab90cda9cda37c8fa065747e7386a78fab90cda9cda37c8fa065747e7386a88fac90cca7cea57a8f9f6576807486a891ae8fcca8cfa8788e9d6678817686a894b091c8a8d0aa788e9c687a827986a895af91c6a8d1ab748e9b697b847b86a895af91c6a8d1ab748e9b697b847b85a796ae91c5a8d0ae738f996a7c857c85a598ac91bfa8d1ae6e8f986a7d867e85a499ab8fb8a7d0ac6d8f986b7d877e85a39aaa90b4a7d0a76c91976c7d888085a39aaa90b4a7d0a76c91976c7d888085a39ca990b0aacea16c91956f7e878185a19da890a5abce9b6b9192737e8782859fa0a78ea0adcd976a9290747f8684859da4a68f97b2c99369928e77808782859da4a68f97b2c99369928e77808782859ca6a58d96b1c78d69938b79808880849ea5a48e96b0c18a6a92887a82897e839ea8a38f95adbf876991867b838a7e82a1a7a38e96adbe866d90847d858b7f82a1a7a38e96adbe866d90847d858b7f82a0a9a28e97aabb856c91837f858b80819db0a38d93acb9836c918381868d81819ab6a18d91b0b6836c928380868e828198c3a18c8fb9b3856b928282888f838198c3a18c8fb9b3856b928282888f838194cca18b8dbeab856b927e82889084818fd5a08b8bc4a7856b927c828891838290d59f8b8cc4a5866c917c818891848191d6a08c8dc2a28a6d8e7c818991848191d6a08c8dc2a28a6d8e7c818991848190d69f8d8cbea28a6d8e7a828a93858092d99e8c8cbf95896e8a7a828b93858193d99d8b8dc19987708979848b94867f94d9a18a8dbe9d8773847c848c95877f94d9a18a8dbe9d8773847c848c95877f93d6a38a8dab9e8775817e858c96877f93c4a98b8e96a188727c82868d97877e92b7b58b8d8ea289727986878e97867f939cc48b8b8da68973738e898e98887f939cc48b8b8da68973738d898e9888809396ca8b8b92a28a74718d898e9b8781949ad18a8a969c8876708a89909e89829698d7898b9397877971898991a08982978cdb868a8da5877a6d8e8a92a58a82978cdb868a8da5877a6d8e8a92a58a84967ddb85878daf86796a928a92a88c85946bdb848689b4857969928895a988859569db83858ab1877969918499a68686956adb82848bb288786a8e7c9b948086956adb82848bb288786a8e7c9b948087966cda818489aa89796b87799b9082899673d87f83879b8b7b6b8078a190828a9675d67d8086898b7d6e7c77a493848b947ace7a7f87838b7f6e757fa6988d8b947ace7a7f87838b7f6e757fa6988c8c937ccd777d86858b7e727187a899878c937ccf757b85878c7f7b6b889b80758c937cc5747a84838d7f7f6a879272718d927d887378827f8c7d8369888869658c927d887378827f8c7d8369888869658d937f7373787e788a7e82698983675b8d93827273777d7a887f8468898068588d94837d72777b7c89808667847c665a8d9386817276787d877f8b657b7161648d9386817276787d877f8b657b7161648e9289817276777a847e8a636f6d5d668d928c80727576777d808d67726c5c6d8d928d83717476767c81906a726b58738d928d86717375777a848e6f7465527d8d928d86717375777a848e6f7465527d8e928e88707375777a8a8c78716254868e94928a707374767c938d7a775a5c8a8e93938d7072747581998f7a705364858e929190707274758498907a6e5877948e929190707274758498907a6e5877948e92908d70727374819894796a5e70798f91908c6f7173738a999b7f5a6570748f90908c6f717272989b9e87566e7975908f8f8f70707272a59d9c8f5d747969908f8f8f6f707272a59d9c8f5d7479699190908e70707272a2a39d9763776a649190928d706f7172b2a399a5798362669190928e706e7172b39f9faa82835a609390908f776c7072a29ea2b3a17462639390908f776c7072a29ea2b3a174626393908f8d856b7072a0a0a5b5a7756366938f908c946a7071a69fa9b98b766a62948f8f8c9c696f71aaa1a8bf85716d5d958f8f8ca9686f71aea49ec67e757c63958f8f8ca9686f71aea39ec67e757c63958f8f8dac676f71b1a194c77e7b9f6a968f908cb0676e71b59e88c37f94a67f968f8e8db1676c70bca185b4829aa986968f8d8cad666b6fc0a17e7b9fa4b291968f8d8cad666b6fc0a17e7b9fa4b291958e8d8cab666a6fc1a47e6da2a7b29a918d8e8ca966676dc1aa8074b2aaada38e8d8d6fa367656cc2ae817cb6a6aea18b88716ea077646bc2b68b88cb9b938d8b88716ea077646bc2b68b88cb9b928d8871706d9e846469bfba928fce8a818e7171716e9b976266b2bea1a6cc9483307070706c959a6164b0bfb2b0809577337071706c969e5f63afc0c0bd779a7a597071706c969e5f63afc0c0bd779a7a5970706f6c8fab5f63afc0aeb574a57d716f706c6b8cc35a66b3c28da59bbccaa96f6f6a6b83c85668b0bb717cafbdd8c16f6e6a6b85cb5768a4bc6c7cbec4d3c96f6e6a6a85cb5768a4bc6c7cbec4d3c96f6b696a76cd5968a0bc6e7fbbb9b2bc6d6b686a79cd5a689bbd747fb1a69e856c69666976ce5a6899be7983b1a5907d6c69666876cf5c6a96bf828bb3a2827a6c68666976cf5c6a96bf828bb3a2827a6b68666672cf5d6b96c08c93b29c7f746968646570d05f6998c19590b09e7777666763646dd0626898c19887b0957476666563636ed2646897c2a079ac727372666563636ed2646897c2a079ab727372656461646fd2666698c3a26d6f7070756361616371d366659bc49f676f6f717c615e5e6272d36a5c9fc49e5c696e71865d5c5c5e72d38349a3c39f50676d78a05d5c5c5e72d38349a3c39f50676e78a05b5a5a5a72d48d44a6c1a04d666f90a258585a4e76d49839a8c0a243699796a05758595877d49c3fa8bea4486aa6a3ab5658595c7dd4b147a2bea9459daeb2b35658595c7dd4b147a2bea9459daeb2b35658585c87d4bd4a9dbfac46afb1b4a55557575d91d4c0529ac0b24cb2b6b48c5456575a9ed4c4589dbfb451b2b694855556565caed4c9659dc0b661b4ac8c6c5456565cb0d4c9669dc1b661b4ac8c6c53555559b6d4cb639dc1b66db1978e6a50545355bad4cf649ec0b77ca391716a4f535253bad4d165a1c2b8819777716a4f535353bcd4d166a3c2bb906f74716b4f535353bcd4d166a3c2bb906f74716b4f545352bdd4d165a1c2bc916c7b706b51555452ced3d167a3c1bc856e8e6f6851555550cfd3d16ea6c2bb816c91756753575650d0d2d274a9bfbb776c918c7753575750cfd2d274a9bfbb776c918c775357574dcfd2d273a9bdba706d9094975156574ccfd2d178a9bcba6c718e97a35256574ecfd2d17ea9bcba6e718d9fa753575751ced2d189a8bbb9737191a4ad53575751ced2d189a8bbb9737191a4ad54575753ced2d189a9bbb9737195adb054585a55ced2d18da9bab9727297b4b1555b5c56ced2d191a9bab8747199b7b3575d5e5aced2d1a7a8bab87b7b9eb9b9575d5e5aced2d1a7a8bab87b7b9eb9b8585f615cced2d1bea7b9b77d8fa8b9b75c626361ced2d1c6a5b9b68794aeb9b45d636563cfd2d1c6a6b9b78e97afb89a5f656866cfd2d1c6a6b8b6979ca4ab8d5f656866cfd2d1c6a6b8b6979ca4ab8d62686a68cfd1d1c6a7b8b59b9f979c87646a6c6acfd1d1c7a7b7b59da9949b85666c706ccfd1d0c7a6b6b59d939296816b707270cfd1d0c7a6b6b5a0878e8c826b707270cfd1d0c7a6b6b5a0878e8c826d737370cfd0cfc8a5b4b3a0898c8d8171757873cecfcfc8a4b3b39f8b8b898072777b77cecfcec9a5b3b2a08a8c8981727c7e79cecfcec9a4b2b29f898c8783727c7e79cecfcec9a4b2b29f898c8783767e807acecfcec9a3b1b19f898b87827a81847ececececaa3b0b09f8c8a87817c848680cfcecdcaa2b0af9f8c8986807e858b83cececdcaa3afaf9e8e8989837e858b83cececdcaa3afaf9e8e8989837e868b84cececdcaa3adae9d8d89898680898c85cececdcaa4acac9b8c888987828b8d86cecdcccaa5acad9b8d888988848c8e88cecdcbcaa5abac9c8c89898a848c8e88cecdcbcaa5abac9c8c89898a858d8f88cecdcbcaa5abab9c8d88898d888e908bcecccbcaa5abab9e8e87888c8a8e908bcecbcbcaa5a9aa9e8d8a888c8d8f928ecdcbcbcba6a9aaa18c8d878a8d8f928ecdcbcbcba6a9aaa18c8c878ab2aeadafcdcbcbcba5a9a9a08d8d878ab1aeadaecccbcacaa4a6a7a08f8a8887b0aeadadcccbcacaa5a6a7a1918a8a88b0adacaccccbcacaa5a6a6a38f8a8a87afadacaccccbcacaa5a6a6a38f8a8a87afacababcbcacacaa4a5a5a18e888987aeabaaaacbcac9c9a4a5a6a28e878986aeaba9aacbcac9c9a4a6a6a28e878986aeaba9a9cacac9c9a4a6a8a38d8b8886aeaba9a9cbcac9c9a4a6a8a38d8b8886aeaba9a9cbcac9c9a6a8aca58d8c8987adaba8a9cbcac9c9a7a9aca88d898786adaaa7a8cacac9c9a8abacad8d898888ada9a7a7cacac9c8a9acb4af8a88898aaca9a6a8cacac9c8a9acb4af8a88898aaca8a6a7cac9c9c8a9abb7b68a878b8caca7a6a7cac9c8c8a9acc2be8c8a8a8caca7a6a6cac9c8c8abb5c4c08c8b898caba6a6a6c9c9c8c7abbbc6c08989888caba6a6a6c9c9c7c7abbbc6c08989888caba6a6a6c9c8c7c7bcbfc6c48888868aaba6a5a6c9c8c7c7bcc2cccc87868588aaa6a5a6c9c8c6c7bec3d0d187858488aaa6a5a5c8c7c5c6bfc6d2d484838386aaa6a5a5c8c7c5c6bfc6d2d484838386a8a6a4a4c7c7c5c5c0cbd6d583828285a8a5a4a4c7c5c4c4c7ccd5d582828082a7a5a4a4c6c5c4c4c9ced4d482828181a7a4a3a3c5c4c3c3caced1d380818482a7a4a3a3c5c4c3c3caced1d380818482a7a4a3a3c5c3c3c3cacdcfd27f82b185a6a4a3a3c4c3c2c2c8cccecf82acd2d1a6a3a3a3c4c2c1c2c8cbcccf88c3d5d4a6a3a3a3c3c2c1c1c7cbccccb0ccd8d7a6a3a3a3c3c2c1c1c7cbccccb0ccd8d7a6a3a3a3c3c1c0c0c7cacbcbbed0d6d6a5a3a3a2c2c1c0c0c6c8cacac9d4d7d6a5a3a3a2c2c0bfbfc6c7c9c9ccd5d7d7a5a3a3a2c1c0bebfc6c7c8c9ced6d8d9a5a3a3a2c1c0bebec5c7c8c8ced6d8d9a5a3a3a2c1bfbdbec4c6c7c8ced6d7d8a5a4a3a3c0bebcbdc3c5c6c6cfd6d7d5a5a4a3a3bfbdbcbcc2c4c5c4d1d4d3d4a5a4a3a3bfbdbcbcc1c3c5c3d1d2d4d4a5a4a3a3bfbdbcbcc1c3c5c3d1d2d4d4a6a4a4a4bebcbbbcc0c1c3c2d1d1d4d4a6a4a4a4bebcbbbcbfc0c2c1d3d2d4d4a6a4a4a4bebcbbbcbebfc1c1d2d2d4d4a6a5a5a5bdbcbbbbbcbec0bfcfd2d4d3a6a5a5a5bdbcbbbbbcbec0bfcfd2d4d3a6a5a5a5bdbbbabbbabbbebeced1d3d3a7a5a5a5bdbbbabbb8b8bcbbcdd1d3d2a7a6a6a6bcbbbabbb6b7bab9cdd1d3d2a7a6a6a6bcbbbabbb5b5b8b7ccd0d2d2a7a6a6a6bcbbbabbb5b5b8b7ccd0d2d2a7a6a6a7bcbbbabbb3b3b6b5cacfd2d1a8a7a7a7bcbab9bab2b2b4b2cbd0d1cfa8a7a7a8bcbab9bab0b0b4b2cbcfd1ceaaa8a8a8bcbab9baaeb0b2b2c9cecfcdaaa8a8a8bcbab9baaeb0b2b2c9cecfcdaaa8a8a8bbbab9baadafb2b3c7cccdccaaa9aaaabbbab9b9afb3b2b7c7cbcecbabaaaaaabbb9b9b9b0b4b4bbc7cbcdcbabaaabaabbb9b8b9b2b4b8bec6caccc9abababaabbb9b8b9b2b4b8bec6caccc9acabababbbb9b8b9b4b6babfc6c9cbc9acabababbab9b8b9b8babcc0c6c9c9c7acabababbbb9b8b9babdc0c5c6c8c9c7adacacacbab9b8b9bfc1c6c9c5c7c8c5adacacacbab9b8b9bfc1c6c9c5c7c8c5adacacacbab8b7b9c1c6cac9c5c6c7c5adadadadbab9b7b9c6d0cfc8c5c6c6c5aeaeaeadbab8b7b9c9d6d1cbc4c7c5c5aeaeaeaebab8b7b9ccded8d1c4c5c4c4aeaeaeaebab8b7b9ccded8d1c4c5c4c4afaeafaebab8b7b8cee1d8d5c3c5c5c4afafafafbab8b6b8cfe6dcdac3c5c6c2b0afb0afbab8b6b7cee8dddbc1c5c5c1b0b0b0b0b9b7b6b7c7eadddec0c4c3c1b0b0b0b0b9b7b6b7c7eadddec0c4c3c1b0b0b0b0b9b6b6b5c4eadde0c0c1c1c0b2b2b2b2b8b4b4b3c4eadedfbfc1c1c0b2b3b3b2b6b4b3b2c7e8dbdabfc0c0bfb3b4b3b4b5b2b0afcde3dad7bfc0bfbfb3b4b3b4b5b2b0afcde3dad7bfc0bfbfb3b4b4b4b4b1afaed0e0dbd5bfbfbfc0b4b4b4b5b2aeabaad1dedcd3bfbfbfbfb4b4b4b5b1acaaa9d1dddbd3bfbfbfbfb4b4b4b5afaaaaa7cfdad9d6bfbfbfbfb4b4b4b5afaaaaa7cfdad9d6bfbfbfbf';
  function portraitClip() { return video.videoWidth === 816 && video.videoHeight === 1440; }

  // Camera tuning (positions per second; real speed of the villa clip = 24 positions/s). Desktop (wheel, trackpad);
  // touch devices have their own values (MOBILE, below).
  var V_MAX = 160;         // top speed
  var TAU = 0.15;          // s, glide of the target: the camera's weight - and how far it trails the scroll
  var OMEGA = 13;          // 1/s, how closely the camera follows the gliding target (critically damped: no overshoot)
  var TAU_PUSH = 0.06;     // s, the target's speed reaches the camera as a push that builds up (no jolt per wheel notch)
  var A_MAX = 550;         // positions/s^2, acceleration limit (reached gradually)
  var J_MAX = 9000;        // positions/s^3: how fast the acceleration itself may change - a wheel notch or a new touch
                           // starts the camera with a short ramp, not a kick
  // landing (see the header)
  var REST_R = 4;          // the resting frame lies within this many positions of the scroll position (sync window)
  var LAND_T = 0.3;        // s, preferred landing: from the hand-over to the last visible frame change
  var LAND_T_HI = 0.6;     // s, longest landing; a longer way is first covered by the follower
  var LAND_LAST = 0.1;     // s, the last frame interval (the one that brings the resting frame) should not be longer
  var LAND_T_FLING = 0.9, LAND_T_FLING_HI = 1.6;   // s, the same after a touch fling (the momentum carries further)
  var SLOW_IN = 5;         // positions/s: scrolling slower than this (a momentum tail, a crawl) counts as stopped
  var STEP_HOLD = 60;      // ms, wheels without smooth scrolling jump per notch: a gap this short is not a stop yet

  var U = [], REL = [], LX = 0;      // timeline: U[i] = source frame of camera position i
  var knownClip = false, clipBright = CLIP_BRIGHT;   // clipBright: CLIP_BRIGHT of the clip playing (set with the timeline)
  var ready = false, inView = true, raf = 0, lastT = 0;
  var reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  video.muted = true;
  video.pause();
  // Safety net: nothing may start playback.
  video.addEventListener('play', function () { video.pause(); });

  function progress() {
    var r = hero.getBoundingClientRect();
    var dist = r.height - stage.offsetHeight;
    if (dist <= 0) return 0;
    var p = -r.top / dist;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function buildTimeline(frames) {
    U = []; REL = [];
    var portrait = portraitClip(), rel = (portrait ? CLIP_REL_PORTRAIT : CLIP_REL).split(',');
    clipBright = portrait ? CLIP_BRIGHT_PORTRAIT : CLIP_BRIGHT;
    var known = knownClip = frames === CLIP_FRAMES;
    for (var f = 0; f < frames; f++) if (!known || f % 5 !== 1) U.push(f);
    for (var i = 0; i < U.length; i++) REL.push(known ? +rel[i] / 100 : 1);
    LX = U.length - 1;
  }

  // ---- hero look: sand fade at the end of the hero + adaptive gradient behind the text
  // Horizon Chapter: only when the Method section follows the hero (all homepages); otherwise the previous behaviour.
  var method = document.querySelector('#hero ~ .method'), CHAPTER = !!method;
  var OUT_FROM = 0.46, OUT_TO = 0.58, out = 0, outCls = false;   // heading + buttons leave before Method arrives
  // sand fade: with the chapter a light, late haze over the bottom of the video (66% -> 78% of the scroll), only there
  // to support the Method label and heading as they enter - the veil behind the steps scrolls in with Method itself
  // (css/hero-video.css); otherwise the original fade over the last 20%
  var SAND_FROM = CHAPTER ? 0.66 : 0.8, SAND_TO = CHAPTER ? 0.78 : 1;
  // its gradient (y 0 top .. 1 bottom -> opacity at full strength): css/hero-video.css (.hero2-ov / chapter version)
  var FADE = CHAPTER ? [[0, 0], [.60, 0], [.75, .06], [.85, .20], [.93, .40], [1, .52]]
                     : [[0, 0], [.38, 0], [.54, .14], [.70, .40], [.85, .72], [1, 1]];
  if (CHAPTER) hero.classList.add('is-chapter');
  var body = document.body, textBlock = hero.querySelector('.hero2-in'), sand = -1;
  // Touch devices (same query as the mobile block in css/hero-video.css). There --hero-sand is set on the hero
  // itself, so a change restyles only the hero (on <body> it restyles the whole page); desktop keeps <body>.
  var MOBILE = !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);
  var varHost = hero;
  // Touch devices: the portrait crop shows ~665 of the clip's 2560 px, so one camera step moves the picture ~2.2x more
  // (relative to the screen) than on desktop. A lower top speed keeps the fastest on-screen motion close to desktop's.
  // The finger moves the page continuously (no wheel notches to smooth over), so the follower is tuned on its own.
  if (MOBILE) { V_MAX = 75; TAU = 0.12; OMEGA = 13; TAU_PUSH = 0.06; A_MAX = 350; J_MAX = 9000; LAND_T = 0.35; }
  // All devices: the floating WhatsApp button (.wa-fab) stays hidden while the video is in progress (.is-playing
  // on the hero, see css/hero-video.css) and returns once the final frame has been painted.
  function fabHold(on) { hero.classList.toggle('is-playing', on); }
  fabHold(true);
  var scrim = document.createElement('div');       // decorative layer for the adaptive gradient (css/hero-video.css)
  scrim.className = 'hero2-scrim'; scrim.setAttribute('aria-hidden', 'true');
  var ov = hero.querySelector('.hero2-ov');
  if (ov && ov.parentNode) ov.parentNode.insertBefore(scrim, ov.nextSibling); else stage.insertBefore(scrim, stage.firstChild);

  function smoothstep(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function updateSand() {
    var p = progress();
    var outBig = CHAPTER && updateOut(p);
    var s = smoothstep((p - SAND_FROM) / (SAND_TO - SAND_FROM));
    if (s === sand) { if (outBig) updateShade(); return; }
    var big = sand < 0 || Math.abs(s - sand) > 0.02 || s === 0 || s === 1;
    sand = s; varHost.style.setProperty('--hero-sand', s.toFixed(4));
    if (big || outBig) updateShade();              // the sand fade also brightens what is behind the text
  }
  // Horizon Chapter: the heading and buttons leave (opacity/translate in css/hero-video.css) before Method arrives.
  // Returns true when the change is large enough for the text gradient (which leaves with the text) to follow.
  function updateOut(p) {
    var o = smoothstep((p - OUT_FROM) / (OUT_TO - OUT_FROM));
    if (o === out) return false;
    var big = Math.abs(o - out) > 0.02 || o === 0 || o === 1;
    out = o; hero.style.setProperty('--hero-out', o.toFixed(4));
    if ((o >= 0.999) !== outCls) { outCls = o >= 0.999; hero.classList.toggle('is-out', outCls); }
    return big;
  }
  function fadeAt(y) {                             // sand fade opacity at a height of the hero (0 top, 1 bottom)
    var st = FADE;
    for (var i = 1; i < st.length; i++) if (y <= st[i][0]) return st[i - 1][1] + (st[i][1] - st[i - 1][1]) * (y - st[i - 1][0]) / (st[i][0] - st[i - 1][0]);
    return 1;
  }
  function updateShade() {
    if (!knownClip || shown < 0 || !video.videoWidth || !textBlock) return;
    var base = shown * 32, sr = stage.getBoundingClientRect(), r = textBlock.getBoundingClientRect();
    var s = Math.max(sr.width / video.videoWidth, sr.height / video.videoHeight);   // object-fit: cover
    var vw = video.videoWidth * s, vh = video.videoHeight * s, ox = (vw - sr.width) / 2, oy = (vh - sr.height) / 2;
    var x0 = (r.left - sr.left + ox) / vw, x1 = (r.right - sr.left + ox) / vw;
    var y0 = (r.top - sr.top + oy) / vh, y1 = (r.bottom - sr.top + oy) / vh;
    var sum = 0, wsum = 0, sd = sand < 0 ? 0 : sand;
    for (var row = 0; row < 4; row++) for (var col = 0; col < 4; col++) {
      var a = Math.max(0, Math.min(x1, (col + 1) / 4) - Math.max(x0, col / 4)) * Math.max(0, Math.min(y1, (row + 1) / 4) - Math.max(y0, row / 4));
      if (!(a > 0)) continue;
      var cell = parseInt(clipBright.substr(base + (row * 4 + col) * 2, 2), 16);
      var cy = (Math.max(y0, row / 4) + Math.min(y1, (row + 1) / 4)) / 2 * vh - oy;
      var f = fadeAt(cy / sr.height) * sd;
      sum += (cell * (1 - f) + 233 * f) * a; wsum += a;
    }
    if (!wsum) return;
    var eff = sum / wsum;
    // deepen the brighter parts behind the text enough for white type (measured: heading >= 3:1, subtitle >= 4.5:1 in
    // nearly every frame with the gradient in css/hero-video.css); a little more support only during the final transition
    var cap = 0.7 + 0.15 * sd, aim = 70 - 25 * sd;
    var shade = Math.max(0, Math.min(cap, (eff - aim) / (eff - 10)));
    // gradient strength = the scrim layer's opacity (css/hero-video.css); it leaves together with the text
    scrim.style.opacity = (shade * (1 - out)).toFixed(3);
  }

  // ---- seek pipeline: one seek at a time; the next one only after the decoded frame has been painted
  var shown = -1, busy = false, target = 0;
  var painted = 0;                               // source frame on screen (what the header's brightness read sees)
  function pump() {
    if (!ready || target === shown || busy || video.seeking) return;
    shown = target; busy = true;
    if (target !== U[LX]) fabHold(true);
    seekTo((target + 0.3) / FPS);                // aim slightly past the frame start (never the previous frame)
  }
  video.addEventListener('seeked', function () {
    if (!video.seeking) seekAt = 0;              // (watchdog) no seek outstanding any more
    painted = Math.max(0, Math.round(video.currentTime * FPS - 0.3));   // one seek at a time: this is the frame now shown
    if (!ready) { start(); return; }
    requestAnimationFrame(function () {
      busy = false;
      if (shown === U[LX]) fabHold(false);        // final frame is on screen: the floating button may show again
      // At ~30 Hz or less (Yandex power saving / simplified mode, slow devices) start the next seek in this frame: waiting
      // for the next frame's tick would allow only one new video frame per two animation frames (15 per second at 30 Hz).
      // At 60 Hz and above the gate stays as it was (measured: earlier seeks there cost a few missed frames).
      if (fgap > 25) pump();
      updateShade(); schedule(); toneLater();     // the next seek is not held up by the header read (it runs in its own task)
    });
  });

  // Back from the background (app switch, tab switch, bfcache): mobile browsers can suspend the paused video while the
  // page is hidden and drop a seek that was in flight, so its 'seeked' never comes and the one-seek-at-a-time gate stays
  // shut. On return, re-issue the current frame: a new seek replaces any pending one and reopens the gate.
  // Before the start (ready) the start seek is asked for again, or - with no metadata yet - the watchdog takes over.
  function revive() {
    if (document.visibilityState !== 'visible') return;
    if (!ready) { if (video.readyState >= 1) seekTo(0.3 / FPS); else watchSoon(); return; }
    shown = target; busy = true;
    seekTo((target + 0.3) / FPS);
  }

  // Watchdog. A seek whose 'seeked' never came (a stalled download, a decoder the browser suspended, a dropped seek) or a
  // start that never got its first frame used to stop the hero for good - and some phones then paint nothing at all
  // (white hero; the poster under the video, css/hero-video.css, now covers that). Every seek goes through seekTo().
  // One timer checks while a seek is outstanding or the video is not running yet:
  //  - after the start: the frame wanted now is asked for again; the new seek replaces the stuck one (and pump() also
  //    waits while video.seeking), so there is never more than one seek at a time;
  //  - before the start: when no data has arrived for 2.5 s, the source is loaded again (video.load(): the source
  //    selection runs again); when data arrives but the start seek is stuck, that seek is asked for again; a load that
  //    is merely slow is left alone. start() runs only once (ready), however many times this happens.
  // Retries back off (1.5, 3, 6, then every 8 s) and do not give up: the video takes over as soon as it can.
  var seekAt = 0, netAt = performance.now(), wdTimer = 0, wdTries = 0, srcFails = 0, wdOff = false;
  function seekTo(time) { seekAt = performance.now(); video.currentTime = time; watchSoon(); }
  function wdWait() { return Math.min(8000, 1500 * Math.pow(2, wdTries)); }
  function watchSoon() { if (!wdTimer && !wdOff) wdTimer = setTimeout(watch, wdWait()); }
  function watch() {
    wdTimer = 0;
    if (wdOff || (ready && !seekAt && !video.seeking && video.readyState >= 2)) { wdTries = 0; return; }   // running
    var now = performance.now();
    if (document.visibilityState === 'visible' && !(seekAt && now - seekAt < wdWait()) && recover(now)) wdTries++;
    watchSoon();
  }
  function recover(now) {                       // true when it did something
    if (!ready) {
      if (now - netAt > 2500) { seekAt = 0; video.load(); return true; }           // nothing arriving: load again
      if (video.readyState >= 1 && seekAt) { seekTo(0.3 / FPS); return true; }    // data arrives, start seek stuck
      return false;                                                                // still loading: wait
    }
    shown = target; busy = true;
    seekTo((target + 0.3) / FPS);
    return true;
  }
  ['loadedmetadata', 'loadeddata', 'progress', 'canplay'].forEach(function (e) {
    video.addEventListener(e, function () { netAt = performance.now(); });
  });
  document.addEventListener('visibilitychange', revive);
  window.addEventListener('pageshow', function (e) { if (e.persisted) revive(); });

  // ---- cinematic camera
  var pos = 0, vel = 0, acc = 0, lastDir = 0, fgap = 16.7;          // camera; the browser's frame interval
  var sm = null, push = 0;                                            // follower: gliding target and its push
  var plan = null;                                                    // planned ending (glide to the resting frame)
  var gPrev = null, gSpeed = 0, lastInT = -1e9, lastFastT = -1e9, stepIn = false, inGap = 17;   // scroll input tracking
  var K_SM = 1 - Math.exp(-0.004 / TAU), K_PUSH = 1 - Math.exp(-0.004 / TAU_PUSH);   // per 4 ms sub-step

  // Touch momentum. When the finger lifts, the page scrolls on by itself and slows down; following that tail made the
  // stop a crawl (the last frames held 130-250 ms). From ~70 ms after the lift (the first frames of momentum show how it
  // fades), the landing aims at where the momentum will stop: the scroll position + its speed now x its decay time,
  // measured from the scroll itself (speed / deceleration of a parabola through the last ~160 ms of input), at most
  // TAU_FLING (iOS: speed x0.998 per ms, e by every 0.5 s; Chrome's fling fades much faster); re-estimated every frame.
  // The resting frame is then chosen only up to that estimated end - beyond it only as far as a gentle stop needs when the
  // camera has already passed it: a momentum that stops sooner than estimated still leaves the camera inside the sync
  // window, without turning back.
  // The landing is planned as soon as it can coast there (canGlide); until then the camera follows the scroll as before.
  // While the finger is on the screen nothing changes; a new touch drops the estimate at once (and scrolling again hands
  // back to the follower as always).
  var TAU_FLING = 0.5;                                                // s, longest decay time assumed
  var fling = 0, flingAt = 0, flingWant = 0, lastInDir = 0, inHist = [];   // fling: 0 none, 1 finger just lifted, 2 momentum
  window.addEventListener('touchstart', function () { fling = 0; }, { passive: true });
  window.addEventListener('touchend', function (e) { if (!e.touches || !e.touches.length) { fling = 1; schedule(); } }, { passive: true });
  window.addEventListener('touchcancel', function () { fling = 0; }, { passive: true });   // no estimate: as before
  function inputVel(t) {      // scroll speed now (positions/s, signed): slope of the last ~100 ms of input, carried to now
    var n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < inHist.length; i += 2) {
      if (t - inHist[i] > 100) continue;
      var x = (inHist[i] - t) / 1000, y = inHist[i + 1];
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    var den = n * sxx - sx * sx;
    if (n < 2 || !(den > 1e-12)) return 0;
    return (n * sxy - sx * sy) / den * Math.exp(sx / n / TAU_FLING);  // slope = speed at the samples' mean time
  }
  function inputDecay(t, v) {  // decay time of the scroll's speed now (s): speed / deceleration of a parabola through ~160 ms
    var n = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0, gl = inHist[inHist.length - 1];
    for (var i = 0; i < inHist.length; i += 2) {
      if (t - inHist[i] > 160) continue;
      var x = (inHist[i] - t) / 1000, y = inHist[i + 1] - gl, x2 = x * x;
      n++; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; y0 += y; y1 += y * x; y2 += y * x2;
    }
    var det = n * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (n < 4 || !(Math.abs(det) > 1e-24)) return TAU_FLING;
    var a = 2 * (n * (s2 * y2 - s3 * y1) - s1 * (s1 * y2 - s2 * y1) + y0 * (s1 * s3 - s2 * s2)) / det;   // deceleration now
    return a * v < 0 ? Math.max(0.05, Math.min(TAU_FLING, -v / a)) : TAU_FLING;
  }
  // Frame cadence while landing at 30 Hz or less (see tick): the frame on screen (camera position), when it changed and
  // how long the frame before it was held.
  var cadI = -1, cadT = 0, cadH = 0;

  // Quintic from (p0, v0, a0) to (p0 + D, v1, a1) in T s: continues the current motion without a jump in speed or
  // acceleration and ends exactly with the given speed and acceleration.
  function quint(p0, v0, a0, D, v1, a1, T, el) {
    var s = Math.max(0, Math.min(1, el / T)), v0T = v0 * T, a0T = a0 * T * T, v1T = v1 * T, a1T = a1 * T * T;
    var c3 = 10 * D - 6 * v0T - 4 * v1T - 1.5 * a0T + 0.5 * a1T, c4 = -15 * D + 8 * v0T + 7 * v1T + 1.5 * a0T - a1T,
      c5 = 6 * D - 3 * v0T - 3 * v1T - 0.5 * a0T + 0.5 * a1T;
    var s2 = s * s, s3 = s2 * s, s4 = s3 * s;
    return { p: p0 + v0T * s + 0.5 * a0T * s2 + c3 * s3 + c4 * s4 + c5 * s4 * s,
      v: (v0T + a0T * s + 3 * c3 * s2 + 4 * c4 * s3 + 5 * c5 * s4) / T,
      a: (a0T + 6 * c3 * s + 12 * c4 * s2 + 20 * c5 * s3) / (T * T), done: false };
  }
  // The landing: a quintic from (p0, v0, a0) to the resting frame p0 + d with zero speed and zero braking in T s - no snap,
  // no brake jolt; speed and acceleration stay continuous when scrolling again hands back to the follower. From rest
  // (v0 = a0 = 0) it is a short ease-in-out. The resting frame is on screen from half a position before it, so the end of
  // the curve is invisible.
  function glideAt(pl, el) {
    if (el >= pl.T) return { p: pl.p0 + pl.d, v: 0, a: 0, done: true };
    return quint(pl.p0, pl.v0 || 0, pl.a0 || 0, pl.d, 0, 0, pl.T, el);
  }
  // Can the camera land from here within tHi s (or, from rest, by a short settle)? Long catch-ups (page jumps, a fast
  // scroll back) are left to the follower, which accelerates and cruises smoothly; the landing only ever finishes.
  function canGlide(g, tHi) {
    var av = Math.abs(vel), near = Math.max(0, Math.abs(g - pos) - REST_R);
    return av > 1.5 ? 2 * near / av <= tHi && (g - pos) * vel > -REST_R : Math.abs(g - pos) <= REST_R + 1.5;
  }
  // Choose the landing: the resting frame (sharp, inside the sync window around g, never behind the direction of travel)
  // and its time. Only curves whose speed never rises; preferred: a landing of about `want` s and a short last frame
  // interval - and, as before, the sharpest frame. `ahead`: how far past g the frame may lie (REST_R; for an estimated
  // momentum end 0, or as far as a gentle stop needs when the camera has already passed it). Once per stop.
  function makeGlide(t, g, a0, want, ahead) {
    var av = Math.abs(vel), moving = av > 1.5, dir = moving ? (vel > 0 ? 1 : -1) : (lastDir || (g >= pos ? 1 : -1));
    var ab = moving ? Math.max(0, -dir * (a0 || 0)) : 0, best = null;   // braking already under way (positions/s^2)
    for (var r = Math.max(0, Math.ceil(g - REST_R)); r <= Math.min(LX, Math.floor(g + ahead)); r++) {
      var d = r - pos, D = d * dir, sharp = (r <= 0 || r >= LX) ? 1.2 : REL[r], score;
      if (D < -0.5) continue;                                          // never turn back
      if (!moving) {                                                   // from rest: a short ease-in-out (as before)
        score = sharp - 0.03 * Math.abs(r - g) - 0.12 * Math.abs(r - Math.round(pos));
        if (!best || score > best.score) best = { score: score, pl: { T: Math.min(0.6, 0.3 + 0.07 * Math.abs(d)), d: d, p0: pos } };
        continue;
      }
      if (D < 0.6) continue;                                           // moving: the resting frame must still lie ahead
      var Tc = 2 * D / av;                                             // a pure coast
      for (var j = 0; j < 3; j++) {
        var pl = { T: Tc * [0.9, 1, 1.15][j], v0: dir * av, a0: -dir * ab, d: d, p0: pos }, vp = av, rise = false, tv = 0, t15 = 0;
        for (var i = 1; i <= 48; i++) {                                // speed never rises; when are 1.5 and 0.5 left
          var q = glideAt(pl, pl.T * i / 48), sp = q.v * dir, left = (pl.p0 + d - q.p) * dir;
          if (sp > vp + 0.5 || sp < -0.3) rise = true;
          vp = Math.min(vp, sp);
          if (!t15 && left <= 1.5) t15 = pl.T * i / 48;
          if (!tv && left <= 0.5) tv = pl.T * i / 48;
        }
        var last = tv - t15;                                           // the last frame interval (brings the resting frame)
        score = sharp - 0.06 * Math.abs(r - g) - (rise ? 3 : 0)
          - 0.5 * Math.max(0, Math.abs(tv - want) - 0.05) / 0.1        // landing time
          - 1.5 * Math.max(0, last - LAND_LAST) / 0.03;                // a long last frame interval reads as a crawl
        if (!best || score > best.score) best = { score: score, pl: pl };
      }
    }
    if (!best) {
      if (moving) {    // nothing ahead inside the window (the camera has passed it): stop on the next frame ahead, no turn back
        var rf = Math.max(0, Math.min(LX, Math.round(pos + dir * Math.max(0.6, Math.min(3, 0.12 * av))))), Df = Math.max(0.05, (rf - pos) * dir);
        best = { pl: { T: 2 * Df / av, d: dir * Df, v0: dir * av, a0: 0, p0: pos, forced: true } };
      } else { var rr = Math.max(0, Math.min(LX, Math.round(g))); best = { pl: { T: 0.5, d: rr - pos, p0: pos } }; }
    }
    best.pl.t0 = t; best.pl.g0 = g;
    return best.pl;
  }
  // the follower: a critically damped camera pulled by a gliding target, with soft limits (used while scrolling and
  // for long catch-ups)
  function follow(dt, g) {
    if (sm === null) { sm = pos; push = vel; }
    for (var h = 0; h < dt - 1e-9; h += 0.004) {
      var st = Math.min(0.004, dt - h), full = st > 0.0039, prev = sm;
      sm += (g - sm) * (full ? K_SM : 1 - Math.exp(-st / TAU));                         // gliding target
      push += ((sm - prev) / st - push) * (full ? K_PUSH : 1 - Math.exp(-st / TAU_PUSH));   // its speed, as a push
      var at = OMEGA * OMEGA * (sm - pos) + 2 * OMEGA * (push - vel);                    // critically damped follower
      at = A_MAX * Math.tanh(at / A_MAX);                                                 // the limit is reached gradually
      if (at * vel > 0) at *= Math.max(0, 1 - Math.pow(Math.abs(vel) / V_MAX, 4));        // approach top speed softly
      acc += Math.max(-J_MAX * st, Math.min(J_MAX * st, at - acc));                       // ...and without a jolt (J_MAX)
      vel = Math.max(-V_MAX, Math.min(V_MAX, vel + acc * st));
      pos += vel * st;
    }
  }

  function tick(t) {
    raf = 0;
    if (!ready || (reduce && reduce.matches)) return;
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    if (lastT && t - lastT < 100) fgap = fgap * 0.9 + (t - lastT) * 0.1;   // the browser's frame interval (seek pacing)
    lastT = t;
    var g = progress() * LX;
    if (gPrev !== null) {                        // scroll input: when it last moved, how fast, and whether it jumps per notch
      var jump = Math.abs(g - gPrev);
      if (jump > 1e-6) {
        if (t - lastInT < 150) inGap = inGap * 0.7 + (t - lastInT) * 0.3;   // the rhythm of the scroll updates
        lastInT = t; stepIn = jump > 3;
      }
      if (dt > 0) gSpeed += (jump / dt - gSpeed) * (1 - Math.exp(-dt / 0.1));
      else if (jump > 1e-6) gSpeed = Math.max(gSpeed, SLOW_IN);   // first frame after a pause: the input counts as scrolling
    }
    gPrev = g;
    inHist.push(t, g);
    while (inHist.length > 2 && t - inHist[0] > 170) inHist.splice(0, 2);
    if (inHist.length > 2 && Math.abs(g - inHist[inHist.length - 3]) > 1e-6) lastInDir = g > inHist[inHist.length - 3] ? 1 : -1;
    if (gSpeed >= SLOW_IN) lastFastT = t;
    // touch momentum (see above): the landing aims at its estimated end
    var aim = g;
    if (fling) {
      var vf = inputVel(t);
      if (t - lastInT > Math.max(120, 3 * fgap)) fling = 0;          // no (more) momentum: the scroll position itself
      else if (fling === 1) {                                        // lifted: watch the first ~70 ms of momentum
        if (!flingAt) flingAt = t;
        if (t - flingAt >= 70) fling = Math.abs(vf) >= SLOW_IN ? 2 : 0;
      }
      if (fling === 2) {
        var tf = inputDecay(t, vf);
        aim = Math.max(0, Math.min(LX, g + vf * tf));
        flingWant = Math.max(LAND_T, Math.min(LAND_T_FLING, 1.8 * tf));   // a short fling lands sooner
      }
    }
    if (fling !== 1) flingAt = 0;
    // the visitor is still scrolling: input within its own rhythm (per frame, or every few frames on some mice and
    // trackpads; a notch gap without smooth scrolling), not just a crawl
    var scrolling = fling !== 2 && t - lastInT <= (stepIn ? STEP_HOLD : Math.max(1.5 * fgap, Math.min(110, 2.2 * inGap))) && t - lastFastT < 120;
    if (scrolling) {
      if (plan) {                                // hand back to the follower with the same speed and acceleration
        var q = glideAt(plan, (t - plan.t0) / 1000);
        sm = pos + q.a / (OMEGA * OMEGA); push = vel; plan = null;
      }
      follow(dt, g);
    } else {
      // stopped: glide to the resting frame (re-plan if the scroll drifted out of the sync window); a long catch-up
      // first continues with the follower until a coast can finish it
      // (a forced stop just past the window is kept unless the scroll itself moves)
      if (plan && Math.abs(plan.p0 + plan.d - aim) > REST_R + 0.5 && (!plan.forced || Math.abs(aim - plan.g0) > 0.5)) {
        var qq = glideAt(plan, (t - plan.t0) / 1000); sm = pos + qq.a / (OMEGA * OMEGA); push = vel; plan = null;
      }
      // the landing starts only once the camera no longer speeds up (or cruises at its top speed): one continuous slow-down
      // never turn back for a misjudged momentum: if the camera has already passed the window in the direction the
      // visitor scrolled, it stops on the next frame ahead (makeGlide) - a visitor who scrolls back is followed as always
      var fl = fling === 2, passed = Math.abs(vel) > 1.5 && (aim - pos) * vel < -REST_R && lastInDir * vel > 0;
      if (!plan && (passed || ((acc * vel <= 0 || Math.abs(vel) > 0.97 * V_MAX) && canGlide(aim, fl ? LAND_T_FLING_HI : LAND_T_HI))))
        plan = makeGlide(t, aim, acc, fl ? flingWant : LAND_T, fl ? Math.max(0, Math.min(REST_R, (pos - aim) * (vel > 0 ? 1 : -1) + 0.1 * Math.abs(vel))) : REST_R);
      if (plan) { var p = glideAt(plan, (t - plan.t0) / 1000); pos = p.p; vel = p.v; acc = p.a; sm = null; }
      else follow(dt, g);
    }
    if (Math.abs(vel) > 1.5) lastDir = vel > 0 ? 1 : -1;
    if (pos <= 0 || pos >= LX) { pos = Math.max(0, Math.min(LX, pos)); if ((pos === 0 && vel < 0) || (pos === LX && vel > 0)) vel = 0; }
    var ri = Math.max(0, Math.min(LX, Math.round(pos))), ci = ri, land = !!plan && !scrolling;
    // 30 Hz or less, while landing: the next frame comes no sooner than the previous one was held. Otherwise speeds of
    // 15-30 positions/s alternate 1- and 2-frame holds (33/67/33/67 ms) - a judder instead of a gradual slow-down. Only a
    // one-position step is held, and only when the next refresh will not need two: the picture never skips a frame for it.
    if (land && fgap > 25 && cadI >= 0 && Math.abs(ri - cadI) === 1 && t - cadT < cadH - fgap / 2 &&
      Math.abs(Math.round(pos + vel * fgap / 1000) - cadI) <= 1) ci = cadI;
    else if (ri !== cadI) { cadH = land && cadI >= 0 && t - cadT < 250 ? t - cadT : 0; cadT = t; cadI = ri; }   // (a longer gap is no cadence)
    target = U[ci];
    pump();
    // keep animating while the visitor scrolls, the glide runs, or a frame is still pending (or held)
    if (scrolling || !plan || t - plan.t0 < (plan.T + (plan.tz || 0) + (plan.tb || 0)) * 1000 || target !== shown || ci !== ri) schedule();
    else lastT = 0;
  }

  function schedule() {
    if (!raf && inView) raf = requestAnimationFrame(tick);
  }

  function start() {
    if (ready || !(video.duration > 0)) return;
    buildTimeline(Math.max(1, Math.round(video.duration * FPS)));
    pos = progress() * LX;                       // start where the page is (e.g. after a reload mid-page)
    ready = true;
    hero.classList.add('is-ready');
    updateSand();
    schedule();
  }

  // ---- adaptive tone for the top headings (transparent header over the hero).
  // The same principle as the main heading. What is behind each zone is sampled on every displayed frame (video plus
  // the sand fade). (The secondary hero button needs no sampling: its colour follows --hero-sand in css/hero-video.css.)
  // Each zone gets a tone from 0 (ink) to 1 (white), chosen by which colour has more contrast against
  // what is behind it. The tone never switches: it glides (eased, ~0.5 s) so the text passes the in-between grey only
  // briefly. Behind white text, one soft gradient runs across the top of the hero (full width, fading downward), as
  // strong as the most demanding heading needs (never anything behind dark text: no glow, no patches).
  var header = document.getElementById('header');
  var HC = 96, HRW = 6;                                     // sample grid behind a zone
  var cvs = document.createElement('canvas');
  cvs.width = HC; cvs.height = HRW;
  var ctx = null;
  // GPU-backed canvas - the scaling happens on the GPU and only the 96x6 result is read back to the CPU (a CPU canvas
  // would copy the whole decoded 2560x1440 frame back first: ~10-30 ms per read on desktop)
  try { ctx = cvs.getContext('2d', { willReadFrequently: false }); } catch (e) {}
  var TONE_S = 0.5, SHADE_TAU = 0.12, SMOOTH_TAU = 0.06;   // seconds
  var DWELL_MS = 120;                                      // a new tone must hold this long before the text moves
  var H_AIM = 80, H_CAP = 0.8, H_MARGIN = 1.25;            // shade target / limit, hysteresis (contrast ratio)
  var Y_INK = relY(0x22) * 0.2126 + relY(0x1E) * 0.7152 + relY(0x19) * 0.0722;
  var zones = [], scrims = [], hlive = false, hraf = 0, hlast = 0, recheck = 0;
  function addScrim(cls, parent, before) {                 // decorative layer for a zone's feathered shade
    var el = document.createElement('div');
    el.className = cls; el.setAttribute('aria-hidden', 'true');
    parent.insertBefore(el, before); scrims.push(el);
    return el;
  }
  if (ctx) {
    if (header) {
      header.classList.add('hdr-adapt'); header.classList.remove('on-dark');
      var hs = addScrim('hdr-scrim', header, header.firstChild);
      zones.push({ prop: '--hb', area: 'header', root: header, sel: '.brand', host: header, origin: header, scrim: hs },
        { prop: '--hn', area: 'header', root: header, sel: '.navlink, .navdrop-t, .langdrop-t', host: header, origin: header, scrim: hs });
    }
    zones.forEach(function (z) { z.p = 0; z.t = 0; z.white = false; z.items = []; z.lastT = ''; });
  }
  // Header and heading boxes (relative to the header) change only with size or fonts - measure them then, not per frame.
  var geo = null;
  function measure() {
    var hr = header.getBoundingClientRect();
    geo = { w: hr.width, h: hr.height, rects: zones.map(function (z) {
      return Array.prototype.map.call(z.root.querySelectorAll(z.sel), function (el) {
        var r = el.getBoundingClientRect();
        return r.width && r.height ? { left: r.left - hr.left, right: r.right - hr.left, top: r.top - hr.top, width: r.width, height: r.height } : null;
      });
    }) };
  }
  if (zones.length) {
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { geo = null; });
      ro.observe(header);
      zones.forEach(function (z) { Array.prototype.forEach.call(z.root.querySelectorAll(z.sel), function (el) { ro.observe(el); }); });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { geo = null; });
  }
  function relY(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function pct(a, q) { a.sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; }

  // Header luminance table: the same brightness read as sample() without touching the video's pixels while scrolling
  // (reading video pixels back from the GPU blocked the main thread for 30-140 ms per read). One greyscale WebP per video
  // source, made from that source's decoded frames (img/video/villa-hero-lum-webm.webp / -mp4.webp), holds the mean
  // luminance (0.2126 R + 0.7152 G + 0.0722 B) of every unique frame (frame 5k+1 repeats 5k): video rows 0-383 in 16x16 px
  // cells (where the header sits while the hero is pinned) and rows 384-1439 in 128x96 px cells (reached only while the
  // hero slides away). Atlas, 160 px wide: frame u's 160x24 band at rows 24u..24u+23, its 20x11 coarse block at
  // x 20*(u%8), y 24*N + 11*floor(u/8). sample() reads it at the same points its drawImage read the video (the cell each
  // point falls in); everything after that (sand fade, percentiles, thresholds, hysteresis, timing) is unchanged.
  // The file loads with low priority, is decoded off the main thread (createImageBitmap) and read once, in small slices
  // (a one-off read of this image, not the video). It is used only for a 292-frame clip 1440 px high and only for the source
  // it was made from; if it is missing, does not fit or cannot be read, sample() reads the video as before. The atlas width
  // follows the clip: video width / 16 (2560 -> 160, coarse blocks 20 wide, 8 per row - as before; portrait 816 -> 51,
  // coarse blocks 7 wide (the last column 48 px), 7 per row), the same layout tools/hero-lum/build.html writes.
  // Regenerate both files together with CLIP_REL/CLIP_BRIGHT when the video changes.
  var LUM_W = 160, LUM_BAND = 384, LUM_BK = 16, LUM_BH = 24, LUM_AKX = 128, LUM_AKY = 96, LUM_AW = 20, LUM_AH = 11, LUM_ROW = 8, LUM_VW = 2560;
  var LUM_N = CLIP_FRAMES - Math.ceil((CLIP_FRAMES - 1) / 5);      // unique frames (233)
  var lumData = null, lumState = 0, lumFor = '';                  // state: 0 not requested, 1 loading, 2 ready, -1 unavailable
  function lumLoad() {                                            // lumFor: the video source the table belongs to
    if (lumState && lumFor !== video.currentSrc) { lumState = 0; lumData = null; }   // the video switched source (e.g. the
    if (lumState || !zones.length) return;                                           // first one failed): load its own table
    var src = video.currentSrc || '', m = /^(.+)\.(webm|mp4)(?:[?#].*)?$/i.exec(src);
    if (!src || video.readyState < 1) return;                     // source not confirmed yet (it may still fail and fall
                                                                  // back to the next one): retried on loadedmetadata
    lumFor = src;
    LUM_VW = video.videoWidth; LUM_W = LUM_VW / LUM_BK; LUM_AW = Math.ceil(LUM_VW / LUM_AKX); LUM_ROW = Math.floor(LUM_W / LUM_AW);
    if (!m || LUM_VW % LUM_BK || video.videoHeight !== 1440) { lumState = -1; return; }   // no table: read the video (as before)
    lumState = 1;
    var url = m[1] + '-lum-' + m[2].toLowerCase() + '.webp', fail = function () { lumFail(src); };
    if (window.fetch && window.createImageBitmap) {               // decoded off the main thread (an <img> decodes on it)
      fetch(url, { priority: 'low' }).then(function (r) { if (!r.ok) throw r.status; return r.blob(); })
        .then(function (b) { return createImageBitmap(b); }).then(function (bmp) { lumDecode(bmp, bmp.width, bmp.height, src); }, fail);
    } else {
      var img = new Image();
      img.onload = function () { lumDecode(img, img.naturalWidth, img.naturalHeight, src); }; img.onerror = fail;
      img.src = url;
    }
  }
  function lumFail(src) { if (src !== lumFor) return; lumState = -1; lumData = null; toneLater(); }
  function lumDecode(img, iw, ih, src) {
    var H = LUM_BH * LUM_N + LUM_AH * Math.ceil(LUM_N / LUM_ROW), STEP = 480, y = 0, out = new Uint8Array(LUM_W * H), x = null;
    if (iw !== LUM_W || ih !== H) return lumFail(src);
    var c = document.createElement('canvas'); c.width = LUM_W; c.height = STEP;
    try { x = c.getContext('2d', { willReadFrequently: true }); } catch (e) {}
    if (!x) return lumFail(src);
    (function slice() {
      if (src !== lumFor) return;                                 // superseded by a table for another source
      try {
        var h = Math.min(STEP, H - y);
        x.clearRect(0, 0, LUM_W, STEP); x.drawImage(img, 0, y, LUM_W, h, 0, 0, LUM_W, h);
        var d = x.getImageData(0, 0, LUM_W, h).data;
        for (var i = 0, o = y * LUM_W; i < d.length; i += 4) out[o++] = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      } catch (e) { return lumFail(src); }
      y += h;
      if (y < H) return setTimeout(slice, 0);
      if (img.close) img.close();                                 // ImageBitmap: free the decoded image
      lumData = out; lumState = 2; toneLater();
    })();
  }
  function lumReady() {
    return lumState === 2 && lumFor === video.currentSrc && video.videoWidth === LUM_VW && video.videoHeight === 1440 &&
      Math.round(video.duration * FPS) === CLIP_FRAMES;
  }
  function lumAt(u, X, Y) {                                       // luminance at video pixel (X, Y) of unique frame u
    var w = LUM_W, h = LUM_BH, kx = LUM_BK, ky = LUM_BK, x0 = 0, y0 = u * LUM_BH;
    if (Y >= LUM_BAND) { Y -= LUM_BAND; w = LUM_AW; h = LUM_AH; kx = LUM_AKX; ky = LUM_AKY; x0 = (u % LUM_ROW) * LUM_AW; y0 = LUM_BH * LUM_N + Math.floor(u / LUM_ROW) * LUM_AH; }
    var cx = Math.min(w - 1, Math.max(0, Math.floor(X / kx))), cy = Math.min(h - 1, Math.max(0, Math.floor(Y / ky)));
    return lumData[(y0 + cy) * LUM_W + x0 + cx];                  // the cell it falls in (keeps more of the frame's contrast than blending cells)
  }
  function lumRead(sx, sy, sw, sh, rows) {                        // the HC x rows grid drawImage made from (sx, sy, sw, sh)
    var f = painted % 5 === 1 ? painted - 1 : painted, u = Math.max(0, Math.min(LUM_N - 1, f - Math.floor((f + 3) / 5))), d = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < HC; c++) d.push(lumAt(u, sx + (c + 0.5) * sw / HC, sy + (r + 0.5) * sh / rows));
    return d;
  }
  lumLoad();
  video.addEventListener('loadedmetadata', lumLoad);

  // Luminance (0-255) on a HC x HRW grid behind a viewport rect, as the visitor sees it: the video frame (object-fit:
  // cover), lightened by the sand fade, and limestone where the rect is below the stage.
  function sample(R, sr) {
    var w = sr.width, h = sr.height;
    var s = Math.max(w / video.videoWidth, h / video.videoHeight);
    var sx = (video.videoWidth * s - w) / 2 / s, sy = (video.videoHeight * s - h) / 2 / s;
    var y0 = Math.max(R.top, sr.top), vis = Math.min(R.bottom, sr.bottom) - y0;
    var rows = vis > 0 ? Math.max(1, Math.round(HRW * vis / R.height)) : 0, d = null, fromTable = rows > 0 && lumReady();
    if (fromTable) d = lumRead(sx + (R.left - sr.left) / s, sy + (y0 - sr.top) / s, R.width / s, vis / s, rows);
    else if (rows) {                                     // no table for this video: read the frame itself (as before)
      ctx.drawImage(video, sx + (R.left - sr.left) / s, sy + (y0 - sr.top) / s, R.width / s, vis / s, 0, 0, HC, rows);
      d = ctx.getImageData(0, 0, HC, rows).data;
    }
    var lum = [], sd = sand < 0 ? 0 : sand;
    for (var r = 0; r < HRW; r++) {
      var y = R.top + (r + 0.5) / HRW * R.height - sr.top, f = y >= h ? 1 : fadeAt(y / h) * sd;
      for (var c = 0; c < HC; c++) {
        var L = 233;
        if (r < rows && fromTable) L = d[r * HC + c];
        else if (r < rows) { var i = (r * HC + c) * 4; L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
        lum.push(L * (1 - f) + 233 * f);
      }
    }
    return lum;
  }

  function tone() {
    if (!zones.length || !video.videoWidth) return;
    lumLoad();                                             // (no-op once the table for the current source is requested)
    // Luminance table still loading (it calls toneLater() when ready): only the very first reading may come from the
    // video, so the header gets its first tone exactly when and as before; later readings wait for the table.
    if ((lumState === 1 || !lumState) && hlive) return;
    var now = performance.now();
    if (hlive && now - hlive < 6) return;                  // seek, scroll and re-check land in one update per frame
    var dt = hlive ? (now - hlive) / 1000 : 1;
    hlive = now;
    if (!geo) measure();
    var sr = stage.getBoundingClientRect(), solid = hdrSolid(), leaving = sr.top < -1;
    var R = { left: 0, top: 0, right: geo.w, bottom: geo.h, width: geo.w, height: geo.h };   // fixed header at the top
    var a = 1 - Math.exp(-dt / SMOOTH_TAU), lum = null, anim = false;
    try {
      if (!solid && R.width > 0 && R.height > 0) lum = sample(R, sr);   // one video read per update
      zones.forEach(function (z, zi) {
        var rects = geo.rects[zi], pool = [], items = [];
        for (var k = 0; k < rects.length; k++) {
          var er = rects[k];
          if (!er) continue;
          var it = z.items[k] || { s: 0 };
          it.x = er.left + er.width / 2; it.y = er.top + er.height / 2; it.w = er.width; it.h = er.height;
          var aim = 0;
          if (lum) {
            var c0 = Math.max(0, Math.floor((er.left - 10) / R.width * HC)), c1 = Math.min(HC - 1, Math.floor((er.right + 10) / R.width * HC));
            var own = [];
            for (var rr = 0; rr < HRW; rr++) for (var cc = c0; cc <= c1; cc++) own.push(lum[rr * HC + cc]);
            pool = pool.concat(own);
            var p80 = pct(own, 0.8);
            it.p80 = it.p80 == null || dt >= 1 ? p80 : it.p80 + (p80 - it.p80) * a;
            aim = Math.max(0, Math.min(H_CAP, (it.p80 - H_AIM) / (it.p80 - 15)));
          }
          it.aim = aim; items[k] = it;
          if (Math.abs(aim - it.s) > 0.002) anim = true;
        }
        z.items = items;
        if (solid) { z.white = false; z.since = 0; return; } // solid header: its own colours
        if (!pool.length) return;                            // nothing to measure (e.g. hero off screen): keep the tone
        var p80z = pct(pool, 0.8), p20z = pct(pool, 0.2);
        z.p80 = z.p80 == null || dt >= 1 ? p80z : z.p80 + (p80z - z.p80) * a;
        z.p20 = z.p20 == null || dt >= 1 ? p20z : z.p20 + (p20z - z.p20) * a;
        var cw = 1.05 / (relY(z.p80) + 0.05), cd = (relY(z.p20) + 0.05) / (Y_INK + 0.05);
        var white = z.white ? cw * H_MARGIN > cd : cw > cd * H_MARGIN;
        if (cd < 4.5) white = true;                        // ink only where it reads on its own; white type gets the shade
        if (leaving && !z.white) white = false;            // hero sliding away: only towards ink (the next section)
        if (z.first === undefined) {                       // first frame: unbiased choice, no fade-in
          z.first = false; white = cw >= cd; z.white = white; z.p = z.t = white ? 1 : 0;
        }
        if (white === z.white) { z.since = 0; return; }
        if (!z.since) z.since = now;                       // a new tone must hold briefly: passing glare is ignored
        if (now - z.since >= DWELL_MS) { z.white = white; z.since = 0; }
        else recheckIn(DWELL_MS - (now - z.since));
      });
    } catch (e) { zones = []; return; }                    // canvas unusable (e.g. tainted): keep the CSS defaults
    zones.forEach(function (z) { if (z.p !== (z.white ? 1 : 0) || !z.lastT) anim = true; });
    if (anim && !hraf) hraf = requestAnimationFrame(hdrAnim);
  }
  function hdrAnim(now) {
    hraf = 0;
    var dt = hlast ? Math.min(0.1, (now - hlast) / 1000) : 0.016; hlast = now;
    var busy = false, shades = scrims.map(function () { return 0; });
    zones.forEach(function (z) {
      var goal = z.white ? 1 : 0, si = scrims.indexOf(z.scrim), k = 1 - Math.exp(-dt / SHADE_TAU);
      if (z.p !== goal) { z.p = goal > z.p ? Math.min(goal, z.p + dt / TONE_S) : Math.max(goal, z.p - dt / TONE_S); busy = true; }
      z.t = z.p * z.p * z.p * (z.p * (z.p * 6 - 15) + 10);   // smootherstep: gentle at both ends, brief in the middle
      var tv = z.t.toFixed(3);
      if (tv !== z.lastT) { z.lastT = tv; z.host.style.setProperty(z.prop, tv); }
      z.items.forEach(function (it) {
        if (!it) return;
        var d = it.aim - it.s;
        if (Math.abs(d) > 0.002) { it.s += d * k; busy = true; } else it.s = it.aim;
        var S = it.s * z.t;                                  // shade only as far as the text has turned white
        if (S > shades[si]) shades[si] = S;                  // one band for the whole header: the strongest need, never stacked
      });
    });
    scrims.forEach(function (el, i) {                        // the band itself is drawn in CSS (.hdr-scrim, --hdr-shade)
      var v = shades[i] < 0.004 ? '0' : shades[i].toFixed(3);
      if (v !== el.__shade) { el.__shade = v; el.style.setProperty('--hdr-shade', v); }
    });
    if (busy) hraf = requestAnimationFrame(hdrAnim); else hlast = 0;
  }
  var recheckAt = 0;
  function recheckIn(ms) {                                 // one shared timer, always for the soonest request
    var at = performance.now() + ms + 5;
    if (recheck && at >= recheckAt) return;
    clearTimeout(recheck); recheckAt = at;
    recheck = setTimeout(function () { recheck = 0; toneSoon(); }, ms + 5);
  }
  function toneSoon() { toneLater(); }
  // Header read in a separate task, at most every 150 ms (the header waits 120 ms before changing and then glides for
  // 0.5 s, so reading it on every video frame adds no visible precision - only work in the seek loop). tone() reads the
  // frame on screen when it runs, and a seek after a read schedules a new one, so the last frame is always sampled.
  var toneTimer = 0, toneLast = 0, TONE_GAP = 150;
  function toneLater() {
    if (toneTimer) return;
    toneTimer = setTimeout(function () { toneTimer = 0; toneLast = performance.now(); tone(); }, Math.max(0, toneLast + TONE_GAP - performance.now()));
  }
  // While the hero is pinned the strip behind the header only changes with the video frame ('seeked' re-samples it),
  // so scrolling needs a re-sample only while the hero slides away, and once when that or the solid header changes.
  var lastSlide = false, lastSolid = false;
  // solid header: its own colours, no reading. .hdr-past = Horizon Chapter: the hero has started to leave the screen.
  function hdrSolid() { return header.classList.contains('is-solid') || header.classList.contains('hdr-past'); }
  // Horizon Chapter: the header takes its solid look as soon as the hero starts to leave the screen (1px marker at the
  // top edge of the sticky stage, css/hero-video.css) - while the video slides away, the strip behind the transparent
  // header passes the dark navy horizon band, where ink drops to ~1.5:1. A second marker at the Method heading's top
  // edge (the previous trigger) stays as a fallback. IntersectionObservers only: no work while scrolling.
  if (CHAPTER && header && 'IntersectionObserver' in window) {
    var mark = document.createElement('div'), markIO = null, markH = -1, markPast = false, endPast = false;
    var setPast = function () {
      var past = markPast || endPast;
      if (past !== header.classList.contains('hdr-past')) { header.classList.toggle('hdr-past', past); toneLater(); }
    };
    mark.className = 'ch-mark'; mark.setAttribute('aria-hidden', 'true');
    method.insertBefore(mark, method.firstChild);
    var watchMark = function () {                  // the line is the header's bottom edge (re-made if its height changes)
      var hh = header.offsetHeight;
      if (hh === markH) return;
      markH = hh;
      if (markIO) markIO.disconnect();
      markIO = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        markPast = !e.isIntersecting && !!e.rootBounds && e.boundingClientRect.top < e.rootBounds.top + 1;
        setPast();
      }, { rootMargin: '-' + hh + 'px 0px 0px 0px', threshold: [0, 1] });
      markIO.observe(mark);
    };
    watchMark();
    window.addEventListener('resize', watchMark, { passive: true });
    // the stage's top edge: off screen (above the viewport) = the stage has started to slide away
    var stageEnd = document.createElement('div');
    stageEnd.className = 'ch-end'; stageEnd.setAttribute('aria-hidden', 'true');
    stage.appendChild(stageEnd);
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      endPast = !e.isIntersecting && !!e.rootBounds && e.boundingClientRect.top < e.rootBounds.top;
      setPast();
    }, { threshold: [0, 1] }).observe(stageEnd);
  }
  // Horizon Chapter landing point (--ch-land, css/hero-video.css): where the top of the Method content sits on screen
  // when the hero's track ends; the heading enters the screen as early as this allows. Two limits:
  //  - Method text must not rest on the final shot's horizon, the thin dark navy band between sky and sea (measured:
  //    the label or heading there drops to ~2.5:1), so it lands HORIZON_GAP below it;
  //  - the steps' small text must rest on the dense part of the sand fade (STEPS_AT of the screen), not over the sea.
  // Depends on the screen size and the heading's length (language, font), so it is measured on load, when the video's
  // size and the fonts are known, and on resize - never while scrolling. Before that the CSS default applies; Method is
  // far off screen then. CLIP_HORIZON: the horizon's height in the final frame (fraction of the frame height), measured
  // for img/video/villa-hero - update it together with CLIP_REL when the video changes.
  if (CHAPTER) {
    var chIntro = method.querySelector('.mt-intro'), chSteps = method.querySelector('.mt-steps'), chLand = -1, chStepsAt = -1;
    var CLIP_HORIZON = 0.328, HORIZON_GAP = 0.13, STEPS_AT = MOBILE ? 0.56 : 0.58, LAND_MAX = 0.5;
    var chapterLayout = function () {
      if (!chIntro || !chSteps) return;
      var sw = stage.offsetWidth, vh = stage.offsetHeight, block = chSteps.getBoundingClientRect().top - chIntro.getBoundingClientRect().top;
      if (!(vh > 0) || !(sw > 0) || !(block > 0)) return;
      var fw = video.videoWidth || 2560, fh = video.videoHeight || 1440, k = Math.max(sw / fw, vh / fh);   // object-fit: cover
      var horizon = CLIP_HORIZON * fh * k - (fh * k - vh) / 2;                                          // on screen (px)
      var land = Math.max(horizon + HORIZON_GAP * vh, STEPS_AT * vh - block);
      land = Math.round(Math.min(LAND_MAX * vh, land));
      // where the steps start inside Method: the limestone veil behind them is anchored there (--ch-steps)
      var at = Math.round(chSteps.getBoundingClientRect().top - method.getBoundingClientRect().top);
      if (at !== chStepsAt) { chStepsAt = at; method.style.setProperty('--ch-steps', at + 'px'); }
      if (Math.abs(land - chLand) < 2) return;     // (mobile toolbar resizes do not move it: the stage is 100lvh)
      chLand = land; method.style.setProperty('--ch-land', land + 'px');
    };
    video.addEventListener('loadedmetadata', chapterLayout);
    chapterLayout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(chapterLayout);
    window.addEventListener('resize', chapterLayout, { passive: true });

    // The floating WhatsApp button (.wa-fab) steps aside while Method text passes under it (.ch-hold, css/hero-video.css).
    // One IntersectionObserver whose root is the button's corner of the screen: no work while scrolling.
    var fab = document.querySelector('.wa-fab'), fabIO = null, fabKey = '';
    var chItems = [chIntro].concat(Array.prototype.slice.call(method.querySelectorAll('.mt-step'))).filter(Boolean);
    var watchFab = function () {
      var r = fab.getBoundingClientRect(), key = Math.round(r.left) + ',' + Math.round(r.top) + ',' + innerWidth + ',' + innerHeight;
      if (!r.width || key === fabKey) return;
      fabKey = key;
      if (fabIO) fabIO.disconnect();
      // 40px around the button (its hidden state sits 22px lower than the shown one)
      fabIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.target.__chHit = e.isIntersecting; });
        fab.classList.toggle('ch-hold', chItems.some(function (el) { return el.__chHit; }));
      }, { rootMargin: '-' + Math.max(0, Math.round(r.top - 40)) + 'px 0px 0px -' + Math.max(0, Math.round(r.left - 40)) + 'px' });
      chItems.forEach(function (el) { el.__chHit = false; fabIO.observe(el); });
    };
    if (fab && chItems.length && 'IntersectionObserver' in window) {
      watchFab();
      window.addEventListener('resize', watchFab, { passive: true });
    }
  }
  function toneOnScroll() {
    if (!zones.length) return;
    var slide = stage.getBoundingClientRect().top < -1, solid = hdrSolid();
    if (slide || slide !== lastSlide || solid !== lastSolid) toneSoon();
    lastSlide = slide; lastSolid = solid;
  }

  window.addEventListener('resize', function () { geo = null; tone(); updateSand(); updateShade(); schedule(); }, { passive: true });
  video.addEventListener('loadeddata', start);
  video.addEventListener('loadedmetadata', function () {
    // Some mobile browsers stop at metadata; a tiny seek makes them decode frame 0.
    if (video.readyState < 2) seekTo(0.3 / FPS);
  });
  if (video.readyState >= 2) start();
  watchSoon();                                   // (watchdog) until the video is running
  updateSand();

  // Buffer the rest of the clip only after the page has loaded (or once the visitor scrolls),
  // so the video never competes with the initial page load.
  var boosted = false;
  function boost() {
    if (boosted) return;
    boosted = true;
    video.preload = 'auto';
    if (video.readyState >= 1 && video.readyState < 2 && !video.seeking) seekTo(0.3 / FPS);
  }
  if (document.readyState === 'complete') boost();
  else window.addEventListener('load', boost, { once: true });

  // If no source can be loaded, the watchdog loads the selection again (a dropped connection is not the end); only when
  // that has failed three more times, fall back to the static poster layout.
  var sources = video.querySelectorAll('source');
  if (sources.length) {
    sources[sources.length - 1].addEventListener('error', function () {
      if (++srcFails <= 3) { netAt = 0; watchSoon(); return; }
      wdOff = true; clearTimeout(wdTimer);
      ready = false;
      hero.classList.remove('is-scrub', 'is-ready');
    });
  }

  window.addEventListener('scroll', function () {
    toneOnScroll(); updateSand();
    boost(); schedule();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      // when the hero leaves the screen, put the camera where the scroll is (no glide needed off-screen)
      if (!inView && ready) {
        pos = Math.round(progress() * LX); vel = acc = 0; sm = null; gPrev = null; fling = 0;
        plan = { t0: -1e9, T: 1, v0: 0, a0: 0, d: 0, p0: pos };   // already at rest here
        target = U[pos]; pump();
      }
      if (!inView) fabHold(false);                // video off screen: nothing is playing for the visitor
      schedule();
    }).observe(hero);
  }
})();
