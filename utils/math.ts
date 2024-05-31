import { mat4, vec3 } from 'gl-matrix'

type gridLayoutRowInfo = [leftX: number, rightX: number]

type gridLayoutColInfo = [topY: number, bottomY: number, totalHeight: number, x: number]

/**
 * 获取正交投影矩阵信息
 * @param position 平移
 * @param rotation 旋转
 * @param scale 缩放
 * @returns 
 */
export const getMvpMatrix = (
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1]
) => {
  const modelViewMatrix = mat4.create();
  // translate position
  mat4.translate(modelViewMatrix, modelViewMatrix, vec3.fromValues(position[0], position[1], position[2]));
  // rotate
  mat4.rotateX(modelViewMatrix, modelViewMatrix, rotation[0])
  mat4.rotateY(modelViewMatrix, modelViewMatrix, rotation[1])
  mat4.rotateZ(modelViewMatrix, modelViewMatrix, rotation[2])
  // scale
  mat4.scale(modelViewMatrix, modelViewMatrix, vec3.fromValues(scale[0], scale[1], scale[2]))
  
  const projectionMatrix = mat4.create();
  mat4.ortho(projectionMatrix, -1, +1, -1, +1, -1, +1);

  const mvpMatrix = mat4.create();
  mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);

  return mvpMatrix as Float32Array
}

/**
 * 根据布局信息和图片信息返回顶点数据和索引数据
 * @param gridLayout 布局信息
 * @param photos 图片信息
 * @returns 
 */
export const getVertexFromGridLayout = (
  gridLayout: ISP_LayoutData,
  photos: ISP_Photos
): {
  gridLayoutImgSize: Float32Array,
  gridLayoutVertex: Float32Array,
  gridLayoutIndex: Uint16Array
} => {
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5

  // 不使用索引缓冲区需要的额外空间 = a = size * 2 * 5
  // 使用索引缓冲区需要的额外空间 = b = size * 6
  // 对比下来节省的空间 = a - b

  const gridLayoutImgSize: Float32Array = new Float32Array(photos.length * 2)      // 用于存储每个图片的宽高信息
  const gridLayoutVertex: Float32Array  = new Float32Array(4 * 5 * photos.length)  // 用于存储每个格子的中心顶点位置信息
  const gridLayoutIndex: Uint16Array    = new Uint16Array(6 * photos.length)       // 用于存储每个格子的四个顶点索引信息

  let count = 0

  // 按布局顺序填充顶点数据
  for (let col of gridLayout) {
    for (let colItem of col) {
      const [,,, index] = colItem
      const [w, h] = photos[index].vertexSize
      const vertexArray = []
      const indexCount = count * 4

      // 存储图片宽高信息
      gridLayoutImgSize.set([w, h], count * 2)

      // 计算当前图片的中心点顶点位置  x y z  u v
      vertexArray.push(-(w / 2), +(h / 2), 0.0,  0.0, 0.0) // 0
      vertexArray.push(+(w / 2), +(h / 2), 0.0,  1.0, 0.0) // 1 4
      vertexArray.push(-(w / 2), -(h / 2), 0.0,  0.0, 1.0) // 2 3
      vertexArray.push(+(w / 2), -(h / 2), 0.0,  1.0, 1.0) // 5
      gridLayoutVertex.set(vertexArray, count * 4 * 5)

      // 计算顶点索引信息
      gridLayoutIndex.set([
        indexCount + 0,
        indexCount + 1,
        indexCount + 2,
        indexCount + 2,
        indexCount + 1,
        indexCount + 3,
      ], count * 6)

      count++
    }
  }

  // console.log('gridLayoutVertex', gridLayoutVertex)
  // console.log('gridLayoutIndex', gridLayoutIndex)

  return { gridLayoutImgSize, gridLayoutVertex, gridLayoutIndex }
}

/**
 * 瀑布流计算方式 获取下一个图片应该插入的column索引和追加方向
 * @param colInfo 
 * @returns 
 */
