<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import GadgetArt from './GadgetArt.vue'

const props = defineProps({
  gadget: { type: Object, required: true },
  outcome: { type: Object, default: null },
  worry: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const templates = [
  { id: 'healing', label: '治愈向', text: '今天的烦恼，被奇妙道具接住了。' },
  { id: 'fun', label: '玩梗向', text: '谁懂啊，这就是小时候最想要的东西！' },
  { id: 'invite', label: '互动向', text: '你的小烦恼，会被什么道具拯救？' },
]
const selected = ref('healing')
const caption = ref(templates[0].text)
const busy = ref('')
const message = ref('')
const dialog = ref(null)
const artContainer = ref(null)
const gadgetName = computed(() => props.gadget.name || '口袋里的小惊喜')
const gadgetEffect = computed(() => props.gadget.effect || props.gadget.description || '给平凡的一天，加一点奇妙。')
const outcomeText = computed(() => props.outcome?.text || props.outcome?.story || props.outcome?.description || '')
const serial = computed(() => String(props.gadget.no || props.gadget.number || props.gadget.id || '001').replace(/^NO\.?\s*/i, '').padStart(3, '0'))
const artKind = computed(() => props.gadget.kind || props.gadget.visual?.kind || props.gadget.art || 'wand')
const artColor = computed(() => props.gadget.color || props.gadget.visual?.color || '#deaa4b')
const date = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date())
let previousFocus = null
let live = true

function chooseTemplate(template) {
  selected.value = template.id
  caption.value = template.text
  message.value = ''
}

function close() {
  emit('close')
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const elements = [...dialog.value.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')]
    .filter(element => element.getClientRects().length)
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (!first) {
    event.preventDefault()
    dialog.value.focus()
  } else if (event.shiftKey && (document.activeElement === first || !dialog.value.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.value.contains(document.activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previousFocus = document.activeElement
  document.addEventListener('keydown', handleKeydown)
  await nextTick()
  dialog.value?.querySelector('button')?.focus()
})

onBeforeUnmount(() => {
  live = false
  document.removeEventListener('keydown', handleKeydown)
  if (previousFocus?.isConnected) previousFocus.focus()
})

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const chars = Array.from(String(text || ''))
  let line = ''
  const lines = []
  for (const char of chars) {
    if (char === '\n' || (line && ctx.measureText(line + char).width > maxWidth)) {
      lines.push(line)
      line = char === '\n' ? '' : char
    } else {
      line += char
    }
  }
  if (line) lines.push(line)
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines && visible.length) {
    let finalLine = visible[visible.length - 1]
    while (finalLine && ctx.measureText(finalLine + '…').width > maxWidth) finalLine = finalLine.slice(0, -1)
    visible[visible.length - 1] = finalLine + '…'
  }
  visible.forEach((lineText, index) => ctx.fillText(lineText, x, y + index * lineHeight))
  return visible.length * lineHeight
}

async function loadArt() {
  const source = artContainer.value?.querySelector('svg')
  if (!source) return null
  const clone = source.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '280')
  clone.setAttribute('height', '280')
  clone.style.color = getComputedStyle(source).color
  // The artwork contains only original local SVG shapes, with no external assets.
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('道具插画暂时没有准备好'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawFallbackArt(ctx) {
  ctx.save()
  ctx.translate(430, 302)
  ctx.rotate(-0.12)
  ctx.fillStyle = '#f7dd8a'
  ctx.strokeStyle = '#3f4a3b'
  ctx.lineWidth = 5
  roundedRect(ctx, -82, -70, 164, 155, 30)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -5, 31, 0, Math.PI * 2)
  ctx.fillStyle = '#fcf9e9'
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-50, 54)
  ctx.lineTo(50, 54)
  ctx.stroke()
  ctx.fillStyle = '#3f4a3b'
  ctx.font = '36px serif'
  ctx.textAlign = 'center'
  ctx.fillText('✦', 0, 8)
  ctx.restore()
}

async function createPosterBlob() {
  const canvas = document.createElement('canvas')
  canvas.width = 860
  canvas.height = 1200
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('这个浏览器暂时无法生成图片，请换个浏览器试试。')
  const ink = '#344638'
  ctx.fillStyle = '#faf5e7'
  ctx.fillRect(0, 0, 860, 1200)
  ctx.fillStyle = 'rgba(117,95,61,0.055)'
  for (let y = 12; y < 1200; y += 12) {
    for (let x = 12; x < 860; x += 12) {
      ctx.beginPath()
      ctx.arc(x + ((y / 12) % 2) * 3, y, 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.strokeStyle = '#c5ba9c'
  ctx.lineWidth = 2
  roundedRect(ctx, 27, 27, 806, 1146, 6)
  ctx.stroke()
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('奇妙口袋事务所', 64, 87)
  ctx.font = '19px monospace'
  ctx.fillStyle = '#94856a'
  ctx.fillText('A LITTLE MAGIC FOR EVERYDAY', 64, 116)
  ctx.textAlign = 'right'
  ctx.font = '20px monospace'
  ctx.fillText('NO.' + serial.value, 795, 88)
  ctx.save()
  ctx.translate(758, 132)
  ctx.rotate(0.12)
  ctx.strokeStyle = '#ca9362'
  ctx.setLineDash([5, 4])
  ctx.strokeRect(-43, -24, 84, 52)
  ctx.setLineDash([])
  ctx.font = '18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#b08054'
  ctx.fillText('快乐邮局', 0, 6)
  ctx.restore()
  ctx.fillStyle = '#f0e2bd'
  ctx.beginPath()
  ctx.ellipse(430, 319, 170, 137, -0.06, 0, Math.PI * 2)
  ctx.fill()
  let artwork = null
  try { artwork = await loadArt() } catch { /* A local Canvas doodle keeps exports available. */ }
  if (artwork) ctx.drawImage(artwork, 292, 173, 276, 276)
  else drawFallbackArt(ctx)
  ctx.fillStyle = '#c19945'
  ctx.textAlign = 'center'
  ctx.font = '35px serif'
  ctx.fillText('✦', 242, 238)
  ctx.font = '26px serif'
  ctx.fillText('✧', 619, 375)
  ctx.fillStyle = ink
  ctx.font = 'bold 43px sans-serif'
  const nameHeight = wrapText(ctx, gadgetName.value, 430, 498, 704, 52, 2)
  ctx.fillStyle = '#7c826c'
  ctx.font = '23px sans-serif'
  wrapText(ctx, gadgetEffect.value, 430, 520 + nameHeight, 688, 35, 2)
  ctx.strokeStyle = '#c9c0a7'
  ctx.setLineDash([6, 7])
  ctx.beginPath()
  ctx.moveTo(74, 672)
  ctx.lineTo(786, 672)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'left'
  ctx.font = 'bold 32px sans-serif'
  ctx.fillStyle = ink
  const captionHeight = wrapText(ctx, caption.value || templates.find(t => t.id === selected.value).text, 84, 744, 690, 46, 3)
  ctx.font = '23px sans-serif'
  ctx.fillStyle = '#777c6a'
  const detail = outcomeText.value || (props.worry ? '今天的小烦恼：' + props.worry : '愿你也能在忙碌的日子里，找到一点孩子气的快乐。')
  wrapText(ctx, detail, 84, 779 + captionHeight, 690, 35, 4)
  ctx.strokeStyle = '#c9c0a7'
  ctx.beginPath()
  ctx.moveTo(64, 1090)
  ctx.lineTo(796, 1090)
  ctx.stroke()
  ctx.font = '19px sans-serif'
  ctx.fillStyle = '#878775'
  ctx.fillText('寄给今天也很努力的你', 65, 1134)
  ctx.textAlign = 'right'
  ctx.font = '18px monospace'
  ctx.fillText(date + ' · 口袋来信', 795, 1134)
  return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请再试一次。')), 'image/png'))
}

async function downloadPoster() {
  if (busy.value) return
  busy.value = 'download'
  message.value = ''
  try {
    const blob = await createPosterBlob()
    if (!live) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '奇妙口袋-' + gadgetName.value.replace(/[\\/:*?"<>|]/g, '') + '.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    message.value = '海报已准备好。微信内如未下载，请用系统浏览器打开后保存。'
  } catch (error) {
    if (live) message.value = error.message || '图片生成失败，请再试一次。'
  } finally {
    if (live) busy.value = ''
  }
}

async function sharePoster() {
  if (busy.value) return
  message.value = ''
  if (!navigator.share || !navigator.canShare || typeof File === 'undefined') {
    message.value = '这个浏览器暂不支持分享图片。请先保存海报，再从微信或朋友圈发送。'
    return
  }
  busy.value = 'share'
  try {
    const blob = await createPosterBlob()
    if (!live) return
    const file = new File([blob], '奇妙口袋明信片.png', { type: 'image/png' })
    if (!navigator.canShare({ files: [file] })) {
      message.value = '这个浏览器暂不支持分享图片。请先保存海报，再从微信或朋友圈发送。'
      return
    }
    await navigator.share({ files: [file], title: '奇妙口袋事务所', text: caption.value })
    if (live) message.value = '海报已交给系统分享面板。'
  } catch (error) {
    if (live) message.value = error.name === 'AbortError' ? '分享已取消，海报还在这里。' : '分享暂时没有成功，可以保存图片后手动发送。'
  } finally {
    if (live) busy.value = ''
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="poster-overlay" @click.self="close">
      <section ref="dialog" class="poster-dialog" role="dialog" aria-modal="true" aria-labelledby="poster-title" tabindex="-1">
        <button class="poster-close" type="button" aria-label="关闭海报窗口" @click="close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <div class="poster-preview-area">
          <article class="postcard" aria-label="分享海报预览">
            <header class="postcard-top"><div><b>奇妙口袋事务所</b><span>A LITTLE MAGIC FOR EVERYDAY</span></div><span class="card-serial">NO.{{ serial }}</span></header>
            <span class="postage-stamp">快乐邮局</span>
            <div ref="artContainer" class="postcard-art"><span class="art-spark one">✦</span><GadgetArt :kind="artKind" :color="artColor" /><span class="art-spark two">✧</span></div>
            <h3>{{ gadgetName }}</h3>
            <p class="postcard-effect">{{ gadgetEffect }}</p>
            <div class="postcard-rule" />
            <p class="postcard-caption">{{ caption || templates.find(t => t.id === selected).text }}</p>
            <p class="postcard-story">{{ outcomeText || (worry ? `今天的小烦恼：${worry}` : '愿你也能在忙碌的日子里，找到一点孩子气的快乐。') }}</p>
            <footer><span>寄给今天也很努力的你</span><span>{{ date }} · 口袋来信</span></footer>
          </article>
          <span class="preview-note">把这份小小的奇妙，寄给一个人。</span>
        </div>
        <div class="poster-controls">
          <span class="poster-eyebrow">FROM MY POCKET, WITH LOVE</span>
          <h2 id="poster-title">装进一张<br /><em>快乐明信片</em></h2>
          <p class="poster-intro">生活偶尔乌龙，快乐可以分享。<br />选一句话，留下今天的小奇遇。</p>
          <fieldset class="template-fieldset">
            <legend>选一个心情</legend>
            <div class="template-options">
              <button v-for="template in templates" :key="template.id" type="button" :class="{ selected: selected === template.id }" :aria-pressed="selected === template.id" @click="chooseTemplate(template)">{{ template.label }}</button>
            </div>
          </fieldset>
          <label class="caption-label" for="poster-caption">想说的话 <span>{{ caption.length }}/60</span></label>
          <textarea id="poster-caption" v-model="caption" maxlength="60" rows="3" placeholder="给今天的自己，留一句话…" />
          <button class="poster-primary" type="button" :disabled="!!busy" @click="downloadPoster"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" /></svg>{{ busy === 'download' ? '明信片正在显影…' : '保存高清明信片' }}</button>
          <button class="poster-secondary" type="button" :disabled="!!busy" @click="sharePoster"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 12v9h14v-9" /></svg>{{ busy === 'share' ? '准备分享…' : '分享这份小快乐' }}</button>
          <p class="poster-message" role="status" aria-live="polite">{{ message || '图片保存在你的设备，烦恼就留在口袋里。' }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.poster-overlay { position: fixed; inset: 0; z-index: 1000; background: #27392be0; backdrop-filter: blur(5px); padding: 28px; display: flex; align-items: center; justify-content: center; }
.poster-dialog { position: relative; display: grid; grid-template-columns: 1.08fr 1fr; width: min(900px, 100%); max-height: calc(100dvh - 56px); overflow: auto; border: 1px solid #d2c9b0; border-radius: 20px; background: #faf7ed; color: #344638; box-shadow: 0 24px 80px #12251940; outline: none; }
.poster-close { position: absolute; z-index: 2; top: 18px; right: 18px; display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #d9d5c5; border-radius: 50%; background: #faf7ed; color: #5d6758; cursor: pointer; }
.poster-close svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 1.5; fill: none; }
.poster-preview-area { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 38px 30px; background: #e9e4d5; background-image: radial-gradient(#b8af9240 .7px, transparent .7px); background-size: 7px 7px; }
.postcard { position: relative; display: flex; flex-direction: column; width: 100%; min-height: 470px; padding: 25px 25px 20px; background: #faf5e7; background-image: radial-gradient(#88795916 .7px, transparent .7px); background-size: 6px 6px; border: 1px solid #d3c8ad; outline: 1px solid #c5ba9c; outline-offset: -9px; box-shadow: 4px 8px 15px #5b51331c; transform: rotate(-1.5deg); }
.postcard-top { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
.postcard-top b { display: block; font-size: 12px; letter-spacing: .5px; font-weight: 700; }
.postcard-top div > span { display: block; margin-top: 4px; font-size: 6px; letter-spacing: .75px; color: #94856a; }
.card-serial { font-family: monospace; font-size: 9px; color: #94856a; padding-top: 1px; }
.postage-stamp { position: absolute; top: 51px; right: 27px; border: 1px dashed #ca9362; padding: 6px 5px; color: #b08054; font-size: 8px; transform: rotate(9deg); }
.postcard-art { position: relative; display: flex; align-items: center; justify-content: center; width: 180px; height: 167px; align-self: center; margin: 16px 0 0; }
.postcard-art::before { content: ''; position: absolute; width: 160px; height: 129px; border-radius: 49% 51% 55% 45%; background: #f0e2bd; transform: rotate(-5deg); }
.postcard-art :deep(svg) { position: relative; width: 145px; height: 145px; }
.art-spark { position: absolute; z-index: 1; color: #c19945; font-family: serif; }.art-spark.one { left: -3px; top: 29px; font-size: 20px; }.art-spark.two { right: -3px; bottom: 22px; font-size: 17px; }
.postcard h3 { margin: 5px 0 9px; font-size: 22px; line-height: 1.4; text-align: center; font-weight: 750; }
.postcard-effect { text-align: center; color: #7c826c; font-size: 11px; line-height: 1.75; margin: 0 0 17px; }
.postcard-rule { border-top: 1px dashed #c9c0a7; margin-bottom: 22px; }
.postcard-caption { font-size: 16px; line-height: 1.6; font-weight: 700; margin: 0 0 12px; overflow-wrap: anywhere; }
.postcard-story { color: #777c6a; font-size: 11px; line-height: 1.8; margin: 0 0 20px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.postcard footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #d3cbb8; display: flex; justify-content: space-between; gap: 8px; font-size: 8px; color: #878775; }
.preview-note { font-size: 11px; color: #817d69; letter-spacing: 1px; }
.poster-controls { padding: 55px 36px 28px; display: flex; flex-direction: column; align-items: stretch; }
.poster-eyebrow { color: #9b977e; font-size: 8px; font-weight: 650; letter-spacing: 1.8px; }
.poster-controls h2 { margin: 18px 0 14px; font-size: 31px; line-height: 1.45; letter-spacing: 2px; font-weight: 650; }.poster-controls h2 em { color: #b99439; font-style: normal; }
.poster-intro { margin: 0 0 27px; font-size: 12px; line-height: 1.9; color: #858875; }
.template-fieldset { padding: 0; margin: 0 0 22px; border: 0; }.template-fieldset legend { margin-bottom: 10px; font-size: 12px; font-weight: 600; }
.template-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }.template-options button { padding: 9px 5px; border: 1px solid #dedbca; background: transparent; border-radius: 7px; font: inherit; font-size: 12px; color: #81836f; cursor: pointer; }.template-options button.selected { color: #7e6221; background: #f3e8c5; border-color: #d8bf70; }
.caption-label { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 10px; }.caption-label span { font-size: 10px; color: #999982; font-weight: 400; }
textarea { display: block; resize: vertical; min-height: 89px; max-height: 180px; width: 100%; box-sizing: border-box; border: 1px solid #dedbca; border-radius: 8px; background: #fdfaf2; padding: 12px; color: #4c5846; font: inherit; font-size: 12px; line-height: 1.9; margin-bottom: 24px; }
.poster-primary, .poster-secondary { display: flex; justify-content: center; align-items: center; gap: 9px; min-height: 44px; padding: 11px 14px; border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; transition: transform .15s, background .15s; }.poster-primary { color: #fffdf4; border: 1px solid #465740; background: #465740; }.poster-secondary { margin-top: 10px; color: #66725a; border: 1px solid #d5dac9; background: transparent; }.poster-primary svg, .poster-secondary svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
button:hover:not(:disabled) { transform: translateY(1px); }button:active:not(:disabled) { transform: translateY(2px); }button:disabled { cursor: wait; opacity: .65; }button:focus-visible, textarea:focus-visible { outline: 3px solid #c8aa5c; outline-offset: 3px; }
.poster-message { min-height: 36px; font-size: 10px; line-height: 1.8; margin: 15px 0 0; color: #969680; }
@media (max-width: 650px) { .poster-overlay { padding: 16px; }.poster-dialog { display: flex; flex-direction: column; max-height: calc(100dvh - 32px); border-radius: 15px; }.poster-close { top: 13px; right: 13px; }.poster-preview-area { order: 1; padding: 24px 34px; }.postcard { max-width: 310px; min-height: 450px; box-sizing: border-box; }.poster-controls { order: 0; padding: 28px 24px 18px; }.poster-eyebrow { max-width: calc(100% - 34px); letter-spacing: 1px; }.poster-controls h2 { font-size: 25px; line-height: 1.4; margin: 12px 0 10px; }.poster-controls h2 br { display: none; }.poster-intro { margin-bottom: 17px; }.poster-intro br { display: none; }.template-fieldset { margin-bottom: 16px; }textarea { margin-bottom: 16px; min-height: 70px; }.poster-message { margin-top: 10px; min-height: 20px; }.preview-note { font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
