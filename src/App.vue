<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import PocketScene from './components/PocketScene.vue'
import GadgetArt from './components/GadgetArt.vue'
import UiIcon from './components/UiIcon.vue'
import SharePoster from './components/SharePoster.vue'
import * as game from './lib/game.js'

const catalog = game.GADGETS
let storage
try { storage = window.localStorage } catch { storage = {getItem:()=>null,setItem:()=>{throw new Error('Storage unavailable')}} }
const state = ref(game.loadState(storage))
const now = ref(Date.now())
const tab = ref('home')
const worry = ref('')
const typing = ref(false)
const searching = ref(false)
const searchMessage = ref('')
const current = ref(null)
const mode = ref('help')
const strength = ref(32)
const result = ref(null)
const starting = ref(false)
const dialog = ref(null)
const showPoster = ref(false)
const toast = ref('')
const sound = ref(state.value.settings.sound)
const atlasMode = ref('gadgets')
const category = ref('全部')
const selected = ref([])
const fusing = ref(false)
const suggestions = [
  ['明天要汇报，有点紧张', '想摸鱼又怕被发现', '睡不着，脑袋停不下来'],
  ['周一真的不想上班', '总是忍不住胡思乱想', '想和老朋友说说话'],
  ['工作太多，时间不够用', '最近有一点没自信', '今天想要一点小幸运'],
]
const suggestionIndex = ref(0)
const categories = ['全部', '日常治愈', '冒险搞怪', '整蛊恶作剧', '稀有传说']
const timers = new Set()
let typingTimer, toastTimer, audioContext, focusBefore
const allGadgets = computed(() => [...catalog, ...(state.value.customGadgets || [])])
const unlocked = computed(() => allGadgets.value.filter(g => (state.value.collected || []).includes(g.id)))
const filtered = computed(() => allGadgets.value.filter(g => category.value === '全部' || g.category === category.value))
const events = computed(() => state.value.eventRecords || [])
const achievements = computed(() => game.getAchievements(state.value))
const remaining = computed(() => Math.max(0, 3 - (state.value.usage?.help || 0)))
const fusionRemaining = computed(() => Math.max(0, 1 - (state.value.usage?.fusion || 0)))
const blindUsed = computed(() => (state.value.usage?.blind || 0) >= 1)
const odds = computed(() => game.outcomeWeights(strength.value))
const tier = computed(() => ({safe:'稳妥区',regular:'常规区',wild:'作死区'})[game.strengthTier(strength.value)])
const currentDurability = computed(() => current.value ? game.getDurability(state.value, current.value, now.value) : null)
function refreshDay() {
  now.value = Date.now()
  const day = state.value.usage.date
  game.ensureDaily(state.value, now.value)
  if (day !== state.value.usage.date) persist()
}
const dayTimer = setInterval(refreshDay, 60000)
document.addEventListener('visibilitychange', refreshDay)

