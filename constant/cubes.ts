const vertexData = new Float32Array([
// float3 position, float2 uv
    // face1
    +1, -1, +1,
    -1, -1, +1,
    -1, -1, -1,
    +1, -1, -1,
    +1, -1, +1,
    -1, -1, -1,
    // face2
    +1, +1, +1,
    +1, -1, +1,
    +1, -1, -1,
    +1, +1, -1,
    +1, +1, +1,
    +1, -1, -1,
    // face3
    -1, +1, +1,
    +1, +1, +1,
    +1, +1, -1,
    -1, +1, -1,
    -1, +1, +1,
    +1, +1, -1,
    // face4
    -1, -1, +1,
    -1, +1, +1,
    -1, +1, -1,
    -1, -1, -1,
    -1, -1, +1,
    -1, +1, -1,
    // face5
    +1, +1, +1,
    -1, +1, +1,
    -1, -1, +1,
    -1, -1, +1,
    +1, -1, +1,
    +1, +1, +1,
    // face6
    +1, -1, -1,
    -1, -1, -1,
    -1, +1, -1,
    +1, +1, -1,
    +1, -1, -1,
    -1, +1, -1
]);

const vertexCount = vertexData.length / 3;

const wgslShader = /* wgsl */`
  @group(0) @binding(1) var<uniform> transform: mat4x4<f32>;
  @vertex
  fn vertex_main(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
    return transform * vec4<f32>(pos, 1.0);
  }

  @group(0) @binding(0) var<uniform> color: vec4<f32>;
  @fragment
  fn frag_main() -> @location(0) vec4<f32> {
    return color;
  }

  // @vertex
  // fn vertex_main2(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
  //   var pos = array<vec2<f32>, 3>(
  //     vec2<f32>(0.0, 0.5),
  //     vec2<f32>(-0.5, -0.5),
  //     vec2<f32>(0.5, -0.5)
  //   );

  //   return vec4<f32>(pos[vertex_index], 0.0, 1.0);
  // }

  // @fragment
  // fn frag_main() -> @location(0) vec4<f32> {
  //   return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  // }
`

export { vertexData, vertexCount, wgslShader };