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

  @vertex
  fn vertex_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) pos: vec3<f32>
  ) -> @builtin(position) vec4<f32> {
    var matrix_index = u32(vertex_index / 6);
    return mvpMatrix[matrix_index] * vec4<f32>(pos, 1.0);
  }

  @fragment
  fn frag_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 1.0, 0.0, 1.0);
  }
`

export { wgslShader, vertexData };