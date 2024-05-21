import { wgslShader } from '@/constant/photo';
import { getMvpMatrix, getGridLayoutVertex } from '@/utils/math';

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
    this.photos = [];

    this.buffers = {}
    this.locations = {}

    this.isMove = false;
    this.isZoom = false;
    
    this.resize();
    this.bindEvents();
  }

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  adapter: GPUAdapter | undefined;
  device: GPUDevice | undefined;
  textureFormat: GPUTextureFormat | undefined;
  pipeline: GPURenderPipeline | undefined;
  vertexBuffer: GPUBuffer | undefined;
  mvpBuffer: GPUBuffer | undefined;
  group: GPUBindGroup | undefined;
  buffers: ISP_Buffer;
  locations: ISP_Locations;

  vertexArray: Float32Array | undefined;
  mvpArray: Float32Array | undefined;

  cw: number;
  ch: number;
  aspect: number;
  gap: number;
  col: number;
  photos: ISP_Photos;

  isMove: boolean;
  isZoom: boolean;

  async run() {
    await this.initGPU();
    await this.initPipeline();
    this.initVertexBuffer();
    this.initTextureBuffer();
    this.transformMatrix(0, 0);
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
        buffers: [
          {
          arrayStride: 5 * 4, // 5 floats per vertex (x, y, z, u, v)
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
            {
              shaderLocation: 1,
              offset: 3 * 4,
              format: 'float32x2',
            }
          ],
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

  initVertexBuffer() {
    const { device, pipeline, photos, col, gap } = this;

    if (device === undefined) {
      throw new Error('WebGPU device not found');
    }

    if (pipeline === undefined) {
      throw new Error('WebGPU pipeline not found');
    }

    const { gridLayoutMatrix, gridLayoutVertex } = getGridLayoutVertex(photos, col, gap)

    const vertexBuffer = device.createBuffer({
      size: gridLayoutVertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const mvpBuffer = device.createBuffer({
      size: 4 * 4 * 4 * photos.length, // 4 x 4 x float32 x photos.length
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const mvpGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: mvpBuffer }
        }
      ]
    });

    const gridLayoutTransform = new Float32Array(photos.length * 16)

    device.queue.writeBuffer(vertexBuffer, 0, gridLayoutVertex)

    this.buffers = { vertexBuffer, mvpBuffer, mvpGroup }
    this.locations = { gridLayoutVertex, gridLayoutMatrix, gridLayoutTransform }
  }

  initTextureBuffer() {
    const { device, pipeline } = this;
    
    if (device === undefined || pipeline === undefined) {
      throw new Error('WebGPU device or pipeline not found');
    }

    const img = this.photos[0].img
    const textureSize = [img.width, img.height]

    // create empty texture
    const texture = device.createTexture({
      size: textureSize,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    })

    // update image to GPUTexture
    device.queue.copyExternalImageToTexture(
      { source: img },
      { texture: texture },
      textureSize
    )

    // Create a sampler with linear filtering for smooth interpolation.
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })

    const textureGroup = device.createBindGroup({
      label: 'Texture Group with Texture/Sampler',
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: sampler
        },
        {
          binding: 1,
          resource: texture.createView()
        }
      ]
    })

    this.buffers.textureGroup = textureGroup
  }

  transformMatrix(offsetX: number, offsetY: number) {
    const { locations } = this
    const { gridLayoutMatrix, gridLayoutTransform } = locations

    if (gridLayoutMatrix === undefined || gridLayoutTransform === undefined) {
      throw new Error('WebGPU gridLayoutMatrix or gridLayoutTransform not found');
    }

    let num = 0
    for (let col of gridLayoutMatrix) {
      for (let colItem of col) {
        const [x, y, z] = colItem
        const transformX = x + offsetX
        const transformY = y - offsetY
        const mvpMatrix = getMvpMatrix([transformX, transformY, z])
        colItem[0] = transformX
        colItem[1] = transformY
        colItem[2] = z
        gridLayoutTransform.set(mvpMatrix, 16 * num)
        num++
      }
    }
  }

  draw() {
    const { device, pipeline, buffers, locations } = this;

    if (device === undefined || pipeline === undefined) {
      throw new Error('WebGPU device or pipeline not found');
    }

    const { vertexBuffer, mvpBuffer, mvpGroup, textureGroup } = buffers;
    const { gridLayoutVertex, gridLayoutTransform } = locations;

    if (mvpBuffer === undefined || vertexBuffer === undefined || mvpGroup === undefined || textureGroup === undefined) {
      throw new Error('WebGPU buffer or bind mvpGroup not found');
    }

    if (gridLayoutVertex === undefined || gridLayoutTransform === undefined) {
      throw new Error('WebGPU gridLayoutVertex or gridLayoutTransform not found');
    }

    // console.log(`matrix count: ${gridLayoutTransform.length / 16}`)
    // console.log(`gridLayoutVertex: ${(gridLayoutVertex?.length || 0) / 6 / 3}`)
    // console.log(`gridLayoutTransform: ${gridLayoutTransform.length / 16}`)

    device.queue.writeBuffer(mvpBuffer, 0, gridLayoutTransform)

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
    renderPass.setBindGroup(0, mvpGroup)
    renderPass.setBindGroup(1, textureGroup)
    renderPass.draw(gridLayoutVertex.length / 5);
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  bindEvents() {
    const { canvas, cw, ch } = this;
    canvas.addEventListener('mousedown', () => {
      this.isMove = true;
    });
    canvas.addEventListener('mousemove', (evt: MouseEvent) => {
      if (!this.isMove) return;
      const { movementX, movementY } = evt;
      this.transformMatrix(movementX / cw * 2, movementY / ch * 2)
      this.draw()
    });
    canvas.addEventListener('mouseup', () => {
      this.isMove = false;
    });
    window.addEventListener('resize', () => this.resize());
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
    console.log(this.photos)
    if (this.device) {
      this.transformMatrix(0, 0);
      this.draw();
    }
  }

  calcPhotoRenderSize() {
    if (this.photos.length > 0) {
      const colW = this.cw / (this.col + 1)
      this.photos.forEach(photo => {
        const colH = colW / photo.rate
        photo.size = [colW, colH]
        photo.vertex = [colW / this.cw, colH / this.ch]
      });
    }
  }

  loadPhotos(photos: string[]) {
    let count = photos.length - 1;
    photos.forEach(async photo => {
      const blob = await fetch(photo).then(res => res.blob());
      const img = await createImageBitmap(blob);

      this.photos.push({
        img,
        src: photo,
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