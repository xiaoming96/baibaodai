<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps({
  user: { type: Object, default: null },
  state: { type: Object, default: () => ({}) },
  config: { type: Object, default: () => ({ capabilities: {} }) },
  syncing: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['request-code', 'verify', 'wechat-login', 'logout', 'sync', 'export-data', 'import-data', 'preferences'])
const phone = ref('')
const code = ref('')
const phoneTouched = ref(false)
const codeTouched = ref(false)
const localError = ref('')
const backupMessage = ref('')
const fileInput = ref(null)
const retrySeconds = ref(0)
let retryTimer = null

const backendConnected = computed(() => props.config.backendConnected !== false)
const canPhoneLogin = computed(() => backendConnected.value && !!props.config.capabilities?.phoneLogin)
const canWechatLogin = computed(() => backendConnected.value && !!props.config.capabilities?.wechatLogin)
const normalizedPhone = computed(() => {
  const value = phone.value.trim().replace(/[\s()\-]/g, '')
  if (/^1[3-9]\d{9}$/.test(value)) return '+86' + value
  if (value.startsWith('+86')) return /^\+861[3-9]\d{9}$/.test(value) ? value : ''
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : ''
})
const validCode = computed(() => /^\d{6}$/.test(code.value))
const nickname = computed(() => props.user?.nickname || props.user?.name || '口袋收藏家')
const maskedPhone = computed(() => {
  const supplied = props.user?.maskedPhone || props.user?.phoneMasked
  if (supplied) return supplied
  const value = String(props.user?.phone || '').replace(/[\s()\-]/g, '')
  if (!value) return '微信账户'
  if (/[*•]/.test(value)) return value
  if (/^(?:\+86)?1[3-9]\d{9}$/.test(value)) {
    const mobile = value.replace(/^\+86/, '')
    return '+86 ' + mobile.slice(0, 3) + ' •••• ' + mobile.slice(-4)
  }
  return '•••• •••• ' + value.slice(-4)
})
const membership = computed(() => props.user?.membership || {})
const membershipExpiry = computed(() => membership.value.expiresAt || props.user?.memberUntil || props.user?.memberExpiresAt || props.user?.membershipExpiresAt || '')
const isMember = computed(() => {
  const expiry = membershipExpiry.value ? new Date(membershipExpiry.value).getTime() : null
  const active = props.user?.role ? props.user.role === 'member' : (membership.value.active ?? props.user?.isMember ?? props.user?.member ?? false)
  return !!active && (expiry === null || (Number.isFinite(expiry) && expiry > Date.now()))
})
const expiryLabel = computed(() => {
  if (!membershipExpiry.value) return ''
  const value = new Date(membershipExpiry.value)
  return Number.isNaN(value.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(value)
})
const collectionCount = computed(() => props.state.collected?.length || 0)
const eventCount = computed(() => props.state.eventRecords?.length || 0)
const lastSync = computed(() => {
  const value = props.state.lastSyncedAt || props.user?.lastSyncedAt
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(date)
})

function resetRetry() {
  clearInterval(retryTimer)
  retryTimer = null
  retrySeconds.value = 0
}

function requestCode() {
  phoneTouched.value = true
  localError.value = ''
  if (!canPhoneLogin.value || props.syncing || retrySeconds.value) return
  if (!normalizedPhone.value) {
    localError.value = '请输入有效手机号；其他地区请带上国家区号，例如 +65。'
    return
  }
  const retryAt = Date.now() + 60000
  retrySeconds.value = 60
  retryTimer = setInterval(() => {
    retrySeconds.value = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
    if (!retrySeconds.value) resetRetry()
  }, 500)
  emit('request-code', { phone: normalizedPhone.value })
}

function verify() {
  phoneTouched.value = true
  codeTouched.value = true
  localError.value = ''
  if (!canPhoneLogin.value || props.syncing) return
  if (!normalizedPhone.value) {
    localError.value = '请先填写有效的手机号。'
    return
  }
  if (!validCode.value) {
    localError.value = '请输入短信中的 6 位数字验证码。'
    return
  }
  emit('verify', { phone: normalizedPhone.value, code: code.value })
}

function onCodeInput(event) {
  code.value = event.target.value.replace(/\D/g, '').slice(0, 6)
  event.target.value = code.value
  localError.value = ''
}

function chooseBackup() {
  backupMessage.value = ''
  fileInput.value?.click()
}

function importBackup(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/\.json$/i.test(file.name)) {
    backupMessage.value = '请选择从口袋导出的 JSON 备份文件。'
    return
  }
  if (file.size > 1024 * 1024) {
    backupMessage.value = '这份备份超过 1 MB，请选择较小的口袋备份。'
    return
  }
  if (!file.size) {
    backupMessage.value = '这份文件是空的，请重新选择备份。'
    return
  }
  emit('import-data', file)
}

watch(() => props.error, value => {
  if (value) resetRetry()
})
watch(() => props.user, value => {
  if (value) {
    code.value = ''
    localError.value = ''
    resetRetry()
  }
})
onBeforeUnmount(resetRetry)
</script>

<template>
  <section class="account-center" aria-labelledby="account-title">
    <header class="account-intro">
      <div><span class="account-eyebrow"><UiIcon name="heart" :size="16" /> 小小奇妙，好好收着</span><h1 id="account-title">给你的收藏，<span>留个位置</span>。</h1><p>换一台设备，童心也可以跟着你。</p></div>
      <span class="account-mode"><i />{{ user ? '我的口袋账户' : '游客收藏' }}</span>
    </header>

    <p v-if="!backendConnected" class="local-mode-note" role="status"><UiIcon name="pocket" :size="19" />当前为游客模式，收藏保存在这台设备。云端账户暂未开放。</p>
    <p v-if="error || localError" class="account-error" role="alert"><UiIcon name="info" :size="17" />{{ localError || error }}</p>

    <div class="account-grid">
      <article class="account-card">
        <template v-if="user">
          <div class="account-identity"><span class="identity-avatar"><UiIcon name="pocket" :size="36" /><i>✦</i></span><div><span class="account-kicker">WELCOME BACK, POCKET FRIEND</span><h2>{{ nickname }}</h2><p>{{ maskedPhone }}</p></div></div>
          <div class="identity-stats"><div><b>{{ collectionCount }}</b><span>道具已收藏</span></div><div><b>{{ eventCount }}</b><span>乌龙与奇遇</span></div><div><UiIcon :name="isMember ? 'star' : 'heart'" :size="23" /><span>{{ isMember ? '月卡会员' : '注册收藏家' }}</span></div></div>
          <div class="membership-strip" :class="{ active: isMember }"><UiIcon :name="isMember ? 'star' : 'gift'" :size="19" /><div><strong>{{ isMember ? '月卡魔法，正在生效' : '每一天，都有一点新奇妙' }}</strong><p v-if="isMember && expiryLabel">有效期至 {{ expiryLabel }}</p><p v-else-if="!isMember && expiryLabel">月卡已于 {{ expiryLabel }} 到期</p><p v-else>注册账户每日可求助 5 次、掏盲盒 2 次、合体 2 次。</p></div></div>
          <button class="account-primary" type="button" :disabled="syncing || !backendConnected" @click="emit('sync')"><UiIcon name="shuffle" :size="18" />{{ syncing ? '正在同步收藏…' : '同步我的云端收藏' }}</button>
          <p class="account-small sync-note">{{ lastSync ? `上次同步：${lastSync}` : '同步后，你的收藏可以在其他设备继续打开。' }}</p>
          <div class="logout-row"><p>退出会回到这台设备的游客口袋，云端收藏仍留在账户里。</p><button type="button" :disabled="syncing" @click="emit('logout')">退出登录</button></div>
        </template>

        <template v-else>
          <div class="login-heading"><span class="login-pocket"><UiIcon name="pocket" :size="30" /></span><div><span class="account-kicker">A PLACE FOR YOUR LITTLE MAGIC</span><h2>把口袋，随身带着</h2></div></div>
          <p class="login-description">登录后收藏可同步到云端，这台设备里发现的小奇妙也能一起带上。</p>
          <form class="login-form" @submit.prevent="verify" novalidate>
            <label for="account-phone">手机号码</label>
            <input id="account-phone" v-model="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" placeholder="请输入手机号" :disabled="!canPhoneLogin || syncing" :aria-invalid="phoneTouched && !!phone && !normalizedPhone" aria-describedby="account-phone-help" @blur="phoneTouched = true" @input="localError = ''" />
            <p id="account-phone-help" class="account-small">中国大陆手机号可直接填写，其他地区请使用 +国家区号。</p>
            <label for="account-code">短信验证码</label>
            <div class="code-row"><input id="account-code" :value="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字验证码" :disabled="!canPhoneLogin || syncing" :aria-invalid="codeTouched && !validCode" aria-describedby="account-code-help" @input="onCodeInput" @blur="codeTouched = true" /><button type="button" :disabled="!canPhoneLogin || !normalizedPhone || syncing || retrySeconds > 0" @click="requestCode">{{ retrySeconds ? `${retrySeconds} 秒后重试` : '获取验证码' }}</button></div>
            <p id="account-code-help" class="account-small">验证码会通过短信发送到你填写的手机号。</p>
            <button class="account-primary" type="submit" :disabled="!canPhoneLogin || syncing || !normalizedPhone || !validCode"><UiIcon name="pocket" :size="18" />{{ syncing ? '正在处理…' : canPhoneLogin ? '登录，把奇妙带走' : '手机号登录暂未开放' }}</button>
          </form>
          <div class="login-divider"><span>也可以</span></div>
          <button class="wechat-button" type="button" :disabled="!canWechatLogin || syncing" @click="emit('wechat-login')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 5.2C12.2 3.6 9.9 3 7.8 3 4.1 3 1 5.5 1 8.6c0 1.8 1 3.4 2.7 4.4L3 15.5l2.9-1.4c.6.2 1.2.2 1.9.2h.6M23 13.5c0-2.9-3-5.2-6.6-5.2s-6.6 2.3-6.6 5.2 3 5.2 6.6 5.2c.6 0 1.2-.1 1.8-.2l2.8 1.2-.6-2.3c1.6-.9 2.6-2.3 2.6-3.9Z"/><circle cx="5.5" cy="7.8" r=".6"/><circle cx="9.8" cy="7.8" r=".6"/><circle cx="14.1" cy="12.8" r=".6"/><circle cx="18.5" cy="12.8" r=".6"/></svg>{{ canWechatLogin ? '微信登录' : '微信登录暂未开放' }}</button>
          <p class="account-small guest-reminder">不登录，也可以继续体验。游客收藏保存在当前浏览器。</p>
        </template>
      </article>

      <aside class="account-side">
        <article class="benefit-card"><span class="account-kicker">MORE LITTLE ADVENTURES</span><h2>多一点机会，<br />遇见小惊喜。</h2><div class="benefit-list"><div><span class="benefit-icon"><UiIcon name="pocket" :size="21" /></span><p><strong>每日 5 次烦恼求助</strong><span>给忙碌的日子，多几个轻松出口。</span></p><b>5</b></div><div><span class="benefit-icon"><UiIcon name="gift" :size="21" /></span><p><strong>每日 2 次好运盲盒</strong><span>没什么烦恼，也能来掏一份好运。</span></p><b>2</b></div><div><span class="benefit-icon"><UiIcon name="flask" :size="21" /></span><p><strong>每日 2 次合体实验</strong><span>认真碰一碰，不靠谱的小脑洞。</span></p><b>2</b></div><div><span class="benefit-icon"><UiIcon name="book" :size="21" /></span><p><strong>收藏跟着你走</strong><span>登录后同步云端，换设备接着收藏。</span></p><UiIcon name="check" :size="19" /></div></div><p class="benefit-footnote">以上为注册账户权益 · 游客也能随开随玩</p></article>
        <article class="backup-card"><span class="backup-heading"><UiIcon name="book" :size="20" /><h2>给收藏留一份备份</h2></span><p>把这台设备里的小奇遇装进行李，下次再打开时，快乐也不会丢。</p><div class="backup-buttons"><button type="button" @click="emit('export-data')"><UiIcon name="share" :size="16" />导出收藏</button><button type="button" :disabled="syncing" @click="chooseBackup"><UiIcon name="book" :size="16" />导入备份</button></div><input ref="fileInput" class="backup-file" type="file" accept=".json,application/json" aria-label="选择 JSON 收藏备份" tabindex="-1" @change="importBackup" /><p class="account-small">JSON 文件 · 最大 1 MB · 游客也可使用</p><p v-if="backupMessage" class="backup-status" role="status">{{ backupMessage }}</p></article>
        <div class="privacy-choice"><label><input type="checkbox" :checked="state.settings?.analyticsConsent === true" @change="emit('preferences', { analyticsConsent: $event.target.checked })" /><span>允许匿名玩法统计</span></label><p>只统计匿名的玩法次数与分享次数，不记录你写下的烦恼。随时可以关闭。</p></div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.account-center { padding: 48px 0 56px; color: #3f4439; }
.account-intro { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 30px; }.account-eyebrow { display: flex; align-items: center; gap: 7px; color: #7a826b; font-size: 11px; letter-spacing: 1px; }.account-eyebrow svg { color: #b38f48; }.account-intro h1 { font-size: 37px; line-height: 1.5; letter-spacing: 1px; margin: 12px 0 10px; font-weight: 750; }.account-intro h1 span { position: relative; white-space: nowrap; }.account-intro h1 span::after { content: ''; position: absolute; z-index: -1; height: 9px; background: #eed195; left: 0; right: 0; bottom: 5px; border-radius: 35% 28% 38% 21%; transform: rotate(-2deg); }.account-intro h1 span { isolation: isolate; }.account-intro > div > p { color: #8b8e7e; font-size: 12px; line-height: 1.9; }.account-mode { display: flex; align-items: center; gap: 7px; white-space: nowrap; border: 1px solid #d8dfd0; background: #edf1e7; color: #738067; font-size: 11px; padding: 9px 13px; border-radius: 20px; }.account-mode i { width: 5px; height: 5px; background: #899b76; border-radius: 50%; }
.local-mode-note, .account-error { display: flex; align-items: flex-start; gap: 9px; padding: 13px 17px; border-radius: 9px; border: 1px solid #ded9c8; background: #f0eddf; font-size: 12px; line-height: 1.8; margin: 0 0 20px; color: #7f7f67; }.local-mode-note svg, .account-error svg { flex-shrink: 0; margin-top: 2px; }.account-error { background: #f8eadd; border-color: #e8ceb5; color: #9b6849; }
.account-grid { display: grid; grid-template-columns: 1.1fr 1fr; align-items: start; gap: 26px; }.account-card { padding: 32px 34px 29px; background: #fffcf5; border: 1px solid #dfddd0; border-radius: 16px; box-shadow: 0 5px 0 -3px #e7e4d7; }.account-kicker { display: block; color: #9c9a85; font-size: 8px; letter-spacing: 1.8px; line-height: 1.8; }.login-heading { display: flex; align-items: center; gap: 15px; }.login-pocket { display: grid; place-items: center; color: #88723e; width: 52px; height: 52px; background: #f4e5bc; border: 1px solid #dbca96; border-radius: 16px; transform: rotate(-4deg); flex-shrink: 0; }.login-heading h2 { font-size: 24px; margin-top: 5px; font-weight: 700; letter-spacing: 1px; }.login-description { margin: 21px 0 25px; color: #898b79; font-size: 12px; line-height: 2; }
.login-form label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 9px; }.login-form input { width: 100%; min-width: 0; height: 45px; border: 1px solid #dfddce; background: #faf8ef; border-radius: 8px; color: #4d5647; font-size: 13px; padding: 10px 12px; }.login-form input::placeholder { color: #aaa895; font-size: 12px; }.login-form input:disabled { opacity: .65; }.login-form input[aria-invalid=true] { border-color: #c28b63; }.account-small { color: #999987; font-size: 10px; line-height: 1.9; }.login-form > .account-small { margin: 7px 0 20px; }.code-row { display: flex; gap: 9px; }.code-row input { flex: 1; }.code-row button { flex-shrink: 0; width: 110px; font-size: 11px; color: #8a723c; background: #f4ead0; border: 1px solid #e2d3a9; border-radius: 8px; padding: 10px 8px; }
.account-primary { display: flex; justify-content: center; align-items: center; gap: 9px; width: 100%; min-height: 45px; border: 1px solid #d4a344; border-radius: 9px; background: #e8b653; color: #574827; padding: 11px 14px; font-size: 13px; font-weight: 600; box-shadow: 0 3px 0 #ca9f4622; }.account-primary:hover:not(:disabled) { background: #edc169; }.login-divider { display: flex; align-items: center; gap: 11px; font-size: 10px; color: #ada992; margin: 22px 0 17px; }.login-divider::before, .login-divider::after { content: ''; flex: 1; border-top: 1px solid #e5e0d1; }.wechat-button { display: flex; justify-content: center; align-items: center; gap: 9px; width: 100%; min-height: 42px; color: #6d8060; background: #f0f2e9; border: 1px solid #d9dfcf; border-radius: 8px; padding: 10px 14px; font-size: 12px; }.wechat-button svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }.guest-reminder { text-align: center; margin-top: 17px; }
.account-side { display: flex; flex-direction: column; gap: 21px; }.benefit-card { background: #ecefdf; border: 1px solid #dce1cc; border-radius: 16px; padding: 28px 30px 22px; }.benefit-card h2 { font-size: 25px; font-weight: 650; line-height: 1.7; margin-top: 9px; }.benefit-list { display: grid; gap: 21px; margin-top: 22px; }.benefit-list > div { display: flex; gap: 12px; align-items: center; }.benefit-icon { display: grid; place-items: center; width: 37px; height: 37px; flex-shrink: 0; border: 1px solid #d4dbc0; border-radius: 10px; background: #f5f5e9; color: #8b9572; }.benefit-list p { display: flex; flex: 1; flex-direction: column; gap: 5px; }.benefit-list strong { font-size: 12px; font-weight: 650; }.benefit-list p span { color: #939780; font-size: 10px; line-height: 1.7; }.benefit-list b { font-family: Georgia, serif; font-size: 25px; font-weight: 400; color: #9eaa83; }.benefit-list > div > svg { color: #9eaa83; margin-right: 1px; }.benefit-footnote { font-size: 9px; color: #a1a58e; border-top: 1px dashed #d3dac0; padding-top: 15px; margin-top: 23px; }
.backup-card { padding: 23px 27px; border: 1px solid #e0dccb; background: #faf6e9; border-radius: 13px; }.backup-heading { display: flex; align-items: center; gap: 8px; color: #807552; }.backup-heading h2 { font-size: 14px; font-weight: 650; }.backup-card > p:not(.account-small):not(.backup-status) { color: #95927c; font-size: 11px; line-height: 1.9; margin: 12px 0 17px; }.backup-buttons { display: flex; gap: 9px; margin-bottom: 9px; }.backup-buttons button { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 12px; border: 1px solid #d9d6c2; border-radius: 7px; flex: 1; font-size: 11px; color: #807a5e; background: #fffaf0; }.backup-file { display: none; }.backup-status { color: #a06c46; font-size: 11px; line-height: 1.8; margin-top: 11px; }
.privacy-choice { padding: 0 5px; }.privacy-choice label { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #7f826c; cursor: pointer; }.privacy-choice input { margin: 0; width: 15px; height: 15px; accent-color: #7b8d65; flex-shrink: 0; }.privacy-choice p { margin: 8px 0 0 23px; font-size: 10px; line-height: 1.9; color: #a1a08b; }
.account-identity { display: flex; align-items: center; gap: 17px; }.identity-avatar { position: relative; display: grid; place-items: center; width: 69px; height: 69px; flex-shrink: 0; background: #f0ddb0; color: #8c733f; border: 1px solid #d9c58f; border-radius: 21px; transform: rotate(-4deg); }.identity-avatar i { position: absolute; font-style: normal; top: -9px; right: -5px; color: #c6a14e; font-size: 20px; }.account-identity h2 { font-size: 25px; margin: 5px 0 7px; font-weight: 700; overflow-wrap: anywhere; }.account-identity p { font-size: 11px; color: #999a84; }.identity-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin: 27px 0; padding: 20px 0; border-top: 1px dashed #dedbc9; border-bottom: 1px dashed #dedbc9; }.identity-stats > div { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9px; border-right: 1px solid #e8e4d4; }.identity-stats > div:last-child { border-right: 0; }.identity-stats b { font-size: 25px; font-weight: 600; color: #687b5c; line-height: 1; }.identity-stats svg { color: #b69a52; }.identity-stats span { color: #96977f; font-size: 10px; }.membership-strip { display: flex; align-items: center; gap: 11px; padding: 14px 15px; border: 1px solid #e4deca; background: #f6f1e0; border-radius: 9px; margin-bottom: 23px; }.membership-strip svg { color: #b29448; flex-shrink: 0; }.membership-strip strong { display: block; font-size: 12px; font-weight: 600; color: #877848; }.membership-strip p { color: #a0936e; font-size: 10px; line-height: 1.8; margin-top: 5px; }.membership-strip.active { background: #f7eac0; border-color: #e1cd8b; }.sync-note { margin-top: 11px; text-align: center; }.logout-row { display: flex; gap: 20px; align-items: center; border-top: 1px solid #e7e2d2; padding-top: 22px; margin-top: 23px; }.logout-row p { flex: 1; font-size: 10px; color: #a09d87; line-height: 1.8; }.logout-row button { font-size: 11px; color: #8a8065; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
button:focus-visible, input:focus-visible { outline: 3px solid #7a946c; outline-offset: 3px; }button:disabled { cursor: not-allowed; opacity: .55; }button:active:not(:disabled) { transform: translateY(2px); }
@media (max-width: 850px) { .account-grid { gap: 18px; grid-template-columns: 1.1fr 1fr; }.account-card { padding: 26px 24px; }.benefit-card { padding: 25px 23px 20px; }.backup-card { padding: 21px 23px; }.account-intro h1 { font-size: 30px; }.account-mode { font-size: 10px; padding: 8px 10px; }.login-heading h2 { font-size: 21px; }.account-kicker { font-size: 7px; letter-spacing: 1px; }.benefit-card h2 { font-size: 23px; } }
@media (max-width: 650px) { .account-center { padding: 32px 0 36px; }.account-intro { align-items: flex-start; margin-bottom: 23px; gap: 12px; }.account-eyebrow { font-size: 10px; }.account-intro h1 { font-size: 27px; max-width: 310px; margin-top: 11px; }.account-intro > div > p { font-size: 11px; }.account-mode { display: none; }.account-grid { grid-template-columns: 1fr; gap: 21px; }.account-card { padding: 25px 23px; border-radius: 13px; }.login-heading h2 { font-size: 22px; }.login-description { margin: 18px 0 22px; font-size: 11px; }.account-side { gap: 18px; }.benefit-card { border-radius: 13px; padding: 24px; }.benefit-card h2 { font-size: 22px; }.benefit-card h2 br { display: none; }.benefit-list { gap: 19px; }.benefit-list strong { font-size: 12px; }.benefit-list p span { font-size: 10px; }.local-mode-note, .account-error { font-size: 11px; padding: 12px 13px; gap: 7px; }.identity-avatar { width: 59px; height: 59px; border-radius: 18px; }.account-identity h2 { font-size: 23px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
