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