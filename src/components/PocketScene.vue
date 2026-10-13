<script setup>
import { computed, ref, useId, watch } from 'vue'

const props = defineProps({
  searching: { type: Boolean, default: false },
  typing: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const uid = useId()
const junk = ref(['pencil', 'paper', 'marble'])
const tilt = ref({ x: 0, y: 0 })
const pointerStyle = computed(() => ({
  transform: props.searching ? 'none' : `perspective(900px) rotateX(${tilt.value.x}deg) rotateY(${tilt.value.y}deg)`,
}))
function tiltPocket(event) {
  if (event.pointerType === 'touch' || props.searching) return
  const rect = event.currentTarget.getBoundingClientRect()
  tilt.value = {
    x: ((event.clientY - rect.top) / rect.height - .5) * -4,
    y: ((event.clientX - rect.left) / rect.width - .5) * 4,
  }
}
function resetTilt() { tilt.value = { x: 0, y: 0 } }
watch(() => props.searching, (searching) => {
  if (searching) {
    resetTilt()
    const pool = ['pencil', 'paper', 'marble', 'button', 'key', 'bell', 'screw', 'cloth', 'eraser', 'can']
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    junk.value = pool.slice(0, 3)
  }
})
</script>

<template>
  <div class="pocket-scene" :class="{ searching, typing, compact }" @pointermove="tiltPocket" @pointerleave="resetTilt">
    <svg class="pocket-art" :style="pointerStyle" viewBox="0 0 560 440" fill="none" role="img" :aria-label="searching ? '奇妙口袋正忙着翻找道具' : '一只装着小小奇迹的暖黄色布口袋'">
      <defs>
        <pattern :id="`${uid}-weave`" width="7" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 2h7M2 0v7" stroke="#8F692E" stroke-opacity=".13" stroke-width=".65" />
          <path d="M0 5h7M5 0v7" stroke="#FFF4D3" stroke-opacity=".3" stroke-width=".7" />
        </pattern>
        <pattern :id="`${uid}-dots`" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r=".65" fill="#D1AF70" fill-opacity=".35" />
        </pattern>
        <linearGradient :id="`${uid}-cloth`" x1="172" y1="185" x2="411" y2="353" gradientUnits="userSpaceOnUse">
          <stop stop-color="#EFC366" />
          <stop offset=".49" stop-color="#E6B24E" />
          <stop offset="1" stop-color="#DCA443" />
        </linearGradient>
        <linearGradient :id="`${uid}-inside`" x1="276" y1="153" x2="276" y2="218" gradientUnits="userSpaceOnUse">
          <stop stop-color="#AA7738" />
          <stop offset=".55" stop-color="#D3A365" />
          <stop offset="1" stop-color="#FAE9BF" />
        </linearGradient>
        <radialGradient :id="`${uid}-glow`">
          <stop stop-color="#F9CE73" stop-opacity=".65" />
          <stop offset="1" stop-color="#F9CE73" stop-opacity="0" />
        </radialGradient>
        <filter :id="`${uid}-shadow`" x="-30%" y="-50%" width="160%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <clipPath :id="`${uid}-bagclip`">
          <path d="M146 183c-5 14-10 33-11 53-8 71 30 121 139 126 108 5 161-40 151-117-3-24-12-45-20-60-78 20-180 22-259-2Z" />
        </clipPath>
      </defs>

      <!-- A few pencil marks left in the margins of an old sketchbook. -->
      <g class="doodle doodle-cloud" stroke="#ACC6BC" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M89 113c-10-7-13-20-5-28 6-7 16-7 24-1 2-14 18-21 31-13 11 6 15 18 10 28 9-1 17 7 15 16-1 10-14 13-23 12l-48-4" />
        <path d="m89 132 10 2m43 3 15 1" opacity=".45" />
      </g>
      <g class="doodle doodle-star" stroke="#DB9A5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m419 74 4 15 14 5-14 5-4 16-5-16-13-5 14-5 4-15Z" fill="#F9E5BB" />
        <path d="m443 71 4-5m-18-10 1-5m24 40 7 1" />
        <path d="m376 123 3 7 8 2-7 4-1 8-5-6-8 1 4-7-2-7 8 3Z" fill="#F6D597" stroke-width="1.5" />
      </g>
      <g class="doodle doodle-swish" stroke="#BBC4A4" stroke-width="1.8" stroke-linecap="round">
        <path d="M445 275c21 4 35-8 28-18-5-7-14-2-11 7 5 13 28 9 31-2" stroke-dasharray="4 5" />
        <path d="m490 256 3 7 6-5" />
      </g>
      <g class="doodle doodle-left" stroke="#D4AD73" stroke-width="1.6" stroke-linecap="round">
        <path d="m89 257 2 9m-6-4 10-1m-4 28 9 2m-1-5-5 9" />
        <path d="m113 186 6-8m-18-3 9 1m12-13 2 9" />
      </g>

      <ellipse cx="281" cy="378" rx="145" ry="13" fill="#B69760" opacity=".15" :filter="`url(#${uid}-shadow)`" />
      <ellipse cx="278" cy="374" rx="107" ry="6" fill="#BFA67B" opacity=".15" />
      <circle class="reveal-glow" cx="280" cy="213" r="150" :fill="`url(#${uid}-glow)`" />

      <g class="pouch">


        <!-- Back rim, dark interior, and the curved cloth front. -->
        <path d="M145 177c1-29 56-39 128-40 81-1 133 15 139 42 2 14-11 27-33 31l-181 5c-37-6-56-18-53-38Z" fill="#F2D69E" stroke="#80694D" stroke-width="2" />
        <path d="M157 179c9-18 59-29 117-29 66 0 118 12 126 30 8 16-42 33-121 32-67-1-127-13-122-33Z" :fill="`url(#${uid}-inside)`" stroke="#AD844E" stroke-width="1.4" />
        <path d="M162 178c27-15 67-22 118-22 41 0 81 5 109 19" stroke="#8D653C" stroke-width="1.5" stroke-linecap="round" opacity=".4" />
        <!-- The tiny tenant is an original pocket sprite, with two leaf-shaped ears. -->
        <g class="pocket-sprite">
          <path d="M322 171c-2-16-2-42 8-50 5-4 7 2 10 13 5-9 14-16 19-12 5 5-1 17-5 23 10 8 13 16 12 28" fill="#CF7953" stroke="#8B6245" stroke-width="1.8" stroke-linejoin="round" />
          <path d="M336 126c-2 5-2 9-1 14m20-13-9 13" stroke="#EAAA77" stroke-width="3" stroke-linecap="round" />
          <ellipse cx="341" cy="159" rx="22" ry="19" fill="#EBA272" />
          <path d="M331 156v3m19-3v3" stroke="#755D49" stroke-width="2.5" stroke-linecap="round" />
          <path d="M338 163c2 3 4 3 6 0" stroke="#755D49" stroke-width="1.5" stroke-linecap="round" />
          <ellipse cx="326" cy="162" rx="4" ry="2" fill="#D57D66" opacity=".6" />
          <ellipse cx="355" cy="162" rx="4" ry="2" fill="#D57D66" opacity=".6" />
        </g>

        <path d="M146 183c-5 14-10 33-11 53-8 71 30 121 139 126 108 5 161-40 151-117-3-24-12-45-20-60-78 20-180 22-259-2Z" :fill="`url(#${uid}-cloth)`" stroke="#80694D" stroke-width="2.2" stroke-linejoin="round" />
        <g :clip-path="`url(#${uid}-bagclip)`">
          <rect x="127" y="180" width="310" height="190" :fill="`url(#${uid}-weave)`" />
          <path d="M148 202c-16 58-3 111 48 131-33-28-37-81-33-129Z" fill="#AD7731" opacity=".09" />
          <path d="M387 207c19 71 2 124-46 148 58-15 86-53 70-111l-16-41Z" fill="#AD7731" opacity=".1" />
          <path d="M202 219c-1 15-1 29 2 40m161-42-2 27m-112 90 51 6" stroke="#F9D38D" stroke-width="3" stroke-linecap="round" opacity=".6" />
          <path d="M163 210c-16 57 5 105 66 125 76 24 153 5 174-51 9-25 5-50-1-72" stroke="#FFF0C7" stroke-width="1.6" stroke-dasharray="5 4" stroke-linecap="round" opacity=".86" />
          <path d="M160 212c-16 57 5 107 64 126 77 26 156 7 179-50" stroke="#A77838" stroke-width=".8" stroke-dasharray="4 5" stroke-linecap="round" opacity=".38" />
        </g>

        <!-- The rolled lip follows the natural dip of a soft, well-loved pocket. -->
        <path d="M145 181c18 11 74 23 137 22 59 0 108-9 125-20l-3 20c-24 12-75 21-125 20-64 0-111-13-135-24Z" fill="#F7D692" stroke="#80694D" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M154 195c28 11 74 19 122 19 53 1 97-6 119-16" stroke="#FFF2CB" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" />
        <path d="M150 189c35 12 70 16 93 16m82 0 64-9" stroke="#FBE0A7" stroke-width="3" stroke-linecap="round" opacity=".8" />

        <!-- A crooked, sewn-on label; the star is the shop's own little mark. -->
        <g transform="rotate(-5 282 283)">
          <path d="M243 260c18-2 45-1 68 2l-2 46c-16 1-47 0-68-3Z" fill="#F5E9CC" stroke="#AF8D55" stroke-width="1.2" />
          <path d="m247 265 57 2-1 35-57-2 1-35Z" stroke="#B6A07A" stroke-width=".9" stroke-dasharray="2 3" />
          <path d="m277 272 4 8 9 2-7 6 1 9-8-5-8 4 2-9-6-7 10-1 3-7Z" fill="#6F968A" stroke="#5B7B70" stroke-width="1.3" stroke-linejoin="round" />
          <path d="m293 278 4-1m-39 9 3 1" stroke="#6F968A" stroke-width="1.1" stroke-linecap="round" />
        </g>
        <path d="M172 262c-5 17-2 29 4 38m212-57 4 18m-14 54-7 6" stroke="#9F753D" stroke-width="1.5" stroke-linecap="round" opacity=".3" />
      </g>

      <!-- Three different bits of pocket clutter take a little tumble. -->
      <g v-for="(item, index) in junk" :key="`${index}-${item}`" class="junk" :class="`junk-${index}`" :style="{ '--junk-delay': `${[1, 1.8, 2.25][index]}s` }">
        <g v-if="item === 'pencil'" transform="rotate(-25)">
          <path d="M-5-28H5V23l-5 12-5-12Z" fill="#CFA352" stroke="#80694D" stroke-width="1.5" />
          <path d="M-5-28H5v8H-5Z" fill="#D98D82" stroke="#80694D" stroke-width="1.2" />
          <path d="M-5 23H5L0 35Z" fill="#F4DEC0" />
          <path d="m-2 30 2 5 2-5" fill="#746857" />
          <path d="M0-17v38" stroke="#F4D89E" stroke-width="2" />
        </g>
        <g v-else-if="item === 'paper'" transform="rotate(13)">
          <path d="m-18-17 14-6 14 8 11 11-7 23-19-1-15-14 2-21Z" fill="#F9F1DD" stroke="#A3977D" stroke-width="1.5" />
          <path d="m-18-17 13 11 15-9-3 19 14-8M-5-6l-4 13 5 11M7 4l-16 3 23 12" stroke="#C7BFA6" stroke-width="1.1" />
        </g>
        <g v-else-if="item === 'marble'">
          <circle r="14" fill="#ABD0C9" stroke="#73928B" stroke-width="1.5" />
          <path d="M-5-12c-8 12 15 9 8 24" stroke="#F6E4B2" stroke-width="5" />
          <path d="M-7-7c-3 2-4 5-4 7" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity=".75" />
        </g>
        <g v-else-if="item === 'button'">
          <circle r="16" fill="#E3A797" stroke="#96715F" stroke-width="1.5" />
          <circle r="12" stroke="#BC8678" stroke-width="1" />
          <path d="M-4-4h.1m7.9 0h.1m-8 8h.1m7.9 0h.1" stroke="#96715F" stroke-width="3" stroke-linecap="round" />
          <path d="m-4-4 8 8m0-8-8 8" stroke="#F7E3CD" stroke-width="1.5" />
        </g>
        <g v-else-if="item === 'key'" transform="rotate(28)">
          <circle cy="-12" r="10" fill="#E5C276" stroke="#9E7F45" stroke-width="1.5" />
          <circle cy="-12" r="4" fill="#FCF6E8" stroke="#9E7F45" stroke-width="1.2" />
          <path d="M-3-3h6v25h9v6H3v8H-3V-3Z" fill="#E5C276" stroke="#9E7F45" stroke-width="1.5" stroke-linejoin="round" />
        </g>
        <g v-else-if="item === 'bell'">
          <path d="M-3-16v-5c0-4 6-4 6 0v5" stroke="#917851" stroke-width="1.5" />
          <path d="M-11-1c0-22 22-22 22 0 0 7 4 11 7 14H-18c3-3 7-7 7-14Z" fill="#E5BA62" stroke="#917851" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M-5 13c0 8 10 8 10 0" fill="#C3A063" stroke="#917851" stroke-width="1.2" />
          <path d="M-7-4c0-4 2-7 4-9" stroke="#FBE8B4" stroke-width="2" stroke-linecap="round" />
        </g>
        <g v-else-if="item === 'screw'" transform="rotate(-30)">
          <path d="M-5-11h10V21l-5 7-5-7V-11Z" fill="#BCB9A2" stroke="#888574" stroke-width="1.4" stroke-linejoin="round" />
          <path d="M-10-17h20v8h-20Z" fill="#D9D4BD" stroke="#888574" stroke-width="1.4" />
          <path d="M-6-13H6M-5-3l10 4M-5 4l10 4m-10 3 10 4m-10 3 9 4" stroke="#888574" stroke-width="1.3" stroke-linecap="round" />
        </g>
        <g v-else-if="item === 'cloth'" transform="rotate(12)">
          <path d="M-21-18c13 3 27-3 41 0-3 14 3 26 0 38-13-3-26 2-41-1 4-13-3-23 0-37Z" fill="#A9C1AC" stroke="#80957E" stroke-width="1.4" stroke-linejoin="round" />
          <path d="m-17-14 33 1-1 29-32-1 0-29Z" stroke="#EAF0D9" stroke-width="1" stroke-dasharray="2 3" />
          <path d="m-17-14 15 14 17 16m-16-16 14-13" stroke="#80957E" stroke-width="1" opacity=".4" />
        </g>
        <g v-else-if="item === 'eraser'" transform="rotate(-25)">
          <path d="m-21 5 9-20h29l7 9-9 21h-29l-7-10Z" fill="#DCA79A" stroke="#99796B" stroke-width="1.4" stroke-linejoin="round" />
          <path d="m-21 5 7 10h29l-7-10h-29Z" fill="#C58D83" stroke="#99796B" stroke-width="1" />
          <path d="m-4-15-9 20H8L17-15H-4Z" fill="#EFE8D1" stroke="#99796B" stroke-width="1" />
          <path d="m-1-6 9 0" stroke="#B0A58A" stroke-width="1" stroke-linecap="round" />
        </g>
        <g v-else transform="rotate(8)">
          <path d="M-13-17h26v33c0 8-26 8-26 0V-17Z" fill="#C2CBB1" stroke="#89957B" stroke-width="1.4" />
          <ellipse cy="-17" rx="13" ry="4" fill="#E4E7D3" stroke="#89957B" stroke-width="1.3" />
          <ellipse cy="-17" rx="5" ry="2" fill="#97A087" />
          <path d="M-13-6h26v15h-26Z" fill="#EEE5C7" stroke="none" />
          <path d="M-7-9v-4m0 33h9" stroke="#EFF1DA" stroke-width="1.6" stroke-linecap="round" />
          <path d="m0-3 2 3 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1 2-3Z" fill="#ADAE83" />
        </g>
      </g>
      <g class="search-stars" stroke="#CBA056" stroke-width="2" stroke-linecap="round">
        <path d="m220 121 0 12m-6-6h12m70-43v15m-7-7h14m58 22v10m-5-5h10" />
      </g>

      <g class="little-note" transform="rotate(8 410 340)">
        <path d="m383 327 60 3-4 34-60-3 4-34Z" fill="#F4ECD6" stroke="#C8B991" stroke-width="1.2" />
        <path d="m402 326 19 1-1 7-18-1 0-7Z" fill="#BACBBB" opacity=".65" />
        <path d="m391 341 37 2m-35 7 24 1" stroke="#B6A587" stroke-width="1.5" stroke-linecap="round" />
        <path d="m423 354 3-3 3 3" stroke="#D28C67" stroke-width="1.5" stroke-linecap="round" />
      </g>
      <g class="ground-spark" stroke="#C4A27C" stroke-width="1.4" stroke-linecap="round">
        <path d="m133 350-4 5m-1-7 7 1m306 32 5-2" />
        <circle cx="112" cy="343" r="2.5" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.pocket-scene { position: relative; width: 100%; max-width: 560px; margin: auto; isolation: isolate; }
.pocket-art { display: block; width: 100%; height: auto; overflow: visible; transition: transform .25s ease-out; transform-origin: 50% 60%; }
.pouch { transform-origin: 280px 280px; animation: pouch-breathe 4s ease-in-out infinite; }
.pocket-sprite { transform-origin: 342px 172px; animation: sprite-peek 6s ease-in-out infinite; }
.doodle-cloud { animation: doodle-drift 7s ease-in-out infinite; }
.doodle-star { transform-origin: 418px 94px; animation: doodle-turn 6s ease-in-out infinite; }
.little-note { transform-origin: 410px 340px; }
.reveal-glow { opacity: 0; }
.junk { opacity: 0; transform-box: fill-box; transform-origin: center; pointer-events: none; }
.search-stars { opacity: 0; }
.searching .pouch { animation: pocket-rummage 2.65s ease-in-out both; }
.searching .pocket-sprite { animation: sprite-hide .25s ease both; }
.searching .junk { animation-duration: .72s; animation-delay: var(--junk-delay); animation-fill-mode: both; animation-timing-function: ease-in; }
.searching .junk-0 { animation-name: junk-left; }
.searching .junk-1 { animation-name: junk-right; }
.searching .junk-2 { animation-name: junk-center; }
.searching .reveal-glow { animation: reveal-glow 3s ease-in-out both; }
.searching .search-stars { animation: stars-pop 3s ease-in-out both; }
.typing:not(.searching) .pouch { animation: listening .4s ease-in-out infinite; }
.compact { max-width: 320px; }
@keyframes pouch-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.012); } }
@keyframes sprite-peek { 0%,65%,100% { transform: translateY(0) rotate(0); } 75%,85% { transform: translateY(-3px) rotate(3deg); } }
@keyframes doodle-drift { 0%,100% { transform: translate(0,0); } 50% { transform: translate(4px,-5px); } }
@keyframes doodle-turn { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(5deg); } }
@keyframes listening { 0%,100% { transform: rotate(-1deg); } 50% { transform: rotate(1deg); } }
@keyframes pocket-rummage { 0% { transform: scale(.97,1.02); } 8%,24%,40% { transform: rotate(-7deg) scale(1.03,.98); } 16%,32%,48% { transform: rotate(7deg) scale(.98,1.03); } 58%,74% { transform: rotate(-9deg); } 66%,82% { transform: rotate(9deg); } 94%,100% { transform: rotate(0); } }
@keyframes sprite-hide { to { transform: translateY(40px); opacity: 0; } }
@keyframes junk-left { 0% { opacity: 0; transform: translate(265px,181px) rotate(0); } 12% { opacity: 1; } 45% { transform: translate(155px,112px) rotate(-130deg); } 78% { transform: translate(115px,346px) rotate(-220deg); } 89% { transform: translate(112px,319px) rotate(-233deg); } 100% { opacity: 1; transform: translate(108px,348px) rotate(-245deg); } }
@keyframes junk-right { 0% { opacity: 0; transform: translate(295px,185px) rotate(0); } 12% { opacity: 1; } 42% { transform: translate(401px,130px) rotate(150deg); } 78% { transform: translate(447px,341px) rotate(225deg); } 89% { transform: translate(451px,323px) rotate(232deg); } 100% { opacity: 1; transform: translate(453px,345px) rotate(240deg); } }
@keyframes junk-center { 0% { opacity: 0; transform: translate(270px,183px) rotate(0); } 12% { opacity: 1; } 42% { transform: translate(186px,134px) rotate(-100deg); } 78% { transform: translate(144px,375px) rotate(-190deg); } 89% { transform: translate(135px,356px) rotate(-220deg); } 100% { opacity: 1; transform: translate(128px,375px) rotate(-235deg); } }
@keyframes reveal-glow { 0%,77% { opacity: 0; } 90%,100% { opacity: 1; } }
@keyframes stars-pop { 0%,84% { opacity: 0; transform: translateY(15px); } 92%,100% { opacity: .8; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .pocket-art { transform: none !important; transition: none; } .pouch,.pocket-sprite,.doodle-cloud,.doodle-star { animation: none; } .searching .pouch,.typing .pouch { animation: none; } .searching .junk { animation-duration: .01s; } }
</style>
