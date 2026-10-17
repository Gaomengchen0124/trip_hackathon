<script setup>
const base = import.meta.env.BASE_URL
</script>

<template>
  <div class="sketch-world" aria-hidden="true">
    <div class="far-parallax"><div class="far-drift ambient"><img class="pencil-landscape" :src="`${base}img/opening/atlas-portal-v4.webp`" alt="" width="1672" height="941" fetchpriority="high" /></div></div>
    <div class="celestial-parallax">
      <svg class="celestial-dial ambient" viewBox="0 0 800 800" fill="none">
        <path d="M400 44C601 40 754 210 752 402S600 756 401 752 48 604 45 399 212 42 400 44Z" />
        <path d="M400 59C591 55 740 215 738 400S591 739 400 741 60 589 59 400 213 58 400 59Z" stroke-dasharray="1 14" />
        <ellipse cx="400" cy="400" rx="359" ry="193" transform="rotate(-29 400 400)" />
        <path d="M400 29v32m0 678v32M29 400h32m678 0h32M153 153l15 15m464 464 15 15M153 647l15-15m464-464 15-15" />
        <path d="m658 198 3 9 9 3-9 3-3 9-3-9-9-3 9-3Zm-540 355 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
        <circle cx="294" cy="62" r="4" /><circle cx="722" cy="553" r="3" />
      </svg>
      <svg class="compass-needle" viewBox="0 0 800 800" fill="none"><path d="m400 73 12 29-12-6-12 6Zm0 653 8-22-8 5-8-5Z" /><path d="M400 99v44m0 512v44" /></svg>
    </div>
    <div class="cloud cloud-one ambient"><svg viewBox="0 0 380 100"><path d="M8 73c28-10 33-8 42-13-2-14 18-26 34-21 9-36 67-35 79-10 23-13 49 4 46 19 26-6 42 5 45 13 26 1 47 10 72 10m-272 4c54-2 69 7 101 1m79-3 65 5" /></svg></div>
    <div class="cloud cloud-two ambient"><svg viewBox="0 0 380 100"><path d="M10 76c26-4 45-8 63-6-5-18 16-28 33-23 10-32 57-39 76-6 21-6 40 3 43 20 22-4 31 10 51 11l72 5M65 82l57 2m110-1 32 3" /></svg></div>
    <div class="bird-flight ambient"><svg class="bird-wings ambient" viewBox="0 0 64 32"><path d="M4 21Q18 3 32 21 47 5 60 16M31 22l5 4" /></svg></div>
    <div class="horizon-parallax">
      <div class="horizon-drift ambient">
        <img v-for="copy in 2" :key="copy" :src="`${base}img/world-panorama-v1.png`" alt="" width="3546" height="443" />
      </div>
    </div>
    <div class="low-mist mist-one ambient" />
    <div class="low-mist mist-two ambient" />
    <svg class="pencil-route" viewBox="0 0 1440 900" preserveAspectRatio="none">
      <path class="route-guide" d="M-40 760C200 675 322 826 515 768S708 670 835 756s332 102 660-56" />
      <path class="route-current ambient" d="M-40 760C200 675 322 826 515 768S708 670 835 756s332 102 660-56" />
    </svg>
  </div>
</template>

