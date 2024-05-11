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

function getGridLayout(col: number, row: number, w: number, h: number, gap: number) {
  const gridLayout = new Array(col) // 用于打印输出布局样式
  const transformData = new Array(col) // 用于存储每个格子的矩阵变换值

  let rowArea = [0.0, 0.0] // left x, right x

  for (let colIndex = 0; colIndex < col; colIndex++) {
    let colRowText = new Array(row)
    let colRowTransform = new Array(row)
    let colArea = [0.0, 0.0] // top y,  bottom y
    let appendColIndex = -1
    let isLeft = true

    // 左
    if (colIndex % 2 === 0) {
      isLeft = true
      appendColIndex = col / 2 - 1 - colIndex / 2
      if (rowArea[0] === 0) {
        rowArea[0] -= w / 2 + gap / 2
      } else {
        rowArea[0] -= w + gap
      }
    }
    
    // 右
    if (colIndex % 2 === 1) {
      isLeft = false
      appendColIndex = col / 2 + (colIndex - 1) / 2
      if (rowArea[1] === 0) {
        rowArea[1] += w / 2 + gap / 2
      } else {
        rowArea[1] += w + gap
      }
    }
    
    for (let rowIndex = 0; rowIndex < row; rowIndex++) {
      let appendRowIndex = -1;
      // 上
      if (rowIndex % 2 === 0) {
        // 第一次初始化
        if (colArea[0] === 0) {
          colArea[0] += h / 2 + gap / 2
        } else {
          colArea[0] += h + gap
        }
        
        appendRowIndex = row / 2 - 1 - rowIndex / 2
        colRowTransform[appendRowIndex] = [rowArea[isLeft? 0 : 1], colArea[0], 0.0]
      }
      // 下
      if (rowIndex % 2 === 1) {
        // 第一次初始化
        if (colArea[1] === 0) {
          colArea[1] -= h / 2 + gap / 2
        } else {
          colArea[1] -= h + gap
        }
        
        appendRowIndex = row / 2 + (rowIndex - 1) / 2
        colRowTransform[appendRowIndex] = [rowArea[isLeft? 0 : 1], colArea[1], 0.0]
      }
      console.log(`${appendColIndex}-${appendRowIndex}`)
      colRowText[appendRowIndex] = `${colIndex}-${rowIndex}`
    }
    transformData[appendColIndex] = colRowTransform
    gridLayout[appendColIndex] = colRowText
  }

  console.log(gridLayout)
  console.log(transformData)

  return transformData
}

function getTransformData(count: number, w: number, h: number, gap: number) {
  const transformData = []
  
}

export { getMvpMatrix, getGridLayout }