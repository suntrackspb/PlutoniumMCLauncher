import si from 'systeminformation'
import { machineId } from 'node-machine-id'

export async function getHardwareIds(): Promise<{ pid: string; mid: string; hid: string }> {
    // pid: CPU id (фингерпринт модели + серийника если доступен)
    const cpu = await si.cpu()
    const pid = `${cpu.vendor}-${cpu.brand}-${cpu.family}-${cpu.model}-${cpu.stepping}`.replace(/\s+/g, '_')

    // mid: motherboard serial если доступен, иначе hash от данных платформы
    const baseboard = await si.baseboard()
    const midRaw = baseboard.serial || `${baseboard.manufacturer}-${baseboard.model}-${baseboard.version}`
    const mid = midRaw.replace(/\s+/g, '_')

    // hid: стабильный machineId ОС (cross-platform)
    const hid = await machineId()

    return { pid, mid, hid }
}