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
  rounded : f32,
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

fn sdBoxRadius(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let d = abs(p) - b + r;
  return length(max(d, vec2<f32>(0.0, 0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@group(0) @binding(0) var<storage> data: StorageData;
@group(0) @binding(1) var<storage> resolution: vec2<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  let rect = data.rectangles[input.instance];

  let vertex = mix(
    rect.position.xy,
    rect.position.xy + rect.size,
    input.position
  );

  output.position = vec4<f32>(vertex / resolution * 2 - 1, 0, 1);
  output.position.y = -output.position.y;
  output.vertex = vertex;
  output.instance = input.instance;

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let vertex   = input.vertex;
  let position = input.position;
  let size     = data.rectangles[input.instance].size;

  let fullSize = vec2<f32>(size + position.xy);

  let st = (vertex * 2.0 - fullSize) / fullSize.y;
  

  let pct = sdBoxRadius(st, vec2<f32>(0.8), 0.04);

  let color = mix(vec4(0.0, 0.0, 0.0, 1.0), data.rectangles[input.instance].color, 1.0 - smoothstep(0.0, 0.01, pct));

  return color;
  // let r = data.rectangles[input.instance];
  // let window = r.window;

  // let st = (r.position * 2.0 - window) / window.y;

  // let pct = sdBoxRadius(st, r.size, 0.04);

  // let color = mix(vec4(0.6, 0.6, 0.6, 1.0), r.color, 1.0 - smoothstep(0.0, 0.01, pct));

  // return color;
}