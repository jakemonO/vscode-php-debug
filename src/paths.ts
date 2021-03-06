import fileUrl = require('file-url')
import * as url from 'url'
import * as path from 'path'
import { decode } from 'urlencode'
import RelateUrl from 'relateurl'

/**
 * Options to make sure that RelateUrl only outputs relative URLs and performs not other "smart" modifications.
 * They would mess up things like prefix checking.
 */
const RELATE_URL_OPTIONS: RelateUrl.Options = {
    // Make sure RelateUrl does not prefer root-relative URLs if shorter
    output: RelateUrl.PATH_RELATIVE,
    // Make sure RelateUrl does not remove trailing slash if present
    removeRootTrailingSlash: false,
    // Make sure RelateUrl does not remove default ports
    defaultPorts: {},
}

/**
 * Like `path.relative()` but for URLs.
 * Inverse of `url.resolve()` or `new URL(relative, base)`.
 */
const relativeUrl = (from: string, to: string): string => RelateUrl.relate(from, to, RELATE_URL_OPTIONS)

/** converts a server-side XDebug file URI to a local path for VS Code with respect to source root settings */
export function convertDebuggerPathToClient(
    fileUri: string | url.Url,
    pathMapping?: { [index: string]: string }
): string {
    let localSourceRoot: string | undefined
    let serverSourceRoot: string | undefined
    if (typeof fileUri === 'string') {
        fileUri = url.parse(fileUri)
    }
    // convert the file URI to a path
    let serverPath = decode(fileUri.pathname!)
    // strip the trailing slash from Windows paths (indicated by a drive letter with a colon)
    const serverIsWindows = /^\/[a-zA-Z]:\//.test(serverPath)
    if (serverIsWindows) {
        serverPath = serverPath.substr(1)
    }
    if (pathMapping) {
        for (const mappedServerPath of Object.keys(pathMapping)) {
            const mappedLocalSource = pathMapping[mappedServerPath]
            // normalize slashes for windows-to-unix
            const serverRelative = (serverIsWindows ? path.win32 : path.posix).relative(mappedServerPath, serverPath)
            if (serverRelative.indexOf('..') !== 0) {
                serverSourceRoot = mappedServerPath
                localSourceRoot = mappedLocalSource
                break
            }
        }
    }
    let localPath: string
    if (serverSourceRoot && localSourceRoot) {
        // get the part of the path that is relative to the source root
        const pathRelativeToSourceRoot = (serverIsWindows ? path.win32 : path.posix).relative(
            serverSourceRoot,
            serverPath
        )
        // resolve from the local source root
        localPath = path.resolve(localSourceRoot, pathRelativeToSourceRoot)
    } else {
        localPath = path.normalize(serverPath)
    }
    return localPath
}

/** converts a local path from VS Code to a server-side XDebug file URI with respect to source root settings */
export function convertClientPathToDebugger(localPath: string, pathMapping?: { [index: string]: string }): string {
    let localSourceRoot: string | undefined
    let serverSourceRoot: string | undefined
    // XDebug always lowercases Windows drive letters in file URIs
    let localFileUri = fileUrl(
        localPath.replace(/^[A-Z]:\\/, match => match.toLowerCase()),
        { resolve: false }
    )
    let serverFileUri: string
    if (pathMapping) {
        for (const mappedServerPath of Object.keys(pathMapping)) {
            const mappedLocalSource = pathMapping[mappedServerPath]
            const localRelative = path.relative(mappedLocalSource, localPath)
            if (localRelative.indexOf('..') !== 0) {
                serverSourceRoot = mappedServerPath
                localSourceRoot = mappedLocalSource
                break
            }
        }
    }
    if (localSourceRoot) {
        localSourceRoot = localSourceRoot.replace(/^[A-Z]:\\/, match => match.toLowerCase())
    }
    if (serverSourceRoot) {
        serverSourceRoot = serverSourceRoot.replace(/^[A-Z]:\\/, match => match.toLowerCase())
    }
    if (serverSourceRoot && localSourceRoot) {
        let localSourceRootUrl = fileUrl(localSourceRoot, { resolve: false })
        if (!localSourceRootUrl.endsWith('/')) {
            localSourceRootUrl += '/'
        }
        let serverSourceRootUrl = fileUrl(serverSourceRoot, { resolve: false })
        if (!serverSourceRootUrl.endsWith('/')) {
            serverSourceRootUrl += '/'
        }
        // get the part of the path that is relative to the source root
        const urlRelativeToSourceRoot = relativeUrl(localSourceRootUrl, localFileUri)
        // resolve from the server source root
        serverFileUri = url.resolve(serverSourceRootUrl, urlRelativeToSourceRoot)
    } else {
        serverFileUri = localFileUri
    }
    return serverFileUri
}

function isWindowsUri(path: string): boolean {
    return /^file:\/\/\/[a-zA-Z]:\//.test(path)
}

export function isSameUri(clientUri: string, debuggerUri: string): boolean {
    if (isWindowsUri(clientUri) || isWindowsUri(debuggerUri)) {
        // compare case-insensitive on Windows
        return debuggerUri.toLowerCase() === clientUri.toLowerCase()
    } else {
        return debuggerUri === clientUri
    }
}
