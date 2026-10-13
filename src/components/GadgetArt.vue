<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  kind: { type: String, default: 'generic' },
  color: { type: String, default: '#efb85c' },
})
const uid = useId()
const shape = computed(() => ({ hourglass: 'hourglass', lamp: 'lamp', compass: 'compass', camera: 'camera', bottle: 'bottle', tape: 'tape', sprout: 'seed', bell: 'bell', sock: 'sock', balloon: 'balloon', star: 'spark', key: 'key', badge: 'badge' }[props.kind] || props.kind))
</script>

<template>
  <svg class="gadget-art" viewBox="0 0 160 150" fill="none" aria-hidden="true">
    <defs>
      <pattern :id="`${uid}-texture`" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r=".5" fill="#75624C" opacity=".18" />
      </pattern>
      <filter :id="`${uid}-soft`" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="3" /></filter>
    </defs>
    <ellipse cx="80" cy="128" rx="40" ry="5" fill="#9D8A68" opacity=".13" :filter="`url(#${uid}-soft)`" />
    <g stroke="#786A53" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <g v-if="shape === 'clock'">
        <path d="m49 110-5 12m66-12 5 12" stroke-width="4" />
        <path d="M42 37 33 29m85 8 9-8" />
        <path d="M49 37c-10-10-19-8-23 2l-3 9 23 2M111 37c10-10 19-8 23 2l3 9-23 2" :fill="color" />
        <circle cx="80" cy="77" r="43" :fill="color" />
        <circle cx="80" cy="77" r="34" fill="#FFF8E8" />
        <path d="M80 49v4m28 24h-4m-24 24v4M52 77h4m24-18v18l17 10" />
        <circle cx="80" cy="77" r="3" fill="#786A53" />
        <path d="M76 29h8v7h-8Z" fill="#A8C0AB" />
      </g>
      <g v-else-if="shape === 'hourglass'">
        <path d="M48 31h64v10H48Zm0 80h64v10H48Z" :fill="color" />
        <path d="M55 42c0 23 10 31 25 35-15 4-25 12-25 33h50c0-21-10-29-25-33 15-4 25-12 25-35H55Z" fill="#FDF4DC" />
        <path d="M61 55h38c-3 8-11 15-19 18-8-3-16-10-19-18Zm0 50c5-13 15-15 19-21 4 6 14 8 19 21H61Z" :fill="color" stroke="none" opacity=".8" />
        <path d="M80 76v7m-20-36 0 9" stroke="#C7B599" stroke-width="1.2" />
        <path d="M44 31h73m-73 90h73" />
      </g>
      <g v-else-if="shape === 'umbrella'">
        <path d="M80 31v76c0 19 21 20 21 5v-4" stroke-width="3" />
        <path d="M26 75C34 27 122 16 136 75c-8-10-23-10-31 0-10-12-27-12-37 0-11-12-31-12-42 0Z" :fill="color" />
        <path d="M80 34C65 39 65 58 68 75m12-41c16 7 22 24 25 41" stroke-opacity=".5" />
        <path d="m36 90-4 8m93-8-4 8m-64-5-4 8" stroke="#9BAEA0" />
        <path d="m70 49 7 5m-33 6 8-6" stroke="#FFF7DC" stroke-width="3" />
      </g>
      <g v-else-if="shape === 'cloud'">
        <path d="M35 88c-12-5-16-22-7-33 6-9 20-10 30-6 5-25 37-28 49-8 16-4 29 8 29 20 14 14 5 35-14 35H48c-6 0-10-3-13-8Z" :fill="color" />
        <path d="M62 68v4m34-4v4m-22 7c5 5 10 5 14 0" />
        <path d="m53 111-5 9m31-9-5 9m32-9-5 9" stroke="#91ADA1" stroke-width="3" />
        <path d="M40 58c-8 0-12 8-10 15" stroke="#FFF8E3" stroke-width="3" />
      </g>
      <g v-else-if="shape === 'magnet'">
        <path d="M44 39h23v45c0 17 26 17 26 0V39h23v46c0 47-72 47-72 0V39Z" :fill="color" />
        <path d="M44 39h23v19H44Zm49 0h23v19H93Z" fill="#EBEAD5" />
        <path d="m35 30-7-6m45 3 0-9m53 12 7-6m-44 3 0-9" stroke="#B3965F" />
        <path d="M51 72v13c0 10 3 18 10 24" stroke="#FFF3D5" stroke-width="3" />
      </g>
      <g v-else-if="shape === 'radio'">
        <path d="M49 43 111 18" stroke-width="2.5" />
        <path d="M55 46v-8c0-5 5-8 10-8h31c6 0 10 4 10 9v7" />
        <rect x="31" y="45" width="98" height="75" rx="13" :fill="color" />
        <circle cx="66" cy="82" r="25" fill="#EFE5CA" />
        <circle cx="66" cy="82" r="19" :fill="`url(#${uid}-texture)`" stroke="#B8A78C" />
        <circle cx="66" cy="82" r="9" fill="#C5BCA3" />
        <rect x="101" y="59" width="14" height="8" rx="2" fill="#F5EBD4" />
        <circle cx="108" cy="89" r="8" fill="#F4EBD5" />
        <path d="M108 83v5m-7 22h14M43 51h68" stroke-width="1.3" opacity=".65" />
      </g>
      <g v-else-if="shape === 'seed'">
        <path d="M80 77V40" stroke="#759581" stroke-width="3" />
        <path d="M78 60C57 64 41 51 42 33c23-5 41 7 36 27ZM82 46c-4-19 12-33 30-30 2 17-10 31-30 30Z" fill="#A9BDA0" />
        <path d="M48 40 78 59m27-36L84 43" stroke="#7B9479" stroke-width="1.5" />
        <path d="m50 80 7 41h46l7-41H50Z" :fill="color" />
        <path d="M46 76h68v10H46Z" :fill="color" />
        <path d="M61 95v15" stroke="#FFEBCB" stroke-width="3" />
        <path d="m82 96 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" fill="#F8EDCF" stroke-width="1.2" />
      </g>
      <g v-else-if="shape === 'pillow'">
        <path d="M31 48c13-7 73-10 97 1-7 20-7 38 0 60-18 10-76 12-99 0 7-23 6-43 2-61Z" :fill="color" />
        <path d="M39 56c14-5 63-7 80 1-4 15-4 30 0 45-20 7-58 7-81 0 5-13 5-33 1-46Z" stroke="#FFF5D8" stroke-dasharray="3 4" stroke-width="1.5" />
        <path d="m66 66 8 4-8 8h10m11-20 10 4-8 11h12" stroke="#8A957A" />
        <path d="m38 48 9 11m71-8-8 11m-65 38-14 8m79-9 16 9" stroke-opacity=".4" />
      </g>
      <g v-else-if="shape === 'tea'">
        <path d="M112 63h7c30 0 26 39-9 37" :fill="color" />
        <path d="M44 58h72l-6 42c-4 24-57 25-61 0l-5-42Z" :fill="color" />
        <ellipse cx="80" cy="59" rx="36" ry="9" fill="#F6ECD3" />
        <ellipse cx="80" cy="59" rx="28" ry="5" fill="#B89468" stroke="none" />
        <path d="M59 44c-12-11 12-17 0-28m25 25c-11-9 11-16 0-26m19 30c-10-8 7-14 1-22" stroke="#C4B296" stroke-width="1.5" />
        <path d="M40 120c22 9 61 10 82-1" stroke="#ADA184" />
        <path d="M80 60v29h15v17H80V89" stroke-width="1" />
        <path d="M81 91h12v12H81Z" fill="#A7BBA5" stroke-width="1" />
      </g>
      <g v-else-if="shape === 'glasses'">
        <path d="m23 74 12-22m102 22-12-22" stroke-width="3" />
        <circle cx="49" cy="83" r="27" :fill="color" />
        <circle cx="111" cy="83" r="27" :fill="color" />
        <circle cx="49" cy="83" r="20" fill="#F9F0D6" />
        <circle cx="111" cy="83" r="20" fill="#F9F0D6" />
        <path d="M76 80c2-5 6-5 8 0" stroke-width="3" />
        <path d="m38 72 11-4m-13 15 8-3m55-8 11-4m-13 15 8-3" stroke="#A8C5B6" stroke-width="3" />
        <path d="m67 32 3 8m-7-3 8-2m22 9 3-7" stroke="#B89C63" />
      </g>
      <g v-else-if="shape === 'ticket'">
        <path d="m27 48 106-8 4 29c-15 2-14 17 2 19l3 29-106 8-3-30c15-2 14-17-2-19l-4-28Z" :fill="color" />
        <path d="m107 43 6 77" stroke-dasharray="3 4" />
        <path d="m45 59 45-3m-43 46 45-3" opacity=".5" />
        <path d="m68 67 4 9 10 1-7 7 2 10-9-4-9 5 1-10-8-6 11-2 5-10Z" fill="#F7E9C3" stroke-width="1.5" />
        <path d="m121 58 2 24m-1 9 1 11" stroke-width="4" opacity=".4" />
      </g>
      <g v-else-if="shape === 'eraser'">
        <path d="m31 96 37-47h38l24 21-38 49H56L31 96Z" :fill="color" />
        <path d="m54 67 24 22h38l14-19-24-21H68L54 67Z" fill="#F3E9D0" />
        <path d="M78 89v30m-47-23h37l24 23M54 67h39l24 20" opacity=".5" />
        <path d="m37 126 7 1m14-1 5 2m49-2 5-1" stroke="#AF9A79" />
        <path d="m105 30 3 8m-8-3 12-2" stroke="#A1B49A" />
      </g>
      <g v-else-if="shape === 'lamp'">
        <path d="M80 86v32m-25 3h50" stroke-width="4" />
        <path d="m55 36-17 51h84l-17-51H55Z" :fill="color" />
        <ellipse cx="80" cy="36" rx="25" ry="5" fill="#F9EBC9" />
        <path d="M69 43 59 80m32-37 10 37" stroke="#FFF0C7" stroke-width="2" />
        <path d="M104 88v17" stroke-width="1" />
        <circle cx="104" cy="108" r="3" :fill="color" />
        <path d="m31 98-8 3m110-3 8 3" stroke="#C4AB7C" />
      </g>
      <g v-else-if="shape === 'compass'">
        <path d="M73 25v-5c0-9 15-9 15 0v5" />
        <circle cx="80" cy="76" r="47" :fill="color" />
        <circle cx="80" cy="76" r="37" fill="#FCF3DA" />
        <path d="M80 47v5m29 24h-5m-24 24v5M51 76h5" stroke="#A69B80" />
        <path d="m96 52-10 30-22 18 10-30 22-18Z" fill="#A3B7A3" />
        <path d="m96 52-10 30-12-12 22-18Z" fill="#D29673" />
        <circle cx="80" cy="76" r="3" fill="#F6EBD1" />
      </g>
      <g v-else-if="shape === 'camera'">
        <path d="m63 41 5-13h27l6 13" :fill="color" />
        <rect x="28" y="42" width="105" height="72" rx="10" :fill="color" />
        <path d="M31 64h99v28H31Z" fill="#F3E9D1" stroke="none" />
        <circle cx="82" cy="77" r="26" fill="#EAE3CA" />
        <circle cx="82" cy="77" r="18" fill="#A8BCAF" />
        <circle cx="82" cy="77" r="10" fill="#788D80" />
        <path d="m73 71 7-5" stroke="#F3EFDB" stroke-width="3" />
        <path d="M113 53h10v7h-10Z" fill="#FCF5E2" stroke-width="1.2" />
        <path d="M39 36h12v6H39Z" fill="#C2BAA1" />
      </g>
      <g v-else-if="shape === 'bottle'">
        <path d="M64 25h32v13H64Z" fill="#BAA280" />
        <path d="M64 37h32v16c0 6 20 17 20 30v31c0 10-72 10-72 0V83c0-13 20-24 20-30V37Z" fill="#F3EFD5" />
        <path d="M48 92c19-7 37 5 64-3v22c0 11-64 11-64 0V92Z" :fill="color" stroke="none" opacity=".85" />
        <path d="M56 80v20" stroke="white" stroke-width="3" />
        <path d="m80 64 4 8 9 1-6 7 1 9-8-4-8 4 1-9-6-7 9-1 4-8Z" fill="#D9B974" stroke-width="1.3" />
        <path d="m120 50 3 7m-7-3 10-1" stroke="#A3B49B" />
      </g>
      <g v-else-if="shape === 'tape'">
        <rect x="27" y="45" width="107" height="67" rx="9" :fill="color" />
        <path d="M39 54h83v34H39Z" fill="#F4EAD0" />
        <circle cx="56" cy="71" r="10" fill="#B8C4AA" />
        <circle cx="105" cy="71" r="10" fill="#B8C4AA" />
        <path d="M66 71h29m-42-7 6 14m43-14 6 14" />
        <path d="m56 112 8-17h33l8 17" fill="#F3E4BB" />
        <circle cx="68" cy="104" r="2" fill="#786A53" stroke="none" />
        <circle cx="93" cy="104" r="2" fill="#786A53" stroke="none" />
        <path d="M69 31v-9c0-6 7-7 10-4v13m0-7 5 2m21 8v-7c0-5 7-6 10-3v11" stroke="#AB9C78" />
      </g>
      <g v-else-if="shape === 'bell'">
        <path d="M74 36v-8c0-9 14-9 14 0v8" :fill="color" />
        <path d="M48 79c0-56 65-56 65 0 0 16 8 25 14 30H34c7-5 14-14 14-30Z" :fill="color" />
        <path d="M34 110h93v7H34Z" :fill="color" />
        <path d="M68 117c1 15 23 15 25 0" fill="#B69A68" />
        <path d="M57 75c0-16 5-25 14-29" stroke="#FFF1CD" stroke-width="3" />
        <path d="m29 66-9-4m11 25-11 2m112-23 8-5m-10 27 11 2" stroke="#B9A278" />
      </g>
      <g v-else-if="shape === 'sock'">
        <path d="M63 30h45v58c0 10-8 19-20 24l-31 13c-24 10-38-16-19-27l25-15V30Z" :fill="color" />
        <path d="M63 30h45v17H63Z" fill="#EBE6CF" />
        <path d="M74 32v13m11-13v13m11-13v13" stroke="#B8B398" stroke-width="1.3" />
        <path d="M108 83c-23-3-27 19-21 29M40 97c13-4 24 12 18 27" fill="#F2DEC0" />
        <path d="m84 57 3 7 8 1-6 5 1 8-6-4-7 3 2-8-5-5 7-1 3-6Z" fill="#F4E8C7" stroke-width="1.2" />
      </g>
      <g v-else-if="shape === 'balloon'">
        <path d="M80 94c-12 18 17 20 4 36" stroke="#A59472" stroke-width="1.5" />
        <path d="M79 89c-22-7-38-23-36-44 2-20 22-31 40-29 21 2 34 15 33 35-1 19-17 33-32 38l5 8H74l5-8Z" :fill="color" />
        <path d="M57 39c3-8 10-13 19-14" stroke="#FFF6D7" stroke-width="4" />
        <path d="m74 49 7 7 7-7" stroke="#8D815F" />
        <path d="m28 49 3 7m-7-3 10-1m96 28 3-5" stroke="#ABAE8B" />
      </g>
      <g v-else-if="shape === 'key'">
        <circle cx="65" cy="50" r="25" :fill="color" />
        <circle cx="65" cy="50" r="12" fill="#FCF4DD" />
        <path d="m62 75 2 53h13v-13h13v-12H77V76" :fill="color" />
        <path d="M48 38c-3 3-5 7-5 11" stroke="#FFF0CE" stroke-width="3" />
        <path d="m114 50 3 10m-8-4 13-2m-91 39 5 3" stroke="#A7B499" />
      </g>
      <g v-else-if="shape === 'badge'">
        <path d="m59 86-8 46 27-16 18 15 3-47" fill="#ABC1A9" />
        <path d="m82 22 10 6 11 0 6 10 10 6-1 12 5 10-7 9-3 11-12 3-8 7-11-4-12 2-7-9-11-5-1-12-6-9 5-11 2-11 12-4 8-8 10 2Z" :fill="color" />
        <circle cx="81" cy="59" r="25" fill="#F9EBC8" />
        <path d="m81 43 5 10 11 2-8 8 1 11-10-5-10 5 2-11-8-8 11-1 6-11Z" :fill="color" stroke-width="1.4" />
      </g>
      <g v-else-if="shape === 'spark'">
        <path d="m80 27 13 28 31 5-22 23 4 33-27-15-29 14 6-32-22-25 32-3 14-28Z" :fill="color" />
        <path d="M74 61v4m16-4v4m-17 10c5 5 11 5 16 0" stroke-width="2.5" />
        <path d="m36 24 4 10m-9-4 12-2m80 83 3 9m-8-4 12-2" stroke="#A9B49A" />
        <path d="m71 36 5 5-7 14" stroke="#FFF0CF" stroke-width="3" />
      </g>
      <g v-else>
        <path d="m49 55 14-16 36 2 14 19-5 58H51l-2-63Z" :fill="color" />
        <path d="M59 40v-9h40v12" fill="#E9E3CA" />
        <path d="M49 64h64" />
        <circle cx="80" cy="88" r="17" fill="#F5EACB" />
        <path d="m80 75 3 8 8 2-6 5 1 8-7-4-7 4 2-8-6-6 9-1 3-8Z" fill="#A8BEA8" stroke-width="1.2" />
        <path d="M57 74v24m42 9-1 5" stroke="#FFF0D1" stroke-width="3" />
      </g>
    </g>
    <g stroke="#B8A680" stroke-width="1.4" stroke-linecap="round" opacity=".65">
      <path d="m132 30 1 6m-4-3 7-1m-109 76 1 5m-4-2 7-1" />
      <circle cx="119" cy="127" r="1.5" fill="#B8A680" stroke="none" />
    </g>
  </svg>
</template>

<style scoped>
.gadget-art { display: block; width: 120px; max-width: 100%; height: auto; margin: auto; overflow: visible; }
</style>
