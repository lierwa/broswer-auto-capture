export function requireNativeExecutable(bytes: Uint8Array, architecture: 'x64' | 'arm64') {
  const value = Buffer.from(bytes)
  // WHY：清单声明和文件名不证明原生架构；所有 Linux 执行制品须为实际 ELF64 对应机器。
  if (value.length < 64 || !value.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70]))
    || value[4] !== 2 || value[5] !== 1 || value.readUInt16LE(18) !== (architecture === 'arm64' ? 183 : 62))
    throw Error('runtime_native_executable_mismatch')
}
