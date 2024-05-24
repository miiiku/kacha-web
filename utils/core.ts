import { wgslShader } from '@/constant/photo';
import { getMvpMatrix, getGridLayoutVertex, numMipLevels } from '@/utils/math';

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
    const { device, pipeline, photos, col, gap, aspect } = this;

    if (device === undefined) {
      throw new Error('WebGPU device not found');
    }

    if (pipeline === undefined) {
      throw new Error('WebGPU pipeline not found');
    }

    const { gridLayoutMatrix, gridLayoutVertex, gridLayoutIndex } = getGridLayoutVertex(photos, col, gap, aspect)

    const vertexBuffer = device.createBuffer({
      label: 'Vertex Buffer',
      size: gridLayoutVertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const indexBuffer = device.createBuffer({
      label: 'Index Buffer',
      size: gridLayoutIndex.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, 0, gridLayoutVertex)
    device.queue.writeBuffer(indexBuffer, 0, gridLayoutIndex)

    const mvpBuffer = device.createBuffer({
      label: 'MVP Buffer',
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

    this.buffers = { vertexBuffer, indexBuffer, mvpBuffer, mvpGroup }
    this.locations = { gridLayoutVertex, gridLayoutIndex, gridLayoutMatrix, gridLayoutTransform }
  }

  initTextureBuffer() {
    const { photos, device, pipeline, locations } = this;
    
    if (device === undefined || pipeline === undefined) {
      throw new Error('WebGPU device or pipeline not found');
    }

    const { gridLayoutMatrix } = locations

    if (gridLayoutMatrix === undefined) {
      throw new Error('WebGPU gridLayoutMatrix not found');
    }

    const textureGroupArray = []

    // Create a sampler with linear filtering for smooth interpolation.
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })

    for (let col of gridLayoutMatrix) {
      for (let colItem of col) {
        const photoIndex = colItem[3]
        const { img, originalSize } = photos[photoIndex]
        
        // create empty texture
        const texture = device.createTexture({
          mipLevelCount: numMipLevels(originalSize),
          size: originalSize,
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        })

        // update image to GPUTexture
        device.queue.copyExternalImageToTexture(
          { source: img },
          { texture: texture },
          originalSize
        )

        generateMips(device, texture);

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

        textureGroupArray.push(textureGroup)
      }
    }

    this.buffers.textureGroupArray = textureGroupArray
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

    const { vertexBuffer, indexBuffer, mvpBuffer, mvpGroup, textureGroupArray } = buffers;
    const { gridLayoutIndex, gridLayoutTransform } = locations;

    if (vertexBuffer === undefined || indexBuffer === undefined || mvpBuffer === undefined || mvpGroup === undefined || textureGroupArray === undefined) {
      throw new Error('WebGPU buffer or bind mvpGroup not found');
    }

    if (gridLayoutIndex === undefined || gridLayoutTransform === undefined) {
      throw new Error('WebGPU gridLayoutIndex or gridLayoutTransform not found');
    }

    device.queue.writeBuffer(mvpBuffer, 0, gridLayoutTransform)
    
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: [0.3, 0.3, 0.3, 1.0],
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });
  
    renderPass.setPipeline(pipeline)
    renderPass.setVertexBuffer(0, vertexBuffer)
    renderPass.setIndexBuffer(indexBuffer, 'uint16')
    renderPass.setBindGroup(0, mvpGroup)
    {
      textureGroupArray.forEach((texture, index) => {
        renderPass.setBindGroup(1, texture)
        renderPass.drawIndexed(6, 1, index * 6)
      })
    }
    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
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
    // if (this.device) {
    //   this.initVertexBuffer();
    //   this.initTextureBuffer();
    //   this.transformMatrix(0, 0);
    //   this.draw();
    // }
  }

  calcPhotoRenderSize() {
    if (this.photos.length > 0) {
      // 因为坐标计算是走-1到+1，为2倍，所以这里如果要让每列的宽度为屏幕的1/4，则每列的宽度为cw/2
      const colW = this.cw / 2
      this.photos.forEach(photo => {
        const colH = colW / photo.rate
        photo.scaledSize = [colW, colH]
        photo.vertexSize = [colW / this.cw, colH / this.ch]
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
        scaledSize: [img.width, img.height],
        originalSize: [img.width, img.height],
        vertexSize: [0, 0]
      });

      if (count-- === 0) {
        this.calcPhotoRenderSize();
        this.run();
      }
    });
  }
}

export { InfiniteScrollingPhotos }