<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  kind: { type: String, default: 'normal' },
  instant: { type: Boolean, default: false },
})

const progress = ref('')
const animating = ref(false)
const reducedMotion = ref(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
let timer = null
let motionQuery = null

function clearTimer() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function complete() {
  clearTimer()
  progress.value = props.text
  animating.value = false
}

function restart() {
  clearTimer()
  const characters = Array.from(props.text)
  if (props.instant || reducedMotion.value || !characters.length) {
    complete()
    return
  }
  progress.value = ''
  animating.value = true
  const normal = props.kind === 'normal'
  const charsPerSecond = normal ? 3 : 100
  const limit = normal ? Math.min(characters.length, 120) : characters.length
  const startedAt = Date.now()
  function advance() {
    const count = Math.min(limit, Math.floor((Date.now() - startedAt) * charsPerSecond / 1000))
    if (count >= limit) {
      complete()
      return
    }
    progress.value = characters.slice(0, count).join('')
    timer = setTimeout(advance, normal ? 80 : 16)
  }
  timer = setTimeout(advance, normal ? 80 : 16)
}

function onMotionChange(event) {
  reducedMotion.value = event.matches
}

watch([() => props.text, () => props.kind, () => props.instant, reducedMotion], restart, { immediate: true })
onMounted(() => {
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  motionQuery?.addEventListener('change', onMotionChange)
})
onBeforeUnmount(() => {
  clearTimer()
  motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <p class="outcome-story"><span class="story-accessible">{{ text }}</span><span aria-hidden="true">{{ progress }}<span v-if="animating" class="story-caret" /></span></p>
  <button v-if="animating" type="button" class="story-reveal" @click="complete">展开完整故事 <span aria-hidden="true">↗</span></button>
</template>

<style scoped>
.outcome-story { white-space: pre-line; overflow-wrap: anywhere; }
.story-accessible { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.story-caret { display: inline-block; width: 2px; height: .9em; margin-left: 3px; vertical-align: -.05em; background: #9c9474; opacity: .55; animation: story-blink 1s steps(2, start) infinite; }
.story-reveal { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 6px 0; font: inherit; font-size: 10px; color: #8c8062; background: transparent; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; }
.story-reveal span { font-size: 12px; text-decoration: none; }.story-reveal:hover { color: #615738; }.story-reveal:focus-visible { outline: 2px solid #8e9d76; outline-offset: 4px; border-radius: 2px; }
@keyframes story-blink { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .story-caret { animation: none; } }
</style>
