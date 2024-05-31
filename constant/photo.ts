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
    @location(2) xy             : vec2<f32>,   // 顶点坐标
    @location(3) wh             : vec2<f32>,   // 宽高
  };

  fn distanceFromRect(
    pos   : vec2<f32>,
    center: vec2<f32>,
    corner: vec2<f32>,
    radius: f32
  ) -> f32 {
    var p = pos - center;
    var q = abs(p) - (corner - radius);
    return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - radius;
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
    
    output.Position = mvpMatrix[matrix_index] * vec4<f32>(pos, 1.0);
    output.fragPosition = pos.xy;
    output.fragUV = uv;
    output.xy = output.Position.xy;
    output.wh = imgSize[size_index];

    return output;
  }

  @fragment
  fn frag_main(
    @location(0) fragPosition: vec2<f32>,
    @location(1) fragUV      : vec2<f32>,
    @location(2) xy          : vec2<f32>,
    @location(3) wh          : vec2<f32>,
  ) -> @location(0) vec4<f32> {
    // todo 把图片的宽高传进来 要不要乘以矩阵信息？ 不要矩阵信息，把顶点坐标(屏幕居中)移动为uv坐标(第四象限)
    // var a = fragPosition;
    // var isInside = distanceFromRect(
    //   xy,
    //   vec2<f32>(xy.x / 2, xy.y / 2),
    //   vec2<f32>(wh.x / 2, wh.y / 2),
    //   0.25
    //   ) < 0.00001;
    // if (!isInside) {
    //   discard;
    // }
    return textureSample(Texture, Sampler, fragUV);
  }
`

export { wgslShader, vertexData };