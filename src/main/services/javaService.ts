export function getRequiredJavaVersion(minecraftVersion: string): number {
    // Нормализуем, берём только X.Y.Z
    const [majorStr, minorStr = '0', patchStr = '0'] = minecraftVersion.split('.')
    const major = parseInt(majorStr, 10)
    const minor = parseInt(minorStr, 10)
    const patch = parseInt(patchStr, 10)

    // Утилита сравнения
    const cmp = (a: [number, number, number], b: [number, number, number]) => {
        if (a[0] !== b[0]) return a[0] - b[0]
        if (a[1] !== b[1]) return a[1] - b[1]
        return a[2] - b[2]
    }
    const v: [number, number, number] = [major, minor, patch]

    // Правила (минимальная Java)
    // 1.0-1.8 → 8
    if (cmp(v, [1, 9, 0]) < 0) return 8
    // 1.9-1.12.2 → 8
    if (cmp(v, [1, 13, 0]) < 0) return 8
    // 1.13-1.17 → 8 (или 11), берём 8 как минимально допустимую
    if (cmp(v, [1, 18, 0]) < 0) return 8
    // 1.18-1.18.1 → 17
    if (cmp(v, [1, 18, 2]) < 0) return 17
    // 1.18.2-1.19.x → 17
    if (cmp(v, [1, 20, 0]) < 0) return 17
    // 1.20 - 1.21.0 → 17
    if (cmp(v, [1, 21, 1]) < 0) return 17
    // 1.21.1 и новее → 21
    return 21
}