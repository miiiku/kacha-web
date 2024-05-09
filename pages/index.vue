<template>
  <div>
    <canvas id="photos-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { createVertexShaderBuffer, wgslShader } from '@/constant/photo';

class PhotosCanvas {
  constructor(selectors: string) {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported');
    }

    const canvas = document.querySelector(selectors) as HTMLCanvasElement;

    if (canvas === null) {
      throw new Error('Canvas not found');
    }

    const context = canvas.getContext('webgpu') as GPUCanvasContext;

    if (context === null) {
      throw new Error('WebGPU context not found');
    }

    this.canvas = canvas;
    this.context = context;

    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.gap = 12;
    this.col = 4;
    this.photos = [];

    this.resize();
    this.run();

    window.addEventListener('resize', () => this.resize());
  }

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  cw: number;
  ch: number;
  gap: number;
  col: number;

  device: GPUDevice | undefined;
  format: GPUTextureFormat | undefined;
  pipeline: GPURenderPipeline | undefined;
  renderPassDescriptor: GPURenderPassDescriptor | undefined;

  photos: { img: ImageBitmap, rate: number, size: [number, number], vertex: [number, number] }[];

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.cw = vw;
    this.ch = vh;
    this.canvas.width = vw;
    this.canvas.height = vh;
    this.calcPhotoRenderSize();
    this.render();
  }

  async run() {
    const { device, format, renderPassDescriptor } = await this.initGPU();
    const { pipeline, vertex, fragment } = await this.initPipeline(device, format);
    this.draw(device, pipeline, renderPassDescriptor, vertex, fragment);
  }

  async initGPU() {
    const adapter = await navigator.gpu.requestAdapter();

    if (adapter === null) {
      throw new Error('WebGPU adapter not found');
    }

    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({ device, format, alphaMode: 'opaque' });

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: [0.0, 0.0, 0.0, 1.0],
        loadOp: 'clear',
        storeOp: 'store',
      }]
    };
    
    this.device = device;
    this.format = format;
    this.renderPassDescriptor = renderPassDescriptor;

    return { adapter, device, format, renderPassDescriptor }
  }

  async initPipeline(device: GPUDevice, format: GPUTextureFormat) {

    const triangleShader = device.createShaderModule({ code: wgslShader });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: triangleShader,
        entryPoint: 'vertex_main',
        buffers: [{
          arrayStride: 3 * 4,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          }],
        }],
      },
      fragment: {
        module: triangleShader,
        entryPoint: 'frag_main',
        targets: [{ format }]
      },
      primitive: {
        topology: 'triangle-list',
        // cullMode: 'front',
      }
    });

    const { buffer: vertexBuffer, count: vertexCount } = createVertexShaderBuffer(device);

    const vertex = {
      buffer: vertexBuffer,
      count: vertexCount,
    }

    return { pipeline, vertex }
  }

  draw(device: GPUDevice, pipeline: GPURenderPipeline, renderPassDescriptor: GPURenderPassDescriptor, vertex: any) {
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(pipeline);
    renderPass.setVertexBuffer(0, vertex.buffer);
    renderPass.draw(vertex.count);
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  calcPhotoRenderSize() {
    if (this.photos.length > 0) {
      const colW = this.cw / (this.col + 1);
      this.photos.forEach(photo => {
        const colH = colW / photo.rate;
        photo.size = [colW, colH]
        photo.vertex = [colW / this.cw, colH / this.ch]
      });

      console.log(this.photos)
    }
  }

  loadPhotos(photos: string[]) {
    let count = photos.length - 1;
    photos.forEach(async photo => {
      const blob = await fetch(photos[0]).then(res => res.blob());
      const img = await createImageBitmap(blob);

      this.photos.push({
        img,
        rate: img.width / img.height,
        size: [img.width, img.height],
        vertex: [0, 0]
      });

      if (--count === 0) {
        this.resize();
      }
    });
  }

  render() {

  }
}


onMounted(() => {
  const p = new PhotosCanvas('#photos-canvas');
  p.loadPhotos([
    'https://kacha.sukoshi.xyz/temp/1.webp',
    'https://kacha.sukoshi.xyz/temp/2.webp',
    'https://kacha.sukoshi.xyz/temp/3.webp',
    'https://kacha.sukoshi.xyz/temp/4.webp',
    'https://kacha.sukoshi.xyz/temp/5.webp',
  ]);
})
</script>