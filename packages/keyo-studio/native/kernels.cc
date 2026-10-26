#include <node_api.h>
#include <array>
#include <cmath>
#include <cstring>

// KEYO's own scalar CPU kernel. No external inference/math runtime is linked.
// Double accumulation, without fast-math/FMA, matches the JavaScript reference.
static const std::array<float, 65536> half = [] {
  std::array<float, 65536> table{};
  for (unsigned n = 0; n < table.size(); ++n) {
    const int exponent = (n >> 10) & 31, fraction = n & 1023;
    float value = exponent == 31 ? (fraction ? NAN : INFINITY)
      : exponent == 0 ? std::ldexp(float(fraction), -24)
      : std::ldexp(float(1024 + fraction), exponent - 25);
    table[n] = n & 32768 ? -value : value;
  }
  return table;
}();

static napi_value fail(napi_env env) {
  napi_throw_type_error(env, nullptr, "Invalid native matrix block or vector.");
  return nullptr;
}

static napi_value multiply(napi_env env, napi_callback_info info) {
  napi_value args[4], buffer;
  size_t argc = 4, count, cols, offset;
  void *weights, *input;
  napi_typedarray_type wt, vt;
  double rowNumber;
  char dtype[8]{}; size_t length;
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 4 ||
      napi_get_typedarray_info(env, args[0], &wt, &count, &weights, &buffer, &offset) != napi_ok ||
      napi_get_typedarray_info(env, args[1], &vt, &cols, &input, &buffer, &offset) != napi_ok ||
      napi_get_value_double(env, args[2], &rowNumber) != napi_ok ||
      napi_get_value_string_utf8(env, args[3], dtype, sizeof(dtype), &length) != napi_ok)
    return fail(env);
  const bool f32 = std::strcmp(dtype, "F32") == 0;
  const bool f16 = std::strcmp(dtype, "F16") == 0;
  const bool bf16 = std::strcmp(dtype, "BF16") == 0;
  if (length != (bf16 ? 4 : 3) || (!f32 && !f16 && !bf16) || vt != napi_float32_array ||
      wt != (f32 ? napi_float32_array : napi_uint16_array) ||
      !std::isfinite(rowNumber) || rowNumber < 1 || rowNumber > 131072 ||
      std::floor(rowNumber) != rowNumber || cols < 1 || cols > 65536 ||
      count != size_t(rowNumber) * cols || count * (f32 ? 4 : 2) > 262144)
    return fail(env);
  const size_t rows = size_t(rowNumber);
  float *output;
  if (napi_create_arraybuffer(env, rows * sizeof(float),
      reinterpret_cast<void **>(&output), &buffer) != napi_ok) return fail(env);
  const auto vector = static_cast<const float *>(input);
  for (size_t row = 0; row < rows; ++row) {
    double sum = 0;
    for (size_t col = 0; col < cols; ++col) {
      const size_t i = row * cols + col;
      float weight;
      if (f32) weight = static_cast<const float *>(weights)[i];
      else if (f16) weight = half[static_cast<const unsigned short *>(weights)[i]];
      else {
        unsigned bits = unsigned(static_cast<const unsigned short *>(weights)[i]) << 16;
        std::memcpy(&weight, &bits, sizeof(weight));
      }
      sum += double(weight) * double(vector[col]);
    }
    output[row] = float(sum);
  }
  napi_value result;
  if (napi_create_typedarray(env, napi_float32_array, rows, buffer, 0, &result) != napi_ok)
    return fail(env);
  return result;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  if (napi_create_function(env, "multiply", NAPI_AUTO_LENGTH, multiply, nullptr, &fn) != napi_ok)
    return nullptr;
  napi_set_named_property(env, exports, "multiply", fn);
  return exports;
}
