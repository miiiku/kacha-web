import { wgslShader } from '@/constant/photo';
import { getMvpMatrix } from '@/utils/math';

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
    this.aspect = this.cw / this.ch;
    this.gap = 0.02;
    this.col = 4;
    this.gridLayout = [6, 4];
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
  vertexData: GPUBuffer | undefined;
  mvpData: GPUBuffer | undefined;
  group: GPUBindGroup | undefined;

  cw: number;
  ch: number;
  aspect: number;
  gap: number;
  col: number;
  gridLayout: [number, number]; // [col, row]

  photos: { img: ImageBitmap, rate: number, size: [number, number], vertex: [number, number] }[];

  async run() {
    await this.initGPU();
    await this.initPipeline();
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

    this.pipeline = pipeline;
  }

  draw() {
    const { device, pipeline, gridLayout, gap, aspect } = this;

    if (device === undefined || pipeline === undefined) {
      throw new Error('WebGPU device or pipeline not found');
    }

    // const count = gridLayout[0] * gridLayout[1];
    const count = 2;


    const [w, h] = this.photos[0].vertex;
    
    // 通过图片大小构建顶点数据
    const vertexArray = new Float32Array(6 * 3)
    vertexArray.set([-(w / 2), -(h / 2), -1.0], 0 * 3)
    vertexArray.set([+(w / 2), -(h / 2), -1.0], 1 * 3)
    vertexArray.set([+(w / 2), +(h / 2), -1.0], 2 * 3)

    vertexArray.set([-(w / 2), -(h / 2), -1.0], 3 * 3)
    vertexArray.set([+(w / 2), +(h / 2), -1.0], 4 * 3)
    vertexArray.set([-(w / 2), +(h / 2), -1.0], 5 * 3)
    
    const mvpArray = new Float32Array(count * 4 * 4)
    
    
    const vertexBuffer = device.createBuffer({
      size: vertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // create a 4x4xNUM STORAGE buffer to store matrix
    const mvpBuffer = device.createBuffer({
      size: 4 * 4 * 4 * count, // 4 x 4 x float32 x count
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: mvpBuffer }
        }
      ]
    })

    // 通过渲染数量构建对应的矩阵数据
    const photoArray = [];
    photoArray.push([-w, 0.0, 0.0])
    photoArray.push([+w, 0.0, 0.0])

    for (let i = 0; i < photoArray.length; i++) {
      const mvpMatrix = getMvpMatrix(aspect, photoArray[i])
      mvpArray.set(mvpMatrix, i * 16)
    }

    // for (let col = 0; col < gridLayout[0]; col++) {
    //   for (let row = 0; row < gridLayout[1]; row++) {
    //     const position = [0, 0, 0];
    //     position[0] = col * (w + gap);
    //     position[1] = row * (h + gap);
    //   }
    // }

    device.queue.writeBuffer(vertexBuffer, 0, vertexArray)
    device.queue.writeBuffer(mvpBuffer, 0, mvpArray)

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
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setBindGroup(0, group)
    renderPass.draw(vertexArray.length / 3, count);
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.cw = vw;
    this.ch = vh;
    this.canvas.width = vw;
    this.canvas.height = vh;
    this.aspect = vw / vh;
    this.calcPhotoRenderSize();
    if (this.device) {
      this.draw();
    }
  }
  
  // calcVertexData() {
  //   const { device, photos, vertexGap } = this;

  //   if (device === undefined) {
  //     return console.log('WebGPU device not found');
  //   }

  //   if (photos.length === 0) {
  //     return console.log('No photos to render');
  //   }

  //   const vertexArray = [];

  //   let startX = -1.0 + vertexGap[0];
  //   let startY = +1.0 - vertexGap[1];

  //   for (let i = 0; i < photos.length; i++) {
  //     const { vertex: [x, y] } = photos[i];
  //     vertexArray.push(...[startX + 0, startY + 0, 0.0])
  //     vertexArray.push(...[startX + 0, startY - y, 0.0])
  //     vertexArray.push(...[startX + x, startY - y, 0.0])
  
  //     vertexArray.push(...[startX + x, startY + 0, 0.0])
  //     vertexArray.push(...[startX + x, startY - y, 0.0])
  //     vertexArray.push(...[startX + 0, startY + 0, 0.0])
  //     if (i === 0) {
  //       console.log(vertexArray)
  //     }
  //     startX += x + vertexGap[0];
  //   }

  //   const buffer = device.createBuffer({
  //     size: vertexArray.length * 4,
  //     usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  //   });

  //   device.queue.writeBuffer(buffer, 0, new Float32Array(vertexArray));

  //   this.vertexData = { buffer, count: vertexArray.length / 3 };
      
  //   this.draw();
  // }

  calcPhotoRenderSize() {
    if (this.photos.length > 0) {
      const colW = this.cw / (this.col + 1);
      this.photos.forEach(photo => {
        const colH = colW / photo.rate;
        photo.size = [colW, colH]
        photo.vertex = [colW / this.cw, colH / this.ch]
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
        this.calcPhotoRenderSize();
        this.run();
      }
    });
  }
}

export { InfiniteScrollingPhotos }