<style scoped>
.sketch-world{position:absolute;inset:0;overflow:hidden;background:#f7f2e8;pointer-events:none}
.far-parallax{position:absolute;inset:-1%;transform:translate(calc(var(--pan-x,0px)*.24),calc(var(--pan-y,0px)*.18 - var(--pull,0)*16px));transition:transform .8s cubic-bezier(.2,.75,.2,1)}
.far-drift{width:100%;height:100%;animation:paper-breath 18s ease-in-out infinite alternate}
.pencil-landscape{width:100%;height:100%;object-fit:fill;object-position:center;opacity:.77;mix-blend-mode:multiply;mask-image:linear-gradient(#000 83%,transparent)}
.celestial-parallax{position:absolute;width:min(69vw,780px);height:min(69vw,780px);left:50%;top:46%;translate:-50% -50%;transform:translate(calc(var(--pan-x,0px)*-.12),calc(var(--pan-y,0px)*-.1));transition:transform 1s}
.celestial-dial{width:100%;height:100%;stroke:#ab8b50;stroke-width:.7;opacity:.35;animation:dial-turn 100s linear infinite}
.compass-needle{position:absolute;inset:0;width:100%;height:100%;stroke:#a1844c;fill:#b9985940;stroke-width:.8;transform:rotate(var(--bearing,0deg));transition:transform 1.1s cubic-bezier(.22,.61,.36,1);opacity:.6}
.cloud{position:absolute;width:28vw;min-width:250px;fill:none;stroke:#b2a58e;stroke-width:1;opacity:.6;animation:cloud-pass 24s ease-in-out infinite alternate}
.cloud-one{left:12%;top:13%;rotate:-5deg}.cloud-two{right:6%;top:23%;width:22vw;opacity:.42;animation-duration:31s;animation-direction:alternate-reverse}
.cloud svg{width:100%;height:auto}
.bird-flight{position:absolute;top:24%;left:72%;width:35px;height:20px;animation:bird-journey 17s ease-in-out infinite alternate}
.bird-wings{width:100%;fill:none;stroke:#8f7d5a;stroke-width:1.2;animation:wing-beat 1.4s ease-in-out infinite alternate}
.horizon-parallax{position:absolute;bottom:2%;left:-12%;width:124%;height:clamp(140px,18vw,260px);transform:translate(calc(var(--pan-x,0px)*.9),calc(var(--pan-y,0px)*.35 + var(--unfold,0)*90px));transition:transform .65s cubic-bezier(.2,.75,.2,1);mask-image:linear-gradient(transparent,#000 42%,#000 82%,transparent)}
.horizon-drift{position:absolute;bottom:0;display:flex;width:max-content;height:100%;animation:world-wander 65s linear infinite;will-change:transform}
.horizon-drift img{display:block;width:max(230vw,2400px);max-width:none;height:100%;flex:none;object-fit:fill;mix-blend-mode:multiply;opacity:.38}
.low-mist{position:absolute;left:-30%;width:160%;height:27%;bottom:7%;background:radial-gradient(ellipse at 30% 50%,#fdfcf9de,transparent 57%),radial-gradient(ellipse at 80% 70%,#fdfcf9c4,transparent 48%);animation:mist-drift 16s ease-in-out infinite alternate}
.mist-two{bottom:17%;height:18%;opacity:.6;animation-duration:23s;animation-direction:alternate-reverse}
.pencil-route{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:#af965e;stroke-width:.7;opacity:.5}
.route-guide{stroke-dasharray:2 7;opacity:.45}.route-current{stroke-dasharray:50 1600;animation:trace-route 10s linear infinite;stroke-width:1.2}
@keyframes paper-breath{from{transform:translate(-7px,3px) scale(1.01)}to{transform:translate(8px,-9px) scale(1.035)}}
@keyframes world-wander{to{transform:translateX(-50%)}}
@keyframes cloud-pass{from{transform:translate(-60px,5px)}to{transform:translate(90px,-9px)}}
@keyframes mist-drift{from{transform:translateX(-6%) scaleY(.8);opacity:.5}to{transform:translateX(8%) scaleY(1.2);opacity:.9}}
@keyframes dial-turn{to{transform:rotate(360deg)}}
@keyframes bird-journey{0%{transform:translate(0,0) rotate(-8deg)}50%{transform:translate(-110px,-18px) rotate(4deg)}100%{transform:translate(-220px,12px) rotate(-6deg)}}
@keyframes wing-beat{from{transform:scaleY(.55)}to{transform:scaleY(1.05)}}
@keyframes trace-route{to{stroke-dashoffset:-1650}}
.world-still .ambient{animation-play-state:paused}
.world-still .far-parallax,.world-still .horizon-parallax,.world-still .celestial-parallax{transition:none}
.world-dragging .far-parallax,.world-dragging .horizon-parallax,.world-dragging .celestial-parallax{transition:transform .08s linear}
@media(max-width:760px){.pencil-landscape{object-fit:cover;object-position:51% center;opacity:.72}.celestial-parallax{width:135vw;height:135vw;opacity:.8}.cloud-one{left:-10%;top:19%;width:60vw}.cloud-two{top:10%;right:-25%}.horizon-parallax{bottom:5%;height:180px}.horizon-drift img{width:1700px}.horizon-drift{animation-duration:75s}.low-mist{bottom:7%;height:25%}.bird-flight{top:29%;left:77%;width:25px}.pencil-route{opacity:.3}}
@media(max-height:500px){.horizon-parallax{height:180px;bottom:-12%}.pencil-landscape{opacity:.4}.celestial-parallax{width:65vh;height:65vh}.bird-flight{top:18%}.cloud-one{top:4%}}
@media(prefers-reduced-motion:reduce){.ambient{animation:none!important}.far-parallax,.horizon-parallax,.celestial-parallax,.compass-needle{transform:none!important;transition:none!important}}
</style>
