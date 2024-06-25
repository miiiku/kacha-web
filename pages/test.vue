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
  }

  struct RectStorage {
    rectangles: array<Rect>,
  }

  @group(0) @binding(0) var<storage> data: RectStorage;

  @vertex
  fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let r = data.rectangles[input.instance];
    let vertex = mix(
      r.position.xy,
      r.position.xy + r.size.xy,
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
    return r.color;
  }
`
onMounted(async () => {
  async function UI (count: number) {
    let rectCount = 0
    
    const rectStructSize = 9

    let rectData = new Float32Array(rectStructSize * count * 4)

    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported')
    }

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement

    if (canvas === null) {
      throw new Error('Canvas not found')
    }

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

    const vertexBuffer = device.createBuffer({
      label: 'Vertex buffer',
      size: 2 * 2 * 3 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })

    const rectBuffer = device.createBuffer({
      label: 'Rect buffer',
      size: rectCount * rectStructSize * Float32Array.BYTES_PER_ELEMENT,
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
        targets: [{ format }]
      },
      primitive: {
        topology: 'triangle-list',
      },
    })

    // Just regular full-screen quad consisting of two triangles.
    // 0--1 4
    // | / /|
    // |/ / |
    // 2 3--5
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
      rectData[rectCount * rectStructSize + 8] = rounded

      rectCount++
    }

    function render() {
      const commandEncoder = device.createCommandEncoder({
        label: 'Render command encoder',
      })

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })

      renderPass.setViewport(
        0,
        0,
        window.innerWidth * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio,
        0,
        1
      )
      
      device.queue.writeBuffer(rectBuffer, 0, rectData)

      renderPass.setPipeline(rectPipeline)
      renderPass.setVertexBuffer(0, vertexBuffer)
      renderPass.setBindGroup(0, rectBindGroup)
      renderPass.draw(6, rectCount)
      renderPass.end()

      device.queue.submit([commandEncoder.finish()])

      rectCount = 0
      rectData = new Float32Array(rectStructSize * count * 4)
    }

    return { drawRect, render }
  }
  
  const ui = await UI(3)

  ui.drawRect(
    [0, 0, 0, 1] , // color
    [100, 100], // position
    [300, 300], // size
    25        , // rounded
  )

  ui.render()
})
</script>