function later(fn, ms) { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t); return t }
function notify(message) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3600) }
watch(sound, value => { state.value.settings.sound = value; persist() })
function persist() {
  const saved = game.saveState(storage, state.value)
  if (saved === false) notify('浏览器未允许保存数据，这次体验仍可继续。')
}
function clickSound(high = false) {
  if (!sound.value) return
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    audioContext.resume()
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain()
    oscillator.connect(gain); gain.connect(audioContext.destination)
    oscillator.type = 'sine'; oscillator.frequency.value = high ? 660 : 260
    gain.gain.setValueAtTime(.045, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .16)
    oscillator.start(); oscillator.stop(audioContext.currentTime + .17)
  } catch { sound.value = false }
}
function navigate(value) { if (searching.value || fusing.value) return; refreshDay(); tab.value = value; clickSound(); window.scrollTo({top:0,behavior:'smooth'}) }
function onType() { typing.value = true; clearTimeout(typingTimer); typingTimer = setTimeout(() => typing.value = false, 450) }
function fillSuggestion(text) { worry.value = text; onType(); document.querySelector('textarea')?.focus() }
function draw(type = 'help', chain = false) {
  if (searching.value || fusing.value || starting.value) return
  game.ensureDaily(state.value)
  if (type === 'help' && !worry.value.trim() && !chain) { notify('先把你的小烦恼告诉口袋吧。'); document.querySelector('textarea')?.focus(); return }
  if (type === 'blind' && blindUsed.value && state.value.lastFortune?.date === game.localDay()) {
    current.value = allGadgets.value.find(g => g.id === state.value.lastFortune.gadgetId);
    if (current.value) { mode.value='blind'; result.value=null; dialog.value='gadget'; return }
  }
  const use = game.consumeUsage(state.value, type)
  if (!use.ok) { notify(type === 'blind' ? '今天的好运已经领到啦，明天再来掏一掏。' : '今天口袋也要休息一下啦，明天再来。'); return }
  persist(); clickSound()
  dialog.value = null; tab.value = 'home'; mode.value = type; searching.value = true; result.value = null; strength.value = 32
  searchMessage.value = '让我在口袋里找找…'
  later(() => searchMessage.value = '哎呀，拿错了…', 1000)
  later(() => searchMessage.value = '不对不对，再找找…', 1800)
  later(() => searchMessage.value = '啊哈，就是这个！', 2500)
  later(() => {
    current.value = type === 'blind' ? game.drawRandomGadget() : game.matchGadget(chain ? resultWorry.value : worry.value, state.value.collected)
    game.collectGadget(state.value, current.value)
    if (type === 'blind') state.value.lastFortune = { date:game.localDay(), gadgetId:current.value.id }
    persist(); searching.value = false; searchMessage.value = ''; dialog.value = 'gadget'; clickSound(true)
  }, 3000)
}
const resultWorry = ref('')
function activate() {
  if (starting.value || !current.value) return
  if (game.getDurability(state.value, current.value).broken) { notify('道具正在修理，24小时后自动恢复，也可以使用免费修理。'); return }
  if (mode.value !== 'help') {
    const quota = game.consumeUsage(state.value, 'help')
    if (!quota.ok) { notify(quota.reason); return }
  }
  const use = game.useGadget(state.value, current.value, strength.value)
  if (!use.ok) { notify('这件道具正在修理，试试别的道具吧。'); return }
  starting.value = true; clickSound()
  later(() => {
    result.value = game.generateOutcome(current.value, worry.value || '今天想要一点小幸运', strength.value)
    resultWorry.value = result.value.chain?.worry || result.value.text
    game.recordOutcome(state.value, result.value)
    persist(); starting.value = false; clickSound(true)
  }, 1100)
}
function openCollected(g) {
  if (!(state.value.collected || []).includes(g.id)) { notify('这件道具还藏在口袋里，去求助或掏盲盒发现它吧。'); return }
  current.value = g; result.value = null; mode.value = 'collection'; strength.value = 32; dialog.value = 'gadget'
}
function repair() {
  const repaired = game.repairGadget(state.value, current.value)
  if (repaired.ok) { persist(); notify('针线修好啦！道具又精神起来了。') }
  else notify(repaired.reason || '每天可免费修理一次，明天再来吧。')
}
function selectFusion(id) {
  if (fusing.value) return
  if (selected.value.includes(id)) selected.value = selected.value.filter(x => x !== id)
  else if (selected.value.length < 2) selected.value.push(id)
  else notify('一次只能放入两件道具，点击已选道具可以换掉它。')
}
function fusion() {
  if (selected.value.length !== 2 || fusing.value) return
  game.ensureDaily(state.value)
  const use = game.consumeUsage(state.value, 'fusion')
  if (!use.ok) { notify('今天的实验做完啦，明天带着新脑洞再来。'); return }
  const pair = selected.value.map(id => allGadgets.value.find(g => g.id === id))
  fusing.value = true; persist(); clickSound()
  later(() => {
    const combined = game.fuseGadgets(...pair)
    fusing.value = false
    if (!combined.ok) { notify('噗！合体失败，留下两块道具碎片。原道具还好好的。'); return }
    current.value = combined.gadget; game.recordFusion(state.value, combined)
    persist(); mode.value = 'fusion'; result.value = null; strength.value = 32; dialog.value = 'gadget'; selected.value = []; clickSound(true)
  }, 2000)
}
function continueChain() { const previous = result.value; if (!previous?.chain) return; worry.value = resultWorry.value.slice(0,100); draw('help', true) }
function closeDialog() { if (!starting.value) dialog.value = null }
function trapFocus(event) {
  if (!dialog.value || showPoster.value) return
  if (event.key === 'Escape') { closeDialog(); return }
  if (event.key !== 'Tab') return
  const items = Array.from(document.querySelectorAll('.modal-card button:not(:disabled), .modal-card input, .modal-card [tabindex="0"], .modal-card a')).filter(e => e.offsetParent !== null)
  const first = items[0], last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(dialog, async value => {
  if (value) { focusBefore = document.activeElement; document.body.style.overflow = 'hidden'; await nextTick(); document.querySelector('.modal-close')?.focus() }
  else { document.body.style.overflow = ''; focusBefore?.focus?.() }
})
document.addEventListener('keydown', trapFocus)
onBeforeUnmount(() => { timers.forEach(clearTimeout); clearTimeout(typingTimer); clearTimeout(toastTimer); clearInterval(dayTimer); document.removeEventListener('keydown', trapFocus); document.removeEventListener('visibilitychange', refreshDay); document.body.style.overflow = ''; audioContext?.close() })
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <button class="brand" @click="navigate('home')" aria-label="奇妙口袋事务所首页">
        <span class="brand-mark"><UiIcon name="pocket" :size="32" /></span>
        <span><strong>奇妙口袋<span class="brand-small">事务所</span></strong><small>WONDER POCKET CLUB</small></span>
      </button>
      <nav class="main-nav" aria-label="主导航">
        <button :class="{active: tab === 'home'}" @click="navigate('home')">烦恼求助<span v-if="tab === 'home'" class="nav-dot"></span></button>
        <button :class="{active: tab === 'atlas'}" @click="navigate('atlas')">道具图鉴<span v-if="tab === 'atlas'" class="nav-dot"></span></button>
        <button :class="{active: tab === 'lab'}" @click="navigate('lab')">合体实验室<span v-if="tab === 'lab'" class="nav-dot"></span></button>
      </nav>
      <div class="header-actions"><button class="fortune-pill" @click="draw('blind')" :disabled="searching"><UiIcon name="sun" :size="18" /><span>今日好运</span><span class="tiny-dot"></span></button><button class="icon-button about-button" @click="dialog = 'about'" aria-label="关于事务所"><UiIcon name="info" :size="20" /></button></div>
    </header>

    <main>
      <template v-if="tab === 'home'">
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero-copy">
            <div class="eyebrow"><span class="open-dot"></span> 营业中 <span class="eyebrow-divider">/</span> 童年快乐补给站</div>
            <h1 id="hero-title">今天的烦恼，<br>交给<span class="highlight-word">口袋</span>吧<span class="title-period">。</span><svg class="title-star" viewBox="0 0 40 40"><path d="m20 3 4 12 12 5-12 4-4 13-4-13-13-4 13-5Z" /></svg></h1>
            <p class="hero-description">长大后的生活，偶尔也需要一点不讲道理的魔法。<br>这里有奇妙道具，也有刚刚好的小乌龙。</p>
            <form class="worry-form" @submit.prevent="draw('help')">
              <div class="form-heading"><span><UiIcon name="spark" :size="17" /> 把小烦恼放进来</span><span class="char-count">{{ worry.length }} / 100</span></div>
              <label for="worry" class="sr-only">你的小烦恼，100字以内</label>
              <textarea id="worry" v-model="worry" maxlength="100" rows="2" placeholder="比如，明天要汇报，好紧张啊…" @input="onType" :disabled="searching"></textarea>
              <div class="suggestion-heading"><span>不知道怎么说？试试这些</span><button type="button" @click="suggestionIndex = (suggestionIndex + 1) % suggestions.length" :disabled="searching"><UiIcon name="shuffle" :size="13" />换一批</button></div>
              <div class="suggestion-list"><button v-for="s in suggestions[suggestionIndex]" :key="s" type="button" @click="fillSuggestion(s)" :disabled="searching">{{ s }}</button></div>
              <button class="primary-button find-button" type="submit" :disabled="searching || remaining === 0"><UiIcon name="pocket" :size="22" />{{ searching ? '口袋正在努力翻找…' : '帮我找找' }}<UiIcon name="arrow" :size="21" /></button>
              <p class="form-footnote"><span class="little-star">✧</span> 不用很勇敢，也可以来求助 <span class="usage-note">今日剩余 {{ remaining }} / 3 次</span></p>
            </form>
          </div>
          <div class="hero-visual">
            <div class="handwritten-note">总有一个办法，<br><span>让今天好过一点点。</span><svg viewBox="0 0 74 54"><path d="M7 5C2 30 26 41 63 38m-14-9 16 10-16 9" /></svg></div>
            <PocketScene :searching="searching" :typing="typing" />
            <div class="pocket-caption" :class="{finding:searching}" aria-live="polite"><span>{{ searching ? searchMessage : '口袋不大，奇思妙想装得下。' }}</span><small>{{ searching ? '请稍等，魔法正在赶来的路上' : 'P.S. 道具可能不太靠谱，但快乐是认真的。' }}</small></div>
            <span class="hero-number">POCKET NO. 001</span>
          </div>
        </section>

        <section class="explore" aria-label="更多玩法">
          <button class="explore-card blind-card" @click="draw('blind')" :disabled="searching">
            <span class="feature-illustration"><UiIcon name="gift" :size="35" /><span class="feature-spark">✧</span></span>
            <span class="feature-copy"><span class="feature-heading">随机掏一个 <em>每日限定</em></span><span class="feature-description">不问烦恼，看看今天的小幸运</span></span><UiIcon name="arrow" :size="19" />
          </button>
          <button class="explore-card lab-card" @click="navigate('lab')"><span class="feature-illustration"><UiIcon name="flask" :size="36" /><span class="feature-spark">+</span></span><span class="feature-copy"><span class="feature-heading">道具合体 <em>脑洞实验室</em></span><span class="feature-description">两个小奇妙，会碰出什么火花？</span></span><UiIcon name="arrow" :size="19" /></button>
          <button class="explore-card collection-card" @click="navigate('atlas')"><span class="feature-illustration"><UiIcon name="book" :size="35" /><span class="feature-spark">♡</span></span><span class="feature-copy"><span class="feature-heading">我的奇妙收藏 <em>{{ unlocked.length }} 件已发现</em></span><span class="feature-description">把道具、乌龙和快乐好好收起来</span></span><UiIcon name="arrow" :size="19" /></button>
        </section>

        <section class="discovery" aria-labelledby="discovery-title">
          <div class="section-heading"><div><span class="section-kicker">A LITTLE BIT OF WONDER</span><h2 id="discovery-title">口袋里的小小奇迹 <span>✧</span></h2></div><button class="text-button" @click="navigate('atlas')">翻开道具图鉴 <UiIcon name="arrow" :size="17" /></button></div>
          <div class="discovery-grid"><button v-for="g in catalog.slice(0,4)" :key="g.id" class="discovery-card" @click="dialog = 'peek'; current = g"><div class="discovery-art" :style="{'--art-color':g.color}"><span class="card-number">NO.{{ String(g.no).replace('NO.', '').padStart(3,'0') }}</span><GadgetArt :kind="g.kind" :color="g.color" /><span class="art-twinkle">✦</span></div><div class="discovery-info"><h3>{{ g.name }}</h3><p>{{ g.effect }}</p><span class="category-tag">{{ g.category }}</span></div></button></div>
        </section>
      </template>

      <section v-else-if="tab === 'atlas'" class="inner-page">
        <div class="page-intro"><span class="eyebrow"><UiIcon name="book" :size="16" /> 每件小事，都值得被收藏</span><h1>我的奇妙<span class="highlight-word">收藏册</span></h1><p>道具、意外，还有属于你的那些小小高光。</p></div>
        <div class="collection-summary"><div><strong>{{ unlocked.length }}<span> / {{ allGadgets.length }}</span></strong><span>道具已发现</span></div><div><strong>{{ events.length }}</strong><span>乌龙与奇遇</span></div><div><strong>{{ achievements.filter(a=>a.unlocked).length }}</strong><span>传说成就</span></div><div class="progress-detail"><span>一点一点，把口袋装满</span><div class="progress-track"><i :style="{width:unlocked.length / allGadgets.length * 100 + '%'}"></i></div></div></div>
        <div class="collection-tabs" role="tablist" aria-label="收藏分类"><button v-for="[id,label] in [['gadgets','道具图鉴'],['events','乌龙事件簿'],['achievements','传说成就']]" :key="id" role="tab" :aria-selected="atlasMode === id" :class="{active:atlasMode===id}" @click="atlasMode=id">{{ label }}</button></div>
        <template v-if="atlasMode === 'gadgets'"><div class="filter-chips"><button v-for="c in categories" :key="c" :class="{active:category===c}" @click="category=c">{{ c }}</button></div><div class="atlas-grid"><button v-for="g in filtered" :key="g.id" class="atlas-card" :class="{locked:!state.collected.includes(g.id)}" @click="openCollected(g)"><span class="card-number">NO.{{ String(g.no).replace('NO.', '').padStart(3,'0') }}</span><GadgetArt :kind="g.kind" :color="g.color" /><h3>{{ g.name }}</h3><p>{{ state.collected.includes(g.id) ? g.effect : '还藏在口袋里，等待与你相遇' }}</p><span class="atlas-status"><UiIcon :name="state.collected.includes(g.id)?'check':'lock'" :size="13" />{{ state.collected.includes(g.id) ? '已发现 · ' + g.rarity : '尚未发现' }}</span></button></div></template>
        <template v-else-if="atlasMode === 'events'"><div v-if="!events.length" class="empty-state"><UiIcon name="spark" :size="50" /><h3>还没有乌龙，也是一种幸运。</h3><p>使用道具后，发生过的奇遇会收藏在这里。</p><button class="primary-button" @click="navigate('home')">去找一件道具 <UiIcon name="arrow" :size="18" /></button></div><div v-else class="event-grid"><article v-for="(event,i) in events" :key="event.id || i" class="event-card"><span class="category-tag">{{ event.kind === 'chaos' ? '大翻车' : '口袋奇遇' }}</span><h3>{{ event.title }}</h3><p>{{ event.text }}</p><small>{{ event.gadgetName }}</small></article></div></template>
        <div v-else class="achievement-grid"><article v-for="a in achievements" :key="a.id" :class="{earned:a.unlocked}"><span class="achievement-badge"><UiIcon name="star" :size="35" /></span><h3>{{ a.name || a.title }}</h3><p>{{ a.description }}</p><small>{{ a.unlocked ? '已解锁' : '待解锁' }}</small></article></div>
      </section>

      <section v-else class="inner-page lab-page">
        <div class="page-intro"><span class="eyebrow"><UiIcon name="flask" :size="17" /> 不靠谱创意，认真进行中</span><h1>让脑洞，<span class="highlight-word">碰个头</span></h1><p>挑两件已发现的道具，看看会诞生什么奇妙新朋友。</p></div>
        <div class="fusion-workbench" :class="{fusing}"><div v-for="(slot,i) in [0,1]" :key="slot" class="fusion-slot"><template v-if="selected[i]"><GadgetArt :kind="allGadgets.find(g=>g.id===selected[i])?.kind" :color="allGadgets.find(g=>g.id===selected[i])?.color" /><strong>{{ allGadgets.find(g=>g.id===selected[i])?.name }}</strong><button class="icon-button" @click="selectFusion(selected[i])" :disabled="fusing" aria-label="移除道具"><UiIcon name="close" :size="14" /></button></template><template v-else><UiIcon name="pocket" :size="46" /><span>放入第 {{ i+1 }} 件道具</span></template></div><span class="fusion-plus">+</span><span class="fusion-cloud">✦</span></div>
        <div class="fusion-action"><button class="primary-button" :disabled="selected.length!==2 || fusing || fusionRemaining === 0" @click="fusion"><UiIcon name="flask" :size="20" />{{ fusing ? '奇妙反应正在发生…' : '开始合体' }}<UiIcon name="spark" :size="18" /></button><p>今日剩余 {{ fusionRemaining }} 次实验 · 10% 概率冒出一团小黑烟</p></div>
        <h2 class="small-section-title">从收藏里选两件 <span>{{ unlocked.length }} 件可用</span></h2><div v-if="unlocked.length < 2" class="empty-state compact"><p>先去发现至少两件道具，实验室才能开工哦。</p><button class="text-button" @click="navigate('home')">去口袋找找 <UiIcon name="arrow" :size="18" /></button></div><div class="fusion-selection"><button v-for="g in unlocked" :key="g.id" :class="{selected:selected.includes(g.id)}" @click="selectFusion(g.id)" :disabled="fusing"><GadgetArt :kind="g.kind" :color="g.color" /><strong>{{ g.name }}</strong><span v-if="selected.includes(g.id)" class="selected-check"><UiIcon name="check" :size="15" /></span></button></div>
      </section>
    </main>

    <footer class="site-footer"><div><span class="footer-pocket"><UiIcon name="pocket" :size="19" /></span><span>今天也辛苦啦，愿你保留一点孩子气。</span></div><span class="footer-meta">原创奇妙 · 游客体验版</span><button @click="sound = !sound; clickSound()" :aria-pressed="sound"><UiIcon :name="sound ? 'sound' : 'mute'" :size="16" />声音{{ sound ? '开' : '关' }}</button></footer>
    <Transition name="toast"><div v-if="toast" class="toast-message" role="status"><UiIcon name="spark" :size="18" />{{ toast }}</div></Transition>

    <div v-if="dialog" class="modal-backdrop" @click.self="closeDialog">
      <section class="modal-card" :class="{'gadget-modal':dialog==='gadget' || dialog==='peek'}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button class="icon-button modal-close" @click="closeDialog" :disabled="starting" aria-label="关闭"><UiIcon name="close" :size="21" /></button>
        <template v-if="dialog === 'about'"><span class="section-kicker">WELCOME TO THE CLUB</span><h2 id="modal-title">欢迎光临，奇妙口袋事务所。</h2><p class="about-copy">这里没有完美答案，但总有一件奇妙道具，让你的小烦恼轻一点。</p><ol class="guide-steps"><li><span>01</span><div><strong>说说你的烦恼</strong><p>写下100字以内的小烦恼，口袋会翻找3秒。</p></div></li><li><span>02</span><div><strong>调一调使用力度</strong><p>稳妥一点，或大胆一点。小心道具也会闹乌龙。</p></div></li><li><span>03</span><div><strong>收好今天的小奇妙</strong><p>发现的道具自动收入图鉴，也能做成明信片。</p></div></li></ol><div class="about-note">游客每天有 3 次求助、1 次盲盒、1 次合体和 1 次免费修理。收藏保存在当前浏览器；清除网站数据会清空记录。本版使用原创本地内容库，AI、登录、会员与周边订单尚未接入。</div><button class="primary-button" @click="dialog=null">好啦，去掏口袋 <UiIcon name="arrow" :size="18" /></button></template>
        <template v-else>
          <div class="gadget-topline"><span>NO.{{ String(current.no).replace('NO.', '').padStart(3,'0') }}</span><span>{{ mode === 'fusion' && dialog !== 'peek' ? '脑洞合体 · 全新发现' : current.rarity + ' · ' + current.category }}</span></div>
          <div class="modal-art"><GadgetArt :kind="current.kind" :color="current.color" /><span>✧</span></div>
          <span class="gadget-kicker">{{ dialog==='peek' ? '口袋里的一点奇思妙想' : mode==='blind' ? '你今天的幸运道具' : mode==='fusion' ? '叮！实验成功啦' : '口袋为你找到了' }}</span><h2 id="modal-title">{{ current.name }}</h2>
          <div class="gadget-detail"><p><UiIcon name="check" :size="17" /><span>{{ current.effect }}</span></p><p class="warning"><UiIcon name="info" :size="17" /><span>{{ current.warning }}</span></p></div>
          <template v-if="dialog==='peek'"><button class="primary-button" @click="dialog=null; document.querySelector('textarea')?.focus()">写个烦恼，遇见它 <UiIcon name="arrow" :size="18" /></button></template>
          <template v-else-if="mode==='blind'"><div class="fortune-content"><div><span>宜</span>{{ current.fortune.good }}</div><div><span>忌</span>{{ current.fortune.bad }}</div><p>{{ current.fortune.tip }}</p></div><div class="modal-buttons"><button class="secondary-button" @click="showPoster=true"><UiIcon name="share" :size="17" />好运明信片</button><button class="primary-button" @click="dialog=null">收下今天的好运</button></div><p class="modal-footnote"><UiIcon name="check" :size="13" />已自动收入你的奇妙收藏</p></template>
          <template v-else-if="!result"><div class="strength-control"><div><label for="strength">这次，想用多大力度？</label><strong>{{ typeof tier === 'string' ? tier : tier.label }}</strong></div><input id="strength" type="range" min="0" max="100" v-model.number="strength" :disabled="starting" aria-label="道具使用力度"><div class="strength-labels"><span>稳妥使用</span><span>大胆试试</span><span>作死改装</span></div><p class="odds-note">正常 {{ Math.round(odds.normal*100) }}% · 小乌龙 {{ Math.round(odds.oops*100) }}% · 翻车 {{ Math.round(odds.chaos*100) }}% · 惊喜 {{ Math.round(odds.surprise*100) }}%</p></div><div class="durability-row"><span><UiIcon name="tool" :size="14" />耐久 {{ currentDurability?.remaining ?? currentDurability?.current ?? current.maxDurability }} / {{ current.maxDurability }}</span><button @click="repair" :disabled="starting">免费修理</button></div><button class="primary-button" @click="activate" :disabled="starting || (currentDurability?.broken)"><UiIcon name="spark" :size="19" />{{ starting ? '魔法正在生效…' : '启动道具' }}</button><p class="modal-footnote">{{ starting ? '别紧张，乌龙也是冒险的一部分' : '已收入图鉴 · 作死区消耗 2 点耐久' }}</p></template>
          <template v-else><div v-if="result.event" class="random-event"><UiIcon name="spark" :size="18" /><div><strong>{{ result.event.title || '哎呀，临场小意外！' }}</strong><p>{{ result.event.text || result.event }}</p></div></div><div class="outcome-card" :class="result.kind"><span class="category-tag">{{ result.title }}</span><p>{{ result.text }}</p><span class="outcome-doodle">{{ result.kind === 'surprise' ? '✧' : result.kind === 'chaos' ? '〰' : '☺' }}</span></div><button v-if="result.chain" class="chain-button" @click="continueChain" :disabled="remaining===0">后续来了！再掏个道具补救？ <UiIcon name="arrow" :size="17" /></button><div class="modal-buttons"><button class="secondary-button" @click="dialog=null"><UiIcon name="check" :size="17" />已经收藏</button><button class="primary-button" @click="showPoster=true"><UiIcon name="share" :size="17" />做成明信片</button></div><p class="modal-footnote">一点小乌龙，也能成为今天的好故事。</p></template>
        </template>
      </section>
    </div>
    <SharePoster v-if="showPoster" :gadget="current" :outcome="result" :worry="worry" @close="showPoster=false" />
  </div>
</template>
