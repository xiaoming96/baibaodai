<script setup>
defineProps({ name: { type: String, default: 'star' }, size: { type: [Number, String], default: 20 } })
const paths = {
  star: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  shuffle: 'm16 3 4 4-4 4M4 17h3c4 0 6-10 10-10h3M4 7h3c1.6 0 2.9 1.6 4 3.5m2 3c1 1.8 2.3 3.5 4 3.5h3m-4-4 4 4-4 4',
  book: 'M12 6c-3-3-7-3-9-2v15c3-1 6-1 9 1m0-14c3-3 7-3 9-2v15c-3-1-6-1-9 1V6',
  spark: 'm12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  flask: 'M9 3h6m-5 0v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10m-7 2h.01m4 2h.01',
  pocket: 'M3 7h18v5c0 11-18 11-18 0V7Zm3 4h12m-12 3c1 5 11 5 12 0M12 2v3m-2-1h4',
  heart: 'M20.8 4.6c-2.4-2.5-6.5-1.5-8.8 1.2-2.3-2.7-6.4-3.7-8.8-1.2-2.4 2.5-1.3 6.8 1.2 9.3L12 21l7.6-7.1c2.5-2.5 3.6-6.8 1.2-9.3Z',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4 10-10',
  share: 'M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2',
  sound: 'M3 9h4l5-5v16l-5-5H3V9m13-2c3 3 3 7 0 10m3-13c5 5 5 11 0 16',
  mute: 'M3 9h4l5-5v16l-5-5H3V9m13 0 6 6m-6 0 6-6',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  tool: 'm14 6-4 4 4 4 4-4c1 5-4 8-7 6l-6 6-3-3 6-6c-2-3 1-8 6-7Z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5V10m7 4v4',
  gift: 'M3 8h18v5H3V8m2 5v8h14v-8M12 8v13m0-13C2 8 6-3 12 8c6-11 10 0 0 0',
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.star" /></svg></template>
