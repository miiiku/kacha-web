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
  @group(0) @binding(0) var<storage, read> mvpMatrix: array<mat4x4<f32>>;
  @group(0) @binding(1) var<storage, read> imgSize  : array<vec2<f32>>;
  @group(1) @binding(0) var Sampler: sampler;
  @group(1) @binding(1) var Texture: texture_2d<f32>;
  
  struct VertexOutput {
    @builtin (position) Position: vec4<f32>,
    @location(0) fragPosition   : vec2<f32>,
    @location(1) fragUV         : vec2<f32>,
    @location(2) wh             : vec2<f32>,
  };

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

  @vertex
  fn vertex_main(
    @builtin (vertex_index) vertex_index: u32,
    @location(0) pos                    : vec3<f32>,
    @location(1) uv                     : vec2<f32>,
  ) -> VertexOutput {
    var output: VertexOutput;
    var matrix_index = u32(vertex_index / 4);
    var size_index = u32(matrix_index / 2);
    
    output.Position     = mvpMatrix[matrix_index] * vec4<f32>(pos, 1.0);
    output.fragPosition = pos.xy;
    output.fragUV       = uv;
    output.wh           = imgSize[size_index];

    return output;
  }

  @fragment
  fn frag_main(
    @location(0) fragPosition: vec2<f32>,
    @location(1) fragUV      : vec2<f32>,
    @location(2) wh          : vec2<f32>,
  ) -> @location(0) vec4<f32> {
    // 把顶点坐标(屏幕居中)移动到第一象限
    var rectCorner = vec2<f32>(max(wh.x * 0.5, 0.0), max(wh.y * 0.5, 0.0));
    var position = fragPosition + rectCorner;
    var isInside = distanceFromRect(
      position,
      rectCorner + vec2<f32>(0.0, 0.0),
      rectCorner,
      0.02
      ) < 0.00001;
    if (!isInside) {
      discard;
    }
    return textureSample(Texture, Sampler, fragUV);
  }
`

export { wgslShader, vertexData };