type Array2L<T> = [T, T]

type Array3L<T> = [T, T, T]

type Array3D3L<T> = [T, T, T][][]

type ISP_LayoutData = Array3D3L<number>

type ISP_Photos = ISP_Photo[]

interface ISP_Photo {
  img: ImageBitmap,
  rate: number,
  size: Array2L<number>,
  vertex: Array2L<number>,
}

interface ISP_Buffer {
  vertexBuffer?: GPUBuffer;
  mvpBuffer?: GPUBuffer;
  group?: GPUBindGroup;
}

interface ISP_Locations {
  gridLayoutVertex?: Float32Array,
  gridLayoutMatrix?: ISP_LayoutData,
  gridLayoutTransform?: Float32Array,
}