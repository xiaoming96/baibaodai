<script setup>
const emit = defineEmits(['close'])
</script>

<template>
  <div class="fusion-failure-art" aria-hidden="true">
    <svg viewBox="0 0 300 195" fill="none">
      <ellipse cx="148" cy="177" rx="77" ry="8" fill="#B7A689" opacity=".15" />
      <g class="failure-smoke smoke-back" fill="#8A8375" stroke="#70695B" stroke-width="1.3" opacity=".2"><path d="M111 143c-13-9-13-23-3-32-15-8-10-27 4-30-11-20 7-40 27-32 5-21 36-27 49-7 26-2 42 22 28 42 24 17 7 48-17 44-6 20-29 25-45 15Z" /></g>
      <g class="failure-smoke smoke-front" fill="#7D796D" stroke="#6B665A" stroke-width="1.3" opacity=".36"><path d="M94 143c-17-5-21-24-6-34-7-18 5-35 24-32-2-18 20-30 33-17 13-12 35-6 37 13 22-3 34 17 26 33 17 9 18 29 1 39-12 11-31 5-40-1-20 12-45 9-58 0-5 1-10 2-17-1Z" /><path d="M112 103c-11-2-17 7-13 15m35-39c8-8 20-2 18 7m30 27c10-5 15 3 12 9" stroke="#E6DECD" stroke-width="2" opacity=".4" /></g>
      <g class="failure-scrap scrap-one" stroke="#786A53" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m96 141 30-13 10 15-11 3 8 13-27 15Z" fill="#DCA85E" /><path d="m108 143 11 14-8 6" stroke="#FFF3D5" stroke-width="2.4" /><path d="m130 132 4-9" stroke="#AE9770" /></g>
      <g class="failure-scrap scrap-two" stroke="#786A53" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m165 129 30 10-4 32-29-8 6-11-10-7Z" fill="#A8B794" /><path d="m174 142 13 4-2 14" stroke="#EEF0DA" stroke-width="2.4" /><path d="m203 145 10 3" stroke="#AE9770" /></g>
      <g class="failure-scrap scrap-three" stroke="#786A53" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m143 156 12 6-8 16-15-8Z" fill="#CE8F7D" /><path d="m138 164 7 4" stroke="#F8D6BD" stroke-width="2" /><path d="m74 159-9-3m161 13 8 3m-77-29 3-8" stroke="#A79575" /></g>
      <g class="failure-puff" stroke="#B6A586" stroke-width="1.5" stroke-linecap="round"><path d="m79 78-7-7m146 25 9-2M156 32l2-9m-54 91-10-2" /><path d="m204 50 3 6 6 3-6 2-3 7-2-7-7-2 7-3Z" /></g>
    </svg>
    <span class="failure-sound">噗…</span>
  </div>
  <span class="failure-kicker">A LITTLE EXPERIMENT, A LITTLE OOPS</span>
  <h2 id="modal-title" class="failure-title">噗！实验冒出一团小黑烟</h2>
  <p class="failure-copy">两件道具意见不合，留下几块碎片。<br />原来的道具都还好好的。</p>
  <div class="failure-note"><span aria-hidden="true">✧</span>脑洞也需要休息一下，明天再碰个头。</div>
  <button type="button" class="primary-button failure-button" @click="emit('close')">收好碎片，明天再试 <span aria-hidden="true">→</span></button>
</template>

<style scoped>
.fusion-failure-art { position: relative; width: min(300px, 100%); margin: 0 auto 13px; }.fusion-failure-art svg { display: block; width: 100%; height: auto; }.failure-sound { position: absolute; top: 30%; left: 10%; color: #9a8b70; font-family: 'KaiTi', 'STKaiti', serif; font-size: 20px; transform: rotate(-12deg); opacity: 0; animation: failure-sound .8s .2s ease-out forwards; }
.failure-kicker { display: block; text-align: center; color: #a19a82; font-size: 8px; line-height: 1.7; letter-spacing: 1.5px; }.failure-title { font-size: 23px; line-height: 1.6; margin: 12px 0 15px; text-align: center; color: #494e3e; font-weight: 700; }.failure-copy { font-size: 12px; line-height: 2.1; text-align: center; color: #8d8c76; margin: 0; }.failure-note { display: flex; justify-content: center; align-items: center; gap: 7px; padding: 13px 10px; margin: 23px 0 21px; border: 1px dashed #e0d8c1; border-radius: 8px; background: #f7f1e3; color: #a0926b; font-size: 10px; line-height: 1.8; text-align: center; }.failure-note span { color: #bea064; font-size: 16px; }.failure-button { width: 100%; }.failure-button > span { margin-left: 7px; font-size: 17px; }
.failure-smoke { transform-origin: 150px 145px; animation: failure-smoke-rise 1.8s ease-out both; }.smoke-back { animation-delay: .12s; }.failure-scrap { transform-origin: 150px 160px; animation: failure-scrap-land .85s cubic-bezier(.24,.62,.42,1.3) both; }.scrap-two { animation-delay: .1s; }.scrap-three { animation-delay: .18s; }.failure-puff { animation: failure-puff 1.2s ease-out both; }
@keyframes failure-smoke-rise { from { transform: translateY(17px) scale(.65); opacity: 0; } 40% { opacity: .38; } to { transform: translateY(-5px) scale(1); } }
@keyframes failure-scrap-land { from { transform: translateY(-38px) rotate(-9deg); opacity: 0; } 70% { transform: translateY(3px) rotate(2deg); opacity: 1; } to { transform: translateY(0) rotate(0); opacity: 1; } }
@keyframes failure-puff { from { opacity: 0; } 40%, to { opacity: 1; } }
@keyframes failure-sound { from { opacity: 0; transform: translateY(5px) rotate(-12deg); } to { opacity: 1; transform: translateY(0) rotate(-12deg); } }
@media (max-width: 600px) { .fusion-failure-art { width: 245px; max-width: 100%; margin-bottom: 11px; }.failure-title { font-size: 20px; }.failure-copy { font-size: 11px; }.failure-kicker { font-size: 7px; letter-spacing: 1px; }.failure-note { font-size: 9px; margin: 19px 0; }.failure-button { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .failure-smoke, .failure-scrap, .failure-puff, .failure-sound { animation: none; }.failure-sound { opacity: 1; } }
</style>
