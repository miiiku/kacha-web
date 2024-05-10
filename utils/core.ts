import { wgslShader } from '@/constant/photo';
import { mat4, vec3 } from 'gl-matrix';

class InfiniteScrollingPhotos {
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
    this.gap = 20;
    this.col = 4;
    this.vertexGap = [20 / window.innerWidth, 20 / window.innerHeight];
    this.photos = [];
    
    this.resize();

    window.addEventListener('resize', () => this.resize());
  }

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  adapter: GPUAdapter | undefined;
  device: GPUDevice | undefined;
  textureFormat: GPUTextureFormat | undefined;
  pipeline: GPURenderPipeline | undefined;
  vertexData: any;

  cw: number;
  ch: number;
  gap: number;
  col: number;
  vertexGap: [number, number];

  photos: { img: ImageBitmap, rate: number, size: [number, number], vertex: [number, number] }[];

  async run() {
    await this.initGPU();
    await this.initPipeline();
    this.calcPhotoRenderSize();
    this.calcVertexData();
    this.draw();
  }

  async initGPU() {
    const adapter = await navigator.gpu.requestAdapter();

    if (adapter === null) {
      throw new Error('WebGPU adapter not found');
    }

    const device = await adapter.requestDevice();

    if (device === null) {
      throw new Error('WebGPU device not found');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({ device, format, alphaMode: 'opaque' });

    this.adapter = adapter;
    this.device = device;
    this.textureFormat = format;
  }

  async initPipeline() {
    const { device, textureFormat } = this;

    if (device === undefined || textureFormat === undefined) {
      throw new Error('WebGPU device or texture format not found');
    }

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
        targets: [{ format: textureFormat }]
      },
      primitive: {
        topology: 'triangle-list',
      }
    });

    const vertexBuffer = device.createBuffer({
      size: 6 * 3 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const mvpBuffer = device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = pipeline;
  }

  draw() {
    const { device, pipeline, vertexData } = this;

    if (device === undefined || pipeline === undefined || vertexData === undefined) {
      throw new Error('WebGPU device or pipeline or render pass descriptor or vertex data not found');
    }

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: [0.0, 0.0, 0.0, 1.0],
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });

    renderPass.setPipeline(pipeline);
    renderPass.setVertexBuffer(0, vertexData.buffer);
    renderPass.draw(vertexData.count);
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);

    // requestAnimationFrame(() => this.draw());
  }

  test() {
    const pos = [0, -10, -10];

    const modalViewMatrix = mat4.create();
    mat4.translate(modalViewMatrix, modalViewMatrix, vec3.fromValues(pos[0], pos[1], pos[2]));

    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, Math.PI / 4, this.cw / this.ch, 0.1, 1000.0);

    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modalViewMatrix);


  }

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.cw = vw;
    this.ch = vh;
    this.canvas.width = vw;
    this.canvas.height = vh;
    this.calcPhotoRenderSize();
    this.calcVertexData();
  }
  
  calcVertexData() {
    const { device, photos, vertexGap } = this;

    if (device === undefined) {
      return console.log('WebGPU device not found');
    }

    if (photos.length === 0) {
      return console.log('No photos to render');
    }

    const vertexArray = [];

    let startX = -1.0 + vertexGap[0];
    let startY = +1.0 - vertexGap[1];

    for (let i = 0; i < photos.length; i++) {
      const { vertex: [x, y] } = photos[i];
      vertexArray.push(...[startX + 0, startY + 0, 0.0])
      vertexArray.push(...[startX + 0, startY - y, 0.0])
      vertexArray.push(...[startX + x, startY - y, 0.0])
  
      vertexArray.push(...[startX + x, startY + 0, 0.0])
      vertexArray.push(...[startX + x, startY - y, 0.0])
      vertexArray.push(...[startX + 0, startY + 0, 0.0])
      if (i === 0) {
        console.log(vertexArray)
      }
      startX += x + vertexGap[0];
    }

    const buffer = device.createBuffer({
      size: vertexArray.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffer, 0, new Float32Array(vertexArray));

    this.vertexData = { buffer, count: vertexArray.length / 3 };
      
    this.draw();
  }

  calcPhotoRenderSize() {
    this.vertexGap = [this.gap / this.cw, this.gap / this.ch];
    if (this.photos.length > 0) {
      const colW = this.cw / (this.col + 1);
      this.photos.forEach(photo => {
        const colH = colW / photo.rate;
        photo.size = [colW, colH]
        photo.vertex = [colW / this.cw * 2, colH / this.ch * 2]
      });
      console.log(this.photos[0].vertex)
    }
  }

  loadPhotos(photos: string[]) {
    let count = photos.length - 1;
    photos.forEach(async photo => {
      const blob = await fetch(photo).then(res => res.blob());
      const img = await createImageBitmap(blob);

      this.photos.push({
        img,
        rate: img.width / img.height,
        size: [img.width, img.height],
        vertex: [0, 0]
      });

      if (count-- === 0) {
        this.run();
      }
    });
  }
}

export { InfiniteScrollingPhotos }