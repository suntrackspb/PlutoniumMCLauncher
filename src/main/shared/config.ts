export type LauncherConfig = {
    backendBaseUrl: string
    appKey: string
    installDirName: string
}

export const config: LauncherConfig = {
    backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://109.172.87.212:5000',
    appKey: process.env.APP_KEY || 'your_secret_app_key_here',
    installDirName: process.env.INSTALL_DIR_NAME || 'PlutoniumLauncher'
}