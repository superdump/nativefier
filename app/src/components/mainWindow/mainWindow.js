import path from 'path';
import electron from 'electron';
import windowStateKeeper from 'electron-window-state';
import helpers from './../../helpers/helpers';
import createMenu from './../menu/menu';
import initContextMenu from './../contextMenu/contextMenu';

const {BrowserWindow, shell, ipcMain} = electron;
const {isOSX, linkIsInternal} = helpers;

const ZOOM_INTERVAL = 0.1;

/**
 *
 * @param {{}} options AppArgs from nativefier.json
 * @param {function} onAppQuit
 * @param {function} setDockBadge
 * @returns {electron.BrowserWindow}
 */
function createMainWindow(options, onAppQuit, setDockBadge) {
    const mainWindowState = windowStateKeeper({
        defaultWidth: options.width || 1280,
        defaultHeight: options.height || 800
    });

    const mainWindow = new BrowserWindow({
        width: mainWindowState.width,
        height: mainWindowState.height,
        x: mainWindowState.x,
        y: mainWindowState.y,
        'auto-hide-menu-bar': !options.showMenuBar,
        // Convert dashes to spaces because on linux the app name is joined with dashes
        title: options.name,
        'web-preferences': {
            javascript: true,
            plugins: true,
            // node globals causes problems with sites like messenger.com
            nodeIntegration: false,
            preload: path.join(__dirname, 'static', 'preload.js')
        },
        // after webpack path here should reference `resources/app/`
        icon: path.join(__dirname, '../', '/icon.png')
    });

    let currentZoom = 1;

    const onZoomIn = () => {
        currentZoom += ZOOM_INTERVAL;
        mainWindow.webContents.send('change-zoom', currentZoom);
    };

    const onZoomOut = () => {
        currentZoom -= ZOOM_INTERVAL;
        mainWindow.webContents.send('change-zoom', currentZoom);
    };

    createMenu(options.nativefierVersion, onAppQuit, mainWindow.webContents.goBack, mainWindow.webContents.goForward, onZoomIn, onZoomOut, mainWindow.webContents.getURL);
    initContextMenu(mainWindow);

    if (options.userAgent) {
        mainWindow.webContents.setUserAgent(options.userAgent);
    }

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('params', JSON.stringify(options));
    });

    if (options.counter) {
        mainWindow.on('page-title-updated', () => {
            if (mainWindow.isFocused()) {
                return;
            }

            if (options.counter) {
                const itemCountRegex = /[\(](\d*?)[\)]/;
                const match = itemCountRegex.exec(mainWindow.getTitle());
                if (match) {
                    setDockBadge(match[1]);
                }
                return;
            }
            setDockBadge('●');
        });
    }

    mainWindow.webContents.on('new-window', (event, urlToGo) => {
        if (mainWindow.useDefaultWindowBehaviour) {
            mainWindow.useDefaultWindowBehaviour = false;
            return;
        }

        if (linkIsInternal(options.targetUrl, urlToGo)) {
            return;
        }
        event.preventDefault();
        shell.openExternal(urlToGo);
    });

    mainWindow.loadURL(options.targetUrl);

    mainWindow.on('focus', () => {
        setDockBadge('');
    });

    mainWindow.on('close', event => {
        if (mainWindow.isFullScreen()) {
            mainWindow.setFullScreen(false);
            mainWindow.once('leave-full-screen', maybeHideWindow.bind(this, mainWindow, event));
        }
        maybeHideWindow(mainWindow, event);
    });

    mainWindowState.manage(mainWindow);
    return mainWindow;
}

ipcMain.on('cancelNewWindowOverride', () => {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(window => {
        window.useDefaultWindowBehaviour = false;
    });
});

function maybeHideWindow(window, event) {
    if (isOSX()) {
        // this is called when exiting from clicking the cross button on the window
        event.preventDefault();
        window.hide();
    }
    // will close the window on other platforms
}

export default createMainWindow;
