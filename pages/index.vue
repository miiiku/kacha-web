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
    'https://kacha.sukoshi.xyz/temp/2.webp',
    'https://kacha.sukoshi.xyz/temp/3.webp',
    'https://kacha.sukoshi.xyz/temp/4.webp',
    'https://kacha.sukoshi.xyz/temp/5.webp',
    'https://kacha.sukoshi.xyz/temp/6.webp',
    'https://kacha.sukoshi.xyz/temp/7.webp',
    'https://kacha.sukoshi.xyz/temp/8.webp',
    'https://kacha.sukoshi.xyz/temp/9.webp',
    'https://kacha.sukoshi.xyz/temp/10.webp',
    'https://kacha.sukoshi.xyz/temp/11.webp',
    'https://kacha.sukoshi.xyz/temp/12.webp',
    'https://kacha.sukoshi.xyz/temp/13.webp',
    'https://kacha.sukoshi.xyz/temp/14.webp',
    'https://kacha.sukoshi.xyz/temp/15.webp',
    'https://kacha.sukoshi.xyz/temp/16.webp',
    'https://kacha.sukoshi.xyz/temp/17.webp',
  ]);
})
</script>