export const getWaterfallFlowNext = (colInfo: gridLayoutColInfo[]) : { minColIndex: number, nextTop: boolean, nextBottom: boolean } => {
  let minColIndex = 0
  let nextTop = false
  let nextBottom = true

  const update = (y1: number, y2: number) => {
    if (y1 + y2 >= 0) {
      nextTop = false
      nextBottom = true
    } else {
      nextTop = true
      nextBottom = false
    }
  }

  const [y1, y2, h] = colInfo[0]
  update(y1, y2)

  let minHeight = h
  for (let i = 1; i < colInfo.length; i++) {
    const [top, bottom, totalHeight] = colInfo[i]
    if (totalHeight < minHeight) {
      minHeight = totalHeight
      minColIndex = i
      update(top, bottom)
    }
  }

  return { minColIndex, nextTop, nextBottom }
}

/**
 * 先根据列数交替往两边出一条垂直居中行，在以瀑布流计算方式向上下追加排列
 * 
 * 由于图形的计算方式是先中屏幕中心点左右依此交替绘制出多列一行的一条线，然后在根据这一条线做瀑布流布局
 * 所以他的展示方式跟传入的photos的顺序是完全不一样的。
 * <<就需要特别注意矩阵变换信息要跟顶点坐标的顺序是一一对应的，这里就需要提前规划好>>
 * 
 * 也可以使用不同的group和vertex的方式来实现，这样就不需要考虑矩阵顺序和顶点顺序的问题了。但是这样的话，需要不断切换group和vertex，性能消耗较大
 * 所以目前做法是规划好统一顺序，在一个group和vertex中绘制所有顶点，然后在shader中有序读取对应的数据绘制。
 * 
 * @param photos 图片列表
 * @param col 总列数
 * @param gap 图片之间的间距
 * @param aspect 屏幕的宽高比
 * @returns 
 */
export const getGridLayoutVertex = (photos: ISP_Photos, col: number, gap: number, aspect: number) => {
  const gridLayoutMatrix: ISP_LayoutData = new Array(col).fill('').map(() => [])  // 用于存储每个格子的矩阵变换值信息 [x, y, z, index]
  const isOddCol                         = col % 2 === 1                          // 是否为奇数列
  const offsetCol                        = isOddCol ? 1 : 0                       // 偏移量，用于处理偶数列的特殊情况
  const rowInfo: gridLayoutRowInfo       = [0, 0]
  const colInfo: gridLayoutColInfo[]     = []

  // 初始化所有列
  for (let i = 0; i < col; i++) {
    let [w, h] = photos[i].vertexSize
    // 中心点
    if (i === 0 && isOddCol) {
      const midIndex = Math.floor(col / 2)
      rowInfo[0] = -(w / 2)
      rowInfo[1] = +(w / 2)
      colInfo[midIndex] = [+(h / 2), -(h / 2), h, 0]
      gridLayoutMatrix[midIndex][0] = [0.0, 0.0, 0.0, i]
      continue
    }
    // 左边
    if (i % 2 === 0) {
      const colIndex = Math.floor(col / 2) - 1 - (i / 2 - offsetCol)
      if (i === offsetCol * 2) {
        rowInfo[0] -= w / 2 + (isOddCol ? gap : gap / 2)
      } else {
        rowInfo[0] -= w + gap
      }
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[0]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[0], 0.0, 0.0, i]
    }
    // 右边
    if (i % 2 === 1) {
      const colIndex = Math.floor(col / 2) + (i - 1) / 2 + offsetCol
      if (i === 1) {
        console.log("first right col")
        rowInfo[1] += w / 2 + (isOddCol ? gap : gap / 2)
      } else {
        rowInfo[1] += w + gap
      }
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[1]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[1], 0.0, 0.0, i]
    }
  }


  for (let i = col; i < photos.length; i++) {
    const h = photos[i].vertexSize[1]

    // 获取瀑布流计算结果
    const { minColIndex, nextTop, nextBottom } = getWaterfallFlowNext(colInfo)
    const [topY, bottomY, , x]                 = colInfo[minColIndex]
    const currentOffsetY                       = h / 2 + gap * aspect           // 当前图片顶点的自身偏移量
    const appendOffsetY                        = h + gap * aspect               // 追加图片的偏移量

    colInfo[minColIndex][2] += h  // 更新高度总和

    // 往上追加
    if (nextTop) {
      gridLayoutMatrix[minColIndex].unshift([x, topY + currentOffsetY, 0.0, i])
      colInfo[minColIndex][0] += appendOffsetY // 更新上部分的偏移范围
    }

    // 往下追加
    if (nextBottom) {
      gridLayoutMatrix[minColIndex].push([x, bottomY - currentOffsetY, 0.0, i])
      colInfo[minColIndex][1] -= appendOffsetY // 更新下部分的偏移范围
    }
  }
  
  // 用布局信息去获取顶点数据和索引数据
  const { gridLayoutImgSize, gridLayoutVertex, gridLayoutIndex } = getVertexFromGridLayout(gridLayoutMatrix, photos)

  return { gridLayoutImgSize, gridLayoutVertex, gridLayoutIndex, gridLayoutMatrix }
}

