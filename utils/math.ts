import { mat4, vec3 } from 'gl-matrix'

function getMvpMatrix(
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
  mat4.ortho(projectionMatrix, -1, +1, -1, +1, -1, +1);

  const mvpMatrix = mat4.create();
  mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);

  return mvpMatrix as Float32Array
}

function getPhotoCenterVertex(w: number, h: number) : Array<number> {
  const vertex = []
  // x y z | u v
  // 第一个三角面
  vertex.push(-(w / 2), -(h / 2), 0.0,  0.0, 1.0)
  vertex.push(+(w / 2), -(h / 2), 0.0,  1.0, 1.0)
  vertex.push(+(w / 2), +(h / 2), 0.0,  1.0, 0.0)

  // 第二个三角面
  vertex.push(-(w / 2), -(h / 2), 0.0,  0.0, 1.0)
  vertex.push(+(w / 2), +(h / 2), 0.0,  1.0, 0.0)
  vertex.push(-(w / 2), +(h / 2), 0.0,  0.0, 0.0)

  return vertex
}

function getWaterfallFlowNext(colInfo: [number, number, number, number][]) : { minColIndex: number, nextTop: boolean, nextBottom: boolean } {
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
 * @returns 
 */
function getGridLayoutVertex(photos: ISP_Photos, col: number, gap: number) {
  for (let photo of photos) {
    console.log("for:", photo.vertex[1])
  }

  const gridLayoutMatrix: ISP_LayoutData = new Array(col).fill('').map(() => []) // 用于存储每个格子的矩阵变换值信息 [x, y, z, index]
  const gridLayoutVertex: Float32Array = new Float32Array(6 * 5 * photos.length)  // 用于存储每个格子的中心顶点位置信息
  const gridLayoutCols: number[][] = new Array(col).fill('').map(() => []) // 用于存储每列的所有图像对应下标

  const isOddCol = col % 2 === 1 // 是否为奇数列
  const rowInfo: [leftX: number, rightX: number] = [0, 0]
  const colInfo: [topY: number, bottomY: number, totalHeight: number, x: number][] = []

  let offsetCol = isOddCol ? 1 : 0 // 偏移量，用于处理偶数列的特殊情况

  // 初始化所有列
  for (let i = 0; i < col; i++) {
    let [w, h] = photos[i].vertex
    // 中心点
    if (i === 0 && isOddCol) {
      const midIndex = Math.floor(col / 2)
      rowInfo[0] = -(w / 2 + gap / 2)
      rowInfo[1] = +(w / 2 + gap / 2)
      colInfo[midIndex] = [+(h / 2), -(h / 2), h, 0]
      gridLayoutMatrix[midIndex][0] = [0.0, 0.0, 0.0, i]
      continue
    }
    // 左边
    if (i % 2 === 0) {
      const colIndex = Math.floor(col / 2) - 1 - (i / 2 - offsetCol)
      rowInfo[0] -= i === offsetCol * 2 ? w / 2 + gap / 2 : w + gap
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[0]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[0], 0.0, 0.0, i]
    }
    // 右边
    if (i % 2 === 1) {
      const colIndex = Math.floor(col / 2) + (i - 1) / 2 + offsetCol
      rowInfo[1] += i === 1 ? w /2 + gap / 2 : w + gap
      colInfo[colIndex] = [+(h / 2), -(h / 2), h, rowInfo[1]]
      gridLayoutMatrix[colIndex][0] = [rowInfo[1], 0.0, 0.0, i]
    }
  }


  for (let i = col; i < photos.length; i++) {
    const h = photos[i].vertex[1]

    // 开始瀑布流计算
    const { minColIndex, nextTop, nextBottom } = getWaterfallFlowNext(colInfo)

    const currentOffsetY = h / 2 + gap // 当前图片顶点的自身偏移量
    const appendOffsetY = h + gap // 追加图片的偏移量
    const [topY, bottomY, , x] = colInfo[minColIndex]

    colInfo[minColIndex][2] += h // 更新高度总和

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

  // 按布局顺序填充顶点数据
  let count = 0
  for (let col of gridLayoutMatrix) {
    for (let colItem of col) {
      const [,,, index] = colItem
      const [w, h] = photos[index].vertex
      // 计算当前图片的中心点位置
      gridLayoutVertex.set(getPhotoCenterVertex(w, h), count * 6 * 5)
      count++
    }
  }

  console.log(gridLayoutMatrix)

  return { gridLayoutVertex, gridLayoutMatrix }
}

export { getMvpMatrix, getGridLayoutVertex }