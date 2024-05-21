type Array2L<T> = [T, T]

type Array3L<T> = [T, T, T]

type Array4D3L<T> = [T, T, T, T][][]

type ISP_LayoutData = Array4D3L<number>

type ISP_Photos = ISP_Photo[]

interface ISP_Photo {
  img: ImageBitmap,
  src: string,
  rate: number,
  size: Array2L<number>,
  vertex: Array2L<number>,
}

interface ISP_Buffer {
  vertexBuffer?: GPUBuffer;
  mvpBuffer?: GPUBuffer;
  mvpGroup?: GPUBindGroup;
  textureGroup?: GPUBindGroup;
}

interface ISP_Locations {
  gridLayoutVertex?: Float32Array,
  gridLayoutMatrix?: ISP_LayoutData,
  gridLayoutTransform?: Float32Array,
}