/**
 * 获取mipmap等级数
 * @param sizes 
 * @returns 
 */
export const getNumMipLevels = (sizes: number[]): number => {
  const maxSize = Math.max(...sizes);
  return 1 + Math.log2(maxSize) | 0;
};

/**
 * 使用GPU生成mipmap等级
 */
export const generateMips = (() => {
  let sampler: GPUSampler;
  let module : GPUShaderModule;
  const pipelineByFormat: { [key: string]: GPURenderPipeline } = {};

  return function generateMips(device: GPUDevice, texture: GPUTexture) {
    if (!module) {
      module = device.createShaderModule({
        label: 'textured quad shaders for mip level generation',
        code : `
          struct VSOutput {
            @builtin (position) position: vec4f,
            @location(0) texcoord       : vec2f,
          };

          @vertex fn vs(
            @builtin(vertex_index) vertexIndex: u32
          ) -> VSOutput {
            let pos = array(
              // 1st triangle    
              vec2f(0.0,  0.0),   // center, center
              vec2f(1.0,  0.0),   // right, center
              vec2f(0.0,  1.0),   // center, top

              // 2st triangle                    
              vec2f(0.0,  1.0),   // center, top
              vec2f(1.0,  0.0),   // right, center
              vec2f(1.0,  1.0),   // right, top
            );

            var vsOutput: VSOutput;
            let xy                = pos[vertexIndex];
                vsOutput.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
                vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
            return vsOutput;
          }

          @group(0) @binding(0) var ourSampler: sampler;
          @group(0) @binding(1) var ourTexture: texture_2d<f32>;

          @fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
            return textureSample(ourTexture, ourSampler, fsInput.texcoord);
          }
        `,
      });

      sampler = device.createSampler({
        minFilter: 'linear',
      });
    }

    if (!pipelineByFormat[texture.format]) {
      pipelineByFormat[texture.format] = device.createRenderPipeline({
        label: 'mip level generator pipeline',
        layout: 'auto',
        vertex: {
          module,
        },
        fragment: {
          module,
          targets: [{ format: texture.format }],
        },
      });
    }

    const pipeline = pipelineByFormat[texture.format];

    const encoder = device.createCommandEncoder({ label: 'mip gen encoder' });

    let width        = texture.width;
    let height       = texture.height;
    let baseMipLevel = 0;

    while (width > 1 || height > 1) {
      width = Math.max(1, width / 2 | 0);
      height = Math.max(1, height / 2 | 0);

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texture.createView({ baseMipLevel, mipLevelCount: 1 }) },
        ],
      });

      ++baseMipLevel;

      const renderPassDescriptor: GPURenderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
          {
            view   : texture.createView({ baseMipLevel, mipLevelCount: 1 }),
            loadOp : 'clear',
            storeOp: 'store',
          },
        ],
      };

      const pass = encoder.beginRenderPass(renderPassDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);  // call our vertex shader 6 times
      pass.end();
    }

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  };
})();

export const gpuComputedVertex = (
  device: GPUDevice,
  modelMatrix: Float32Array,
  projection: Float32Array
) => {
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        label: "compute transform",
        code: `
          @group(0) @binding(0) var<storage, read> modelView: array<mat4x4<f32>>;
          @group(0) @binding(1) var<storage, read> projection: mat4x4<f32>;
          @group(0) @binding(2) var<storage, read_write> mvp: array<mat4x4<f32>>;
          @group(0) @binding(3) var<uniform> count: u32;
          
          @compute @workgroup_size(128)
          fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
              // Guard against out-of-bounds work group sizes
              let index = global_id.x;
              if (index >= count) {
                  return;
              }
          
              mvp[index] = projection * modelView[index];
          }
        `,
      }),
      entryPoint: "main",
    },
  });
};