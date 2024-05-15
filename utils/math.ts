import { mat4, vec3 } from 'gl-matrix'

function getMvpMatrix(
  aspect = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1]
) {
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
  mat4.perspective(projectionMatrix, Math.PI / 4, aspect, 0, 1000);

  const mvpMatrix = mat4.create();
  mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);

  return mvpMatrix as Float32Array
}

function getPhotoCenterVertex(w: number, h: number) : Array<number> {
  const vertex = []
  
  // 第一个三角面
  vertex.push(-(w / 2), -(h / 2), -2.0)
  vertex.push(+(w / 2), -(h / 2), -2.0)
  vertex.push(+(w / 2), +(h / 2), -2.0)

  // 第二个三角面
  vertex.push(-(w / 2), -(h / 2), -2.0)
  vertex.push(+(w / 2), +(h / 2), -2.0)
  vertex.push(-(w / 2), +(h / 2), -2.0)

  return vertex
}

function getWaterfallFlowNext(colInfo: [number, number, number, number][]) : { minColIndex: number, nextTop: boolean, nextBottom: boolean } {
  let minColIndex = 0
  let nextTop = false
  let nextBottom = false

  let minHeight = colInfo[0][2]

  for (let i = 0; i < colInfo.length; i++) {
    const [top, bottom, totalHeight] = colInfo[i]
    if (totalHeight < minHeight) {
      minHeight = totalHeight
      minColIndex = i
      if (top - bottom >= 0) {
        nextTop = false
        nextBottom = true
      } else {
        nextTop = true
        nextBottom = false
      }
    }
  }
  return { minColIndex, nextTop, nextBottom }
}

/**
 * 先根据列数画往两边出一条垂直居中行
 * 在以瀑布流计算方式向两边上下追加排列
 * @param photos 图片列表
 * @param col 总列数
 * @param gap 图片之间的间距
 * @returns 
 */
function getGridLayoutVertex(photos: ISP_Photos, col: number, gap: number) {
  const gridLayoutMatrix: ISP_LayoutData = new Array(col).fill('').map(() => []) // 用于存储每个格子的矩阵变换值信息
  const gridLayoutVertex: Float32Array = new Float32Array(6 * 3 * photos.length)  // 用于存储每个格子的中心顶点位置信息

  const isOddCol = col % 2 === 1 // 是否为奇数列
  const rowInfo: [leftX: number, rightX: number] = [0, 0]
  const colInfo: [topY: number, bottomY: number, totalHeight: number, x: number][] = []

  let offsetCol = isOddCol ? 1 : 0 // 偏移量，用于处理偶数列的特殊情况

  // 初始化所有列
  for (let i = 0; i < col; i++) {
    let [w, h] = photos[i].vertex
    // 计算当前格子的中心点位置
    gridLayoutVertex.set(getPhotoCenterVertex(w, h), i * 6 * 3)

    console.log("vertex y:", gridLayoutVertex[i * 6 * 3 + 1])
    // 中心点
    if (i === 0 && isOddCol) {
      const midIndex = Math.floor(col / 2)
      rowInfo[0] = -(w / 2 + gap / 2)
      rowInfo[1] = +(w / 2 + gap / 2)
      colInfo[midIndex] = [+(h / 2), -(h / 2), h, 0]
      gridLayoutMatrix[midIndex][0] = [0.0, 0.0, 0.0]
      continue
    }
    // 左边
    if (i % 2 === 0) {
      const colIndex = Math.floor(col / 2) - 1 - (i / 2 - offsetCol)
      rowInfo[0] -= i === offsetCol * 2 ? w / 2 + gap / 2 : w + gap
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[0]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[0], 0.0, 0.0]
    }
    // 右边
    if (i % 2 === 1) {
      const colIndex = Math.floor(col / 2) + (i - 1) / 2 + offsetCol
      rowInfo[1] += i === 1 ? w /2 + gap / 2 : w + gap
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[1]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[1], 0.0, 0.0]
    }
  }

  // for (let i = col; i < photos.length; i++) {
  //   const [w, h] = photos[i].vertex

  //   // 计算当前格子的中心点位置
  //   gridLayoutVertex.set(getPhotoCenterVertex(w, h), i * 6 * 3)

  //   // // 开始瀑布流计算
  //   const { minColIndex, nextTop, nextBottom } = getWaterfallFlowNext(colInfo)
  //   // 往上追加
  //   if (nextTop) {
  //     colInfo[minColIndex][0] += h + gap // 更新上部分的高度范围
  //     colInfo[minColIndex][2] += h + gap // 更新高度总和
  //     gridLayoutMatrix[minColIndex].unshift([colInfo[minColIndex][3], colInfo[minColIndex][0], 0.0])
  //   }
  //   // 往下追加
  //   if (nextBottom) {
  //     colInfo[minColIndex][1] -= h + gap // 更新下部分的高度范围
  //     colInfo[minColIndex][2] += h + gap // 更新高度总和
  //     gridLayoutMatrix[minColIndex].push([colInfo[minColIndex][3], colInfo[minColIndex][1], 0.0])
  //   }
  // }

  return { gridLayoutVertex, gridLayoutMatrix }
}

export { getMvpMatrix, getGridLayout, getGridLayoutVertex }