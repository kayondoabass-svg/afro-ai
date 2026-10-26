// Portable, KEYO-owned typed-array CPU kernels. No platform or provider imports.
export function halfToFloat(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 31, mantissa = bits & 1023;
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return exponent ? sign * (1 + mantissa / 1024) * 2 ** (exponent - 15) : sign * mantissa * 2 ** -24;
}
export function matvec(tensor, vector, guard = () => {}) {
  if (tensor.multiply) return tensor.multiply(vector, guard);
  const [rows, cols] = tensor.shape;
  if (cols !== vector.length) throw new Error('Matrix/vector shape mismatch.');
  const result = new Float32Array(rows);
  for (let row = 0; row < rows; row++) {
    if ((row & 127) === 0) guard();
    let sum = 0;
    for (let col = 0; col < cols; col++) sum += tensor.data[row * cols + col] * vector[col];
    result[row] = sum;
  }
  return result;
}
export function normalize(x, weight, bias, epsilon, rms = false) {
  let mean = 0, variance = 0;
  if (!rms) mean = x.reduce((a,b) => a+b,0) / x.length;
  for (const value of x) variance += (value - mean) ** 2;
  const scale = 1 / Math.sqrt(variance / x.length + epsilon);
  return Float32Array.from(x, (value,i) => (value-mean)*scale*weight[i]+(bias?.[i]??0));
}
export function softmax(x) {
  const max = Math.max(...x);
  if (!Number.isFinite(max)) throw new Error('Non-finite attention scores.');
  const values = Float64Array.from(x, value => Math.exp(value-max));
  const sum = values.reduce((a,b) => a+b,0);
  return Float64Array.from(values, value => value/sum);
}
export const gelu = x => 0.5*x*(1+Math.tanh(Math.sqrt(2/Math.PI)*(x+0.044715*x**3)));
export function rotary(vector, position, headSize, theta) {
  const output = vector.slice();
  for (let base=0;base<vector.length;base+=headSize) for (let i=0;i<headSize/2;i++) {
    const angle=position/theta**(2*i/headSize),a=vector[base+i],b=vector[base+i+headSize/2];
    output[base+i]=a*Math.cos(angle)-b*Math.sin(angle);
    output[base+i+headSize/2]=b*Math.cos(angle)+a*Math.sin(angle);
  }
  return output;
}
