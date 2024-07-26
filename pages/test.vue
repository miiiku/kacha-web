<template>
  <div>
    <canvas id="canvas" class="w-screen h-screen"></canvas>
  </div>
</template>

<script setup lang="ts">
import wgslShader from '@/shaders/test.wgsl?raw'

onMounted(async () => {
  async function UI () {
    const rectStructSize = 9
    const RECTANGLE_BUFFER_SIZE = 9 * 1024

    let rectData = new Float32Array(RECTANGLE_BUFFER_SIZE)
    let rectCount = 0

    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported')
    }

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement

    if (canvas === null) {
      throw new Error('Canvas not found')
    }

    resize()

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

    const colorTextureView = colorTexture.createView({ label: "color texture view" });

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

    const resolutionBuffer = device.createBuffer({
      label: 'Resolution buffer',
      size: 2 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    const customBindGroupLayout = device.createBindGroupLayout({
      label: 'custom bind group layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        },
      ],
    })

    const customPipelineLayout = device.createPipelineLayout({
      label: 'custom pipeline layout',
      bindGroupLayouts: [customBindGroupLayout],
    })

    const customBindGroup = device.createBindGroup({
      label: 'custom bind group',
      layout: customBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: rectBuffer },
        },
        {
          binding: 1,
          resource: { buffer: resolutionBuffer },
        },
      ],
    })

    const customPipeline = device.createRenderPipeline({
      label: 'custom pipeline',
      layout: customPipelineLayout,
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
      rectData[rectCount * rectStructSize + 8] = rounded

      rectCount+= 1
    }

    function render() {
      const vw = canvas.width
      const vh = canvas.height

      canvas.width = vw
      canvas.height = vh
      
      device.queue.writeBuffer(rectBuffer, 0, rectData)
      device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([vw, vh]))

      const commandEncoder = device.createCommandEncoder({
        label: 'Render command encoder',
      })

      const renderPass = commandEncoder.beginRenderPass({
        label: 'Render pass',
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

      renderPass.setViewport(0, 0, vw, vh, 0, 1)
      renderPass.setVertexBuffer(0, vertexBuffer)
      renderPass.setPipeline(customPipeline)
      renderPass.setBindGroup(0, customBindGroup)
      renderPass.draw(6, rectCount)
      renderPass.end()

      device.queue.submit([commandEncoder.finish()])

      rectCount = 0
      rectData = new Float32Array(RECTANGLE_BUFFER_SIZE)
    }

    function resize() {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
    }

    window.addEventListener('resize', resize)

    return { drawRect, render }
  }
  
  const ui = await UI()

  function draw() {
    ui.drawRect(
      [0.2, 0.2, 0.2, 1.0], // color
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

    // requestAnimationFrame(draw);
  }

  draw();

})
</script>