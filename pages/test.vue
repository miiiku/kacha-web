<template>
  <div>
    <canvas id="canvas" class="w-screen h-screen"></canvas>
  </div>
</template>

<script setup lang="ts">
const wgslShader = `
  struct VertexInput {
    @location(0) position             : vec2<f32>,
    @builtin (instance_index) instance: u32,
  };

  struct VertexOutput {
    @builtin (position) position            : vec4<f32>,
    @location(1) @interpolate(flat) instance: u32,
    @location(2) @interpolate(linear) vertex: vec2<f32>,
  };

  struct Rect {
    color   : vec4<f32>,
    position: vec2<f32>,
    size    : vec2<f32>,
    window  : vec2<f32>,
    rounded : f32,
    _unused1: f32,
    _unused2: f32,
    _unused3: f32,
    _unused4: f32,
    _unused5: f32,
  }

  struct StorageData {
    rectangles: array<Rect>,
  }

  fn distanceFromRect(
    pixelPos    : vec2<f32>,
    rectCenter  : vec2<f32>,
    rectCorner  : vec2<f32>,
    cornerRadius: f32
  ) -> f32 {
    var p = pixelPos - rectCenter;
    var q = abs(p) - rectCorner + cornerRadius;
    return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - cornerRadius;
  }

  @group(0) @binding(0) var<storage> data: StorageData;

  @vertex
  fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let r = data.rectangles[input.instance];
    let vertex = mix(
      r.position.xy,
      r.position.xy + r.size,
      input.position
    );

    output.position = vec4<f32>(vertex / r.window * 2 - 1, 0, 1);
    output.position.y = -output.position.y;
    output.vertex = vertex;
    output.instance = input.instance;

    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let r = data.rectangles[input.instance];

    let isInside = distanceFromRect(
      r.position,
      r.position + r.size / 2,
      r.size / 2,
      0.02
    ) < 0.00001;

    if (isInside) {
      discard;
    }

    return select(r.color, vec4<f32>(0.0, 0.0, 0.0, 1.0), isInside);
  }
`
onMounted(async () => {
  async function UI () {

    const rectStructSize = 16
    const RECTANGLE_BUFFER_SIZE = 16 * 1024

    let rectData = new Float32Array(RECTANGLE_BUFFER_SIZE)
    let rectCount = 0

    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported')
    }

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement

    if (canvas === null) {
      throw new Error('Canvas not found')
    }

    canvas.width = window.innerWidth * window.devicePixelRatio
    canvas.height = window.innerHeight * window.devicePixelRatio

    const context = canvas.getContext('webgpu') as GPUCanvasContext

    if (context === null) {
      throw new Error('WebGPU context not found')
    }

    const adapter = await navigator.gpu.requestAdapter()

    if (adapter === null) {
      throw new Error('WebGPU adapter not found')
    }

    const device = await adapter.requestDevice()

    if (device === null) {
      throw new Error('WebGPU device not found')
    }

    const format = navigator.gpu.getPreferredCanvasFormat()

    context.configure({ device, format, alphaMode: 'opaque' })
    
    const triangleShader = device.createShaderModule({ code: wgslShader });

    const colorTexture = device.createTexture({
      label: "color texture",
      size: { width: canvas.width, height: canvas.height },
      sampleCount: 4,
      format: "bgra8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const colorTextureView = colorTexture.createView({ label: "color" });

    const vertexBuffer = device.createBuffer({
      label: 'Vertex buffer',
      size: 2 * 2 * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    const rectBuffer = device.createBuffer({
      label: 'Rect buffer',
      size: RECTANGLE_BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const rectBindGroupLayout = device.createBindGroupLayout({
      label: 'Rect bind group layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    })

    const rectPipelineLayout = device.createPipelineLayout({
      label: 'Rect pipeline layout',
      bindGroupLayouts: [rectBindGroupLayout],
    })

    const rectBindGroup = device.createBindGroup({
      label: 'Rect bind group',
      layout: rectBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: rectBuffer,
          },
        },
      ],
    })

    const rectPipeline = device.createRenderPipeline({
      label: 'Rect pipeline',
      layout: rectPipelineLayout,
      vertex: {
        module: triangleShader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module: triangleShader,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
      multisample: { count: 4 },
    })

    // Just regular full-screen quad consisting of two triangles.
    device.queue.writeBuffer(vertexBuffer, 0, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 0,
      0, 1,
      1, 1
    ]));

    function drawRect(
      color: number[],
      position: number[],
      size: number[],
      rounded: number
    ) {
      rectData[rectCount * rectStructSize + 0] = color[0]
      rectData[rectCount * rectStructSize + 1] = color[1]
      rectData[rectCount * rectStructSize + 2] = color[2]
      rectData[rectCount * rectStructSize + 3] = color[3]
      rectData[rectCount * rectStructSize + 4] = position[0]
      rectData[rectCount * rectStructSize + 5] = position[1]
      rectData[rectCount * rectStructSize + 6] = size[0]
      rectData[rectCount * rectStructSize + 7] = size[1]
      rectData[rectCount * rectStructSize + 8] = window.innerWidth
      rectData[rectCount * rectStructSize + 9] = window.innerHeight
      rectData[rectCount * rectStructSize + 10] = rounded
      rectData[rectCount * rectStructSize + 11] = 0
      rectData[rectCount * rectStructSize + 12] = 0
      rectData[rectCount * rectStructSize + 13] = 0
      rectData[rectCount * rectStructSize + 14] = 0
      rectData[rectCount * rectStructSize + 15] = 0

      rectCount+= 1
    }

    function render() {
      const commandEncoder = device.createCommandEncoder({
        label: 'Render command encoder',
      })

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: colorTextureView,
            resolveTarget: context.getCurrentTexture().createView({ label: 'antialiased resolve target' }),
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      
      device.queue.writeBuffer(rectBuffer, 0, rectData)

      renderPass.setViewport(
        0,
        0,
        window.innerWidth * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio,
        0,
        1
      )
      renderPass.setVertexBuffer(0, vertexBuffer)
      renderPass.setPipeline(rectPipeline)
      renderPass.setBindGroup(0, rectBindGroup)
      renderPass.draw(6, rectCount)
      renderPass.end()

      device.queue.submit([commandEncoder.finish()])

      rectCount = 0
      rectData = new Float32Array(RECTANGLE_BUFFER_SIZE)
    }

    return { drawRect, render }
  }
  
  const ui = await UI()

  function draw() {
    ui.drawRect(
      [0.1, 0.2, 0.1, 1.0], // color
      [100, 100], // position
      [300, 300], // size
      25, // rounded
    )

    ui.drawRect(
      [0.3, 0.3, 0.3, 1.0], // color
      [500, 100], // position
      [300, 300], // size
      50, // rounded
    )

    ui.drawRect(
      [0.7, 0.7, 0.7, 1.0], // color
      [900, 200], // position
      [300, 300], // size
      50, // rounded
    )

    ui.render()

    requestAnimationFrame(draw);
  }

  draw();

})
</script>