<template>
  <div class="flex flex-nowrap gap-5 py-5">
    <div v-for="(img, idx) in imgs" :key="idx" class="w-1/5 flex-shrink-0">
      <img :src="img" class="block w-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
  const imgs = [
    'https://kacha.sukoshi.xyz/temp/1.webp',
    'https://kacha.sukoshi.xyz/temp/2.webp',
    'https://kacha.sukoshi.xyz/temp/3.webp',
    'https://kacha.sukoshi.xyz/temp/4.webp',
    'https://kacha.sukoshi.xyz/temp/5.webp',
  ]
</script>