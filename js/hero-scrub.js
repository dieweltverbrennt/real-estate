/* Scroll-controlled hero video - cinematic playback.
   Scroll progress through #hero decides where the camera should be; the camera gets there like a real
   camera move instead of jumping frame by frame:
   - it moves over the clip's real camera positions (the villa clip repeats every 5th frame; repeats are skipped)
   - inertia: limited acceleration, never slower than ~0.67x real speed while moving, a top speed, gentle braking
   - slow scrolling is collected into short glides (>= 3 positions) instead of a frame-by-frame crawl
   - when scrolling stops, the camera glides on to the sharpest frame nearby (searched only ahead of its
     direction of travel, so it never steps back); first and last frames stay exact
   The video never plays on its own: only currentTime is set, one seek at a time. Only original frames are
   shown - nothing is generated, blended or sharpened.
   Hero look (approved "Variant 5", styles in css/hero-video.css): the original sand fade rises only over the last
   20% of the hero's scroll (--hero-sand), and a soft adaptive gradient behind the white text (--shade) follows how bright
   the frame behind the text is. The top headings (header over the hero) follow the same principle: an eased ink/white
   tone per zone (--hb brand, --hn navigation) and a per-heading feathered shade, no light glow. The secondary hero
   button's colour follows --hero-sand in CSS (no sampling).
   The header's video read runs outside the seek loop (own task, at most every 150 ms, GPU canvas).
   Touch devices: --hero-sand/--shade are set on the hero (not <body>); the stage is sized for the toolbar-hidden viewport
   (mobile CSS block).
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

  // Camera tuning (positions per second; real speed of the villa clip = 24 positions/s)
  var V_MIN = 16, V_MAX = 120, ACC = 140, BRAKE = 70;
  var IDLE_MS = 140;       // scrolling counts as stopped after this pause
  var REST_R = 4;          // when stopped, look this many positions either side for a sharper frame
  var GLIDE_MIN = 3;       // while scrolling slowly, move in glides of at least this many positions

  var U = [], REL = [], LX = 0;      // timeline: U[i] = source frame of camera position i
  var knownClip = false;
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
    var rel = CLIP_REL.split(',');
    var known = knownClip = frames === CLIP_FRAMES;
    for (var f = 0; f < frames; f++) if (!known || f % 5 !== 1) U.push(f);
    for (var i = 0; i < U.length; i++) REL.push(known ? +rel[i] / 100 : 1);
    LX = U.length - 1;
  }

  // ---- hero look: sand fade at the end of the hero + adaptive gradient behind the text
  var SAND_FROM = 0.8;                             // sand fade rises over the last 20% of the hero's scroll
  var body = document.body, textBlock = hero.querySelector('.hero2-in'), sand = -1;
  // Touch devices (same query as the mobile block in css/hero-video.css). There --hero-sand/--shade are set on the hero
  // itself, so a change restyles only the hero (on <body> it restyles the whole page); desktop keeps <body>.
  var MOBILE = !!(window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches);
  var varHost = hero;
  // Touch devices only: the floating WhatsApp button (.wa-fab) stays hidden while the video is in progress (.is-playing
  // on the hero, see the touch block in css/hero-video.css) and returns once the final frame has been painted.
  function fabHold(on) { if (MOBILE) hero.classList.toggle('is-playing', on); }
  fabHold(true);
  var scrim = document.createElement('div');       // decorative layer for the adaptive gradient (css/hero-video.css)
  scrim.className = 'hero2-scrim'; scrim.setAttribute('aria-hidden', 'true');
  var ov = hero.querySelector('.hero2-ov');
  if (ov && ov.parentNode) ov.parentNode.insertBefore(scrim, ov.nextSibling); else stage.insertBefore(scrim, stage.firstChild);

  function smoothstep(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function updateSand() {
    var s = smoothstep((progress() - SAND_FROM) / (1 - SAND_FROM));
    if (s === sand) return;
    var big = sand < 0 || Math.abs(s - sand) > 0.02 || s === 0 || s === 1;
    sand = s; varHost.style.setProperty('--hero-sand', s.toFixed(4));
    if (big) updateShade();                        // the sand fade also brightens what is behind the text
  }
  function fadeAt(y) {                             // sand fade opacity at a height of the hero (0 top, 1 bottom)
    var st = [[0, 0], [.38, 0], [.54, .14], [.70, .40], [.85, .72], [1, 1]];
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
      var cell = parseInt(CLIP_BRIGHT.substr(base + (row * 4 + col) * 2, 2), 16);
      var cy = (Math.max(y0, row / 4) + Math.min(y1, (row + 1) / 4)) / 2 * vh - oy;
      var f = fadeAt(cy / sr.height) * sd;
      sum += (cell * (1 - f) + 233 * f) * a; wsum += a;
    }
    if (!wsum) return;
    var eff = sum / wsum;
    // deepen the brighter parts behind the text just enough for white type; a little more support only during the
    // final transition (bright sand + white surf behind the text)
    var cap = 0.5 + 0.15 * sd, aim = 135 - 25 * sd;
    var shade = Math.max(0, Math.min(cap, (eff - aim) / (eff - 10)));
    varHost.style.setProperty('--shade', shade.toFixed(3));
  }

  // ---- seek pipeline: one seek at a time; the next one only after the decoded frame has been painted
  var shown = -1, busy = false, target = 0;
  function pump() {
    if (!ready || target === shown || busy || video.seeking) return;
    shown = target; busy = true;
    if (target !== U[LX]) fabHold(true);
    video.currentTime = (target + 0.3) / FPS;    // aim slightly past the frame start (never the previous frame)
  }
  video.addEventListener('seeked', function () {
    if (!ready) { start(); return; }
    requestAnimationFrame(function () {
      busy = false;
      if (shown === U[LX]) fabHold(false);        // final frame is on screen: the floating button may show again
      updateShade(); schedule(); toneLater();     // the next seek is not held up by the header read (it runs in its own task)
    });
  });

  // ---- cinematic camera
  var pos = 0, vel = 0, goal = 0, restGoal = null, lastScrollT = 0;
  function restPoint(x, r) {                     // sharpest frame near x, only ahead of the moving camera
    if (x <= 0.5) return 0;
    if (x >= LX - 0.5) return LX;
    var c = Math.round(x), best = c, bestScore = -1e9;
    var lo = Math.max(1, c - r), hi = Math.min(LX - 1, c + r);
    if (vel > 0) lo = Math.max(lo, Math.ceil(pos)); else if (vel < 0) hi = Math.min(hi, Math.floor(pos));
    if (lo > hi) return vel > 0 ? Math.min(LX, Math.ceil(pos)) : Math.max(0, Math.floor(pos));
    for (var i = lo; i <= hi; i++) {
      var s = REL[i] - 0.015 * Math.abs(i - x);  // sharper is better, nearer slightly better
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  function tick(t) {
    raf = 0;
    if (!ready || (reduce && reduce.matches)) return;
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0; lastT = t;
    var g = progress() * LX;
    var idle = t - lastScrollT > IDLE_MS;
    if (idle) {                                  // stopped: settle on the sharpest frame nearby
      if (restGoal === null || Math.abs(restGoal - g) > REST_R + 0.5) restGoal = restPoint(g, REST_R);
      goal = restGoal;
    } else if (Math.abs(g - goal) >= GLIDE_MIN) {   // collect small scroll movements into one glide
      goal = (g <= 0.5 || g >= LX - 0.5) ? g : restPoint(g, 2);
    }
    var d = goal - pos, dist = Math.abs(d), dir = d > 0 ? 1 : -1;
    if (dist < 0.02 && Math.abs(vel) < 1) { pos = goal; vel = 0; }
    else {
      var want = Math.min(V_MAX, Math.max(V_MIN, Math.sqrt(2 * BRAKE * dist)));
      if (dist < 0.6) want = Math.max(2, dist * 8);
      var dv = dir * want - vel, maxDv = ACC * dt;
      vel += Math.max(-maxDv, Math.min(maxDv, dv));       // limited acceleration = inertia
      var step = vel * dt;
      if ((goal - (pos + step)) * dir <= 0) { pos = goal; vel = 0; } else pos += step;
    }
    target = U[Math.max(0, Math.min(LX, Math.round(pos)))];
    pump();
    // keep animating while the camera moves, a target is pending, or the scroll may still settle
    if (vel !== 0 || pos !== goal || target !== shown || !idle || restGoal === null) schedule();
    else lastT = 0;
  }

  function schedule() {
    if (!raf && inView) raf = requestAnimationFrame(tick);
  }

  function start() {
    if (ready || !(video.duration > 0)) return;
    buildTimeline(Math.max(1, Math.round(video.duration * FPS)));
    pos = goal = progress() * LX;                // start where the page is (e.g. after a reload mid-page)
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
  // briefly. Behind white text, each element gets its own feathered ellipse of the same soft shade as the main
  // heading, as strong as the brightest part behind it needs (never anything behind dark text: no glow, no patches).
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
  var H_AIM = 128, H_CAP = 0.42, H_MARGIN = 1.25;          // shade target / limit, hysteresis (contrast ratio)
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

  // Luminance (0-255) on a HC x HRW grid behind a viewport rect, as the visitor sees it: the video frame (object-fit:
  // cover), lightened by the sand fade, and limestone where the rect is below the stage.
  function sample(R, sr) {
    var w = sr.width, h = sr.height;
    var s = Math.max(w / video.videoWidth, h / video.videoHeight);
    var sx = (video.videoWidth * s - w) / 2 / s, sy = (video.videoHeight * s - h) / 2 / s;
    var y0 = Math.max(R.top, sr.top), vis = Math.min(R.bottom, sr.bottom) - y0;
    var rows = vis > 0 ? Math.max(1, Math.round(HRW * vis / R.height)) : 0, d = null;
    if (rows) {
      ctx.drawImage(video, sx + (R.left - sr.left) / s, sy + (y0 - sr.top) / s, R.width / s, vis / s, 0, 0, HC, rows);
      d = ctx.getImageData(0, 0, HC, rows).data;
    }
    var lum = [], sd = sand < 0 ? 0 : sand;
    for (var r = 0; r < HRW; r++) {
      var y = R.top + (r + 0.5) / HRW * R.height - sr.top, f = y >= h ? 1 : fadeAt(y / h) * sd;
      for (var c = 0; c < HC; c++) {
        var L = 233;
        if (r < rows) { var i = (r * HC + c) * 4; L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
        lum.push(L * (1 - f) + 233 * f);
      }
    }
    return lum;
  }

  function tone() {
    if (!zones.length || !video.videoWidth) return;
    var now = performance.now();
    if (hlive && now - hlive < 6) return;                  // seek, scroll and re-check land in one update per frame
    var dt = hlive ? (now - hlive) / 1000 : 1;
    hlive = now;
    if (!geo) measure();
    var sr = stage.getBoundingClientRect(), solid = header.classList.contains('is-solid'), leaving = sr.top < -1;
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
    var busy = false, grads = scrims.map(function () { return []; });
    zones.forEach(function (z) {
      var goal = z.white ? 1 : 0, g = grads[scrims.indexOf(z.scrim)], k = 1 - Math.exp(-dt / SHADE_TAU);
      if (z.p !== goal) { z.p = goal > z.p ? Math.min(goal, z.p + dt / TONE_S) : Math.max(goal, z.p - dt / TONE_S); busy = true; }
      z.t = z.p * z.p * z.p * (z.p * (z.p * 6 - 15) + 10);   // smootherstep: gentle at both ends, brief in the middle
      var tv = z.t.toFixed(3);
      if (tv !== z.lastT) { z.lastT = tv; z.host.style.setProperty(z.prop, tv); }
      z.items.forEach(function (it) {
        if (!it) return;
        var d = it.aim - it.s;
        if (Math.abs(d) > 0.002) { it.s += d * k; busy = true; } else it.s = it.aim;
        var S = it.s * z.t;                                  // shade only as far as the text has turned white
        if (S < 0.004) return;
        var rx = it.w * 0.62 + 26, ry = it.h * 0.5 + 18;
        g.push('radial-gradient(' + rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px at ' + it.x.toFixed(1) + 'px ' + it.y.toFixed(1) + 'px,' +
          'rgba(15,11,8,' + S.toFixed(3) + ') 0%,rgba(15,11,8,' + (S * 0.72).toFixed(3) + ') 38%,rgba(15,11,8,' +
          (S * 0.3).toFixed(3) + ') 66%,rgba(15,11,8,0) 100%)');
      });
    });
    scrims.forEach(function (el, i) {
      var bg = grads[i].length ? grads[i].join(',') : 'none';
      if (bg !== el.__bg) { el.__bg = bg; el.style.backgroundImage = bg; }
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
  function toneOnScroll() {
    if (!zones.length) return;
    var slide = stage.getBoundingClientRect().top < -1, solid = header.classList.contains('is-solid');
    if (slide || slide !== lastSlide || solid !== lastSolid) toneSoon();
    lastSlide = slide; lastSolid = solid;
  }

  window.addEventListener('resize', function () { geo = null; tone(); updateSand(); updateShade(); schedule(); }, { passive: true });
  video.addEventListener('loadeddata', start);
  video.addEventListener('loadedmetadata', function () {
    // Some mobile browsers stop at metadata; a tiny seek makes them decode frame 0.
    if (video.readyState < 2) video.currentTime = 0.3 / FPS;
  });
  if (video.readyState >= 2) start();
  updateSand();

  // Buffer the rest of the clip only after the page has loaded (or once the visitor scrolls),
  // so the video never competes with the initial page load.
  var boosted = false;
  function boost() {
    if (boosted) return;
    boosted = true;
    video.preload = 'auto';
    if (video.readyState >= 1 && video.readyState < 2) video.currentTime = 0.3 / FPS;
  }
  if (document.readyState === 'complete') boost();
  else window.addEventListener('load', boost, { once: true });

  // If no source can be decoded, fall back to the static poster layout.
  var sources = video.querySelectorAll('source');
  if (sources.length) {
    sources[sources.length - 1].addEventListener('error', function () {
      ready = false;
      hero.classList.remove('is-scrub', 'is-ready');
    });
  }

  window.addEventListener('scroll', function () {
    lastScrollT = performance.now(); restGoal = null;
    toneOnScroll(); updateSand();
    boost(); schedule();
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      // when the hero leaves the screen, put the camera where the scroll is (no glide needed off-screen)
      if (!inView && ready) { pos = goal = restGoal = Math.round(progress() * LX); vel = 0; target = U[pos]; pump(); }
      if (!inView) fabHold(false);                // video off screen: nothing is playing for the visitor
      schedule();
    }).observe(hero);
  }
})();
