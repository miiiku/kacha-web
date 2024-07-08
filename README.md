
# 列表的宽度不正常

https://shinylasers.com/zh-cn/playground

// MIT License

// Copyright (c) 2022 shinylasers.com

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
};

struct DefaultInput {
    resolution: vec2<f32>,
    time: f32,
};

fn sdCircle(p: vec2<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn sdBox(p: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0, 0.0))) + min(max(d.x, d.y), 0.0);
}


fn sdBoxRadius(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0, 0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@group(0) @binding(0)
var<uniform> si: DefaultInput;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let st = (in.pos.xy * 2 - si.resolution) / si.resolution.y;
    let lineColor = vec3(1.0, 1.0, 1.0);
    let bgColor = vec3(0.6, 0.6, 0.6);

    // let pct = sdCircle(st, 0.5);
    // let color = mix(bgColor, lineColor, pct);
    // let color = mix(bgColor, lineColor, 1.0 - smoothstep(0.0, 0.01, pct));

    // let pct = sdBox(st, vec2<f32>(0.3));
    // let color = mix(bgColor, lineColor, 1.0 - smoothstep(0.0, 0.01, pct));
    let pct = sdBoxRadius(st, vec2<f32>(0.3), 0.02);
    let color = mix(bgColor, lineColor, 1.0 - smoothstep(0.0, 0.01, pct));
  
    return vec4(color, 1.0);
  
    // let li = in.pos.xy/si.resolution;
    // let r = li.x * abs(sin(si.time * 0.1));
    // let g = li.y * abs(cos(si.time * 0.2));
    // let b = li.x * abs(cos(si.time * 0.3));
    // return vec4<f32>(r, g , b, 1.0);
}
