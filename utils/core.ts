import { wgslShader } from '@/constant/photo';
import { getMvpMatrix, getGridLayout, getGridLayoutVertex } from '@/utils/math';

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
    this.gridLayoutData = [];
    this.photos = [];

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

  vertexArray: Float32Array | undefined;
  mvpArray: Float32Array | undefined;

  cw: number;
  ch: number;
  aspect: number;
  gap: number;
  col: number;
  gridLayout: Array2L<number>; // [col, row]
  gridLayoutData: ISP_LayoutData;
  photos: ISP_Photos;

  isMove: boolean;
  isZoom: boolean;

  async run() {
    await this.initGPU();
    await this.initPipeline();
    this.initVertexBuffer();
    this.transformVertex(0, 0);
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
    const { device, textureFormat, gridLayout, gap } = this;

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
    
    const [col, row] = gridLayout;
    const [w, h] = this.photos[0].vertex;
    const count = col * row;
    const gridLayoutData = getGridLayout(col, row, w, h, gap)

    
    // 通过图片大小构建顶点数据
    const vertexArray = new Float32Array(6 * 3)
    vertexArray.set([-(w / 2), -(h / 2), -2.0], 0 * 3)
    vertexArray.set([+(w / 2), -(h / 2), -2.0], 1 * 3)
    vertexArray.set([+(w / 2), +(h / 2), -2.0], 2 * 3)

    vertexArray.set([-(w / 2), -(h / 2), -2.0], 3 * 3)
    vertexArray.set([+(w / 2), +(h / 2), -2.0], 4 * 3)
    vertexArray.set([-(w / 2), +(h / 2), -2.0], 5 * 3)
    
    const mvpArray = new Float32Array(count * 4 * 4)
    
    const vertexBuffer = device.createBuffer({
      size: vertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // create a 4 x 4 x count STORAGE buffer to store matrix
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
    });

    device.queue.writeBuffer(vertexBuffer, 0, vertexArray)
    
    this.pipeline = pipeline;
    this.vertexArray = vertexArray;
    this.mvpArray = mvpArray;
    this.vertexBuffer = vertexBuffer;
    this.mvpBuffer = mvpBuffer;
    this.group = group;
    this.gridLayoutData = gridLayoutData;
  }

  initVertexBuffer() {
    const { device, gridLayout, gap } = this;

    if (device === undefined) {
      throw new Error('WebGPU device not found');
    }
    // 通过图片数量和大小构建每个图片对应的顶点数据
    const vertexArray = new Float32Array(6 * 3 * this.photos.length)

    for (let photo of this.photos) {
      const [w, h] = photo.vertex;
      // 第一个三角面
      vertexArray.set([-(w / 2), -(h / 2), -2.0], 0 * 3)
      vertexArray.set([+(w / 2), -(h / 2), -2.0], 1 * 3)
      vertexArray.set([+(w / 2), +(h / 2), -2.0], 2 * 3)
      // 第二个三角面
      vertexArray.set([-(w / 2), -(h / 2), -2.0], 3 * 3)
      vertexArray.set([+(w / 2), +(h / 2), -2.0], 4 * 3)
      vertexArray.set([-(w / 2), +(h / 2), -2.0], 5 * 3)
    }
    
    // const mvpArray = new Float32Array(count * 4 * 4)
    
  }

  transformVertex(offsetX: number, offsetY: number) {
    const { aspect, gridLayout, gridLayoutData, mvpArray } = this;

    if (mvpArray === undefined) {
      throw new Error('WebGPU mvpArray not found');
    }

    const [col, row] = gridLayout;

    let num = 0;

    for (let c = 0; c < col; c++) {
      for (let r = 0; r < row; r++) {
        const [x, y, z] = gridLayoutData[c][r]
        const transformX = x + offsetX
        const transformY = y - offsetY
        const mvpMatrix = getMvpMatrix(aspect, [transformX, transformY, z])
        gridLayoutData[c][r] = [transformX, transformY, z]
        mvpArray.set(mvpMatrix, num * 16)
        num++;
      }
    }
  }

  draw() {
    const { device, pipeline, vertexArray, mvpArray, vertexBuffer, mvpBuffer, group, gridLayout } = this;

    if (
      device === undefined ||
      pipeline === undefined ||
      vertexArray === undefined ||
      mvpArray === undefined ||
      vertexBuffer === undefined ||
      mvpBuffer === undefined ||
      group === undefined
    )
      throw new Error('WebGPU device or pipeline not found');

    const [col, row] = gridLayout;
    const count = col * row;

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

  bindEvents() {
    const { canvas, cw, ch } = this;
    canvas.addEventListener('mousedown', () => {
      this.isMove = true;
    });
    canvas.addEventListener('mousemove', (evt: MouseEvent) => {
      if (!this.isMove) return;
      const { movementX, movementY } = evt;
      this.transformVertex(movementX / cw * 2, movementY / ch * 2)
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
    if (this.device) {
      this.transformVertex(0, 0);
      this.draw();
    }
  }

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