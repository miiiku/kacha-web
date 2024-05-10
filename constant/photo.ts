const vertexData = new Float32Array([
  // float3 position, float2 uv
  -0.3, -0.5, +0.0,
  +0.3, -0.5, +0.0,
  +0.3, +0.5, +0.0,

  -0.3, -0.5, +0.0,
  +0.3, +0.5, +0.0,
  -0.3, +0.5, +0.0,
]);

const fragmentData = new Float32Array([
  1.0, 1.0, 0.0, 1.0,
]);

const vertexCount = vertexData.length / 3;

const wgslShader = /* wgsl */`
  @group(0) @binding(0) var<uniform> mvpMatrix : mat4x4<f32>;

  @vertex
  fn vertex_main(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
    return mvpMatrix * vec4<f32>(pos, 1.0);
  }

  // @group(0) @binding(0) var<uniform> color: vec4<f32>;
  // @fragment
  // fn frag_main() -> @location(0) vec4<f32> {
  //   return color;
  // }

  // @vertex
  // fn vertex_main2(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  //   var pos = array<vec2<f32>, 3>(
  //     vec2<f32>(0.0, 0.5),
  //     vec2<f32>(-0.5, -0.5),
  //     vec2<f32>(0.5, -0.5)
  //   );

  //   return vec4<f32>(pos[vertex_index], 0.0, 1.0);
  // }

  @fragment
  fn frag_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
`

function createVertexShaderBuffer(device: GPUDevice) {
  const buffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  
  device.queue.writeBuffer(buffer, 0, vertexData);

  return { buffer, count: vertexCount }
}

function createFragmentShaderBuffer(device: GPUDevice) {
  const buffer = device.createBuffer({
    size: fragmentData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  device.queue.writeBuffer(buffer, 0, fragmentData);

  return { buffer }
}

export { createVertexShaderBuffer, createFragmentShaderBuffer, wgslShader };