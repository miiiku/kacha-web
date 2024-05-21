const vertexData = new Float32Array([
  // float3 position, float2 uv
  -0.3, -0.3, -2.0,
  +0.3, -0.3, -2.0,
  +0.3, +0.3, -2.0,

  -0.3, -0.3, -2.0,
  +0.3, +0.3, -2.0,
  -0.3, +0.3, -2.0,
]);

const wgslShader = /* wgsl */`
  @group(0) @binding(0) var<storage, read> mvpMatrix : array<mat4x4<f32>>;
  @group(1) @binding(0) var Sampler: sampler;
  @group(1) @binding(1) var Texture: texture_2d<f32>;
  
  struct VertexOutput {
    @builtin(position) Position: vec4<f32>,
    @location(0) fragPosition: vec4<f32>,
    @location(1) fragUV: vec2<f32>,
  };

  @vertex
  fn vertex_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) pos: vec3<f32>,
    @location(1) uv: vec2<f32>,
  ) -> VertexOutput {
    var output: VertexOutput;
    var matrix_index = u32(vertex_index / 6);

    output.Position = mvpMatrix[matrix_index] * vec4<f32>(pos, 1.0);
    output.fragPosition = vec4<f32>(pos, 1.0) + vec4<f32>(1.0, 1.0, 1.0, 1.0);
    output.fragUV = uv;

    return output;
  }

  @fragment
  fn frag_main(
    @location(0) pos: vec4<f32>,
    @location(1) uv: vec2<f32>,
  ) -> @location(0) vec4<f32> {
    return textureSample(Texture, Sampler, uv) * pos;
  }
`

export { wgslShader, vertexData };