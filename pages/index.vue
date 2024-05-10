<template>
  <div>
    <canvas id="photos-canvas" class="w-screen h-screen"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { InfiniteScrollingPhotos } from '@/utils/core';

onMounted(() => {
  const p = new InfiniteScrollingPhotos('#photos-canvas');
  p.loadPhotos([
    'https://kacha.sukoshi.xyz/temp/1.webp',
    // 'https://kacha.sukoshi.xyz/temp/2.webp',
    // 'https://kacha.sukoshi.xyz/temp/3.webp',
    // 'https://kacha.sukoshi.xyz/temp/4.webp',
    // 'https://kacha.sukoshi.xyz/temp/5.webp',
  ]);
})
</script>