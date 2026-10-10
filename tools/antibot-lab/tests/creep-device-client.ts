import screen from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/screen/index'
import navigator from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/navigator/index'
import worker from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/worker/index'
import { getLies } from '../../../work/antibot-service/runtime/creepjs-10aa6724cd33a1015db1574211890518cd04f0cc/src/lies/index'
import { probeState } from './probe-deadline'

export async function probe() {
  const scope = await probeState(worker)
  const navigation = await probeState(() => navigator(scope.value))
  // WHY：navigator内部权限/GPU任一挂起，不应吞掉独立screen结果；超时保持未知。
  const display = await probeState(screen), permissions = navigation.value?.permissions
  return { screen: { validity: display.validity, lied: display.value?.lied ?? null },
    navigator: { validity: navigation.validity, lied: navigation.value?.lied ?? null },
    gpu: { validity: navigation.validity !== 'measured' ? navigation.validity : navigation.value?.webgpu ? 'measured' : 'unavailable' },
    permissions: { validity: navigation.validity !== 'measured' ? navigation.validity : permissions ? 'measured' : 'unavailable', states: permissions ?? {} },
    rules: getLies().data, workerAvailable: !!scope.value, workerValidity: scope.validity,
    rawFingerprintPersisted: false, humanIdentityProven: false }
}
