export const IPC_CHANNELS = {
    AUTH_LOGIN: 'auth/login',
    AUTH_REGISTER: 'auth/register',
    AUTH_LOAD: 'auth/loadTokens',
    MODS_LIST: 'mods/list',
    MODS_LIST_WITH_STATUS: 'mods/listWithStatus',
    MODS_SYNC_REQUIRED: 'mods/syncRequired',
    MODS_INSTALL: 'mods/install',
    MODS_REMOVE: 'mods/remove',
    CLIENT_INFO: 'client/info',
    CLIENT_INSTALL: 'client/install',
    CLIENT_IS_INSTALLED: 'client/isInstalled',
    CLIENT_REINSTALL: 'client/reinstall',
    SERVER_STATUS: 'server/status',
    GAME_VALIDATE_JAVA: 'game/validateJava',
    GAME_LAUNCH: 'game/launch',
    GAME_OPEN_DIR: 'game/openDir',
    SYSTEM_RAM: 'system/ram'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]