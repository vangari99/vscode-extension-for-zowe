# Change Log

## `1.21.0`

- Added unit tests for the FTP USS functionality [#1582](https://github.com/zowe/vscode-extension-for-zowe/pull/1582) and [1596](https://github.com/zowe/vscode-extension-for-zowe/pull/1596). Thanks @tiantn and @JillieBeanSim
- Standardized the user interface and log messages with severity specifications using the Zowe Explorer API logger functions [#1518](https://github.com/zowe/vscode-extension-for-zowe/pull/1518). Thanks @katelynienaber

## `1.19.0`

- Added support for the validate profile and credential features [#1443](https://github.com/zowe/vscode-extension-for-zowe/pull/1443). Thanks @tiantn

## `1.16.1`

- Removed redundant entry from the `.vscodeignore` file in order to help generate the `extension.js` file for the VS Code Marketplace release

## `1.16.0`

- Added the function that closes the connection at the end of each FTP operation

## `1.15.0`

- Removed the installation pre-requisite of @zowe/zos-ftp-for-zowe-cli for the FTP Extension for Zowe Explorer

## `1.14.0`

- Added a range of jobs functionalities with zFTP profiles, including submit job, list job by jobID, list spool files, view spool file content, download spool files, and delete job.
- Added support for listing jobs with prefix `*` and owner `*`.

## `1.13.0`

- Added a range of data set functionalities including list datasets, list dataset members, edit datasets, upload members, rename datasets, delete datasets and more. For the complete list of added functionalities, see [PR-1219](https://github.com/zowe/vscode-extension-for-zowe/pull/1219).

## `1.11.1`

- Updated USS functionality to use the new zos-ftp-for-zowe-cli API.

## `1.5.0`

- Updated to API changes in Zowe Explorer 1.5.
- No need to click Refresh anymore after activation to see the ftp profiles.

## `1.3.1`

- Updates to support Zowe Explorer 1.3.1 with Zowe CLI 6.8.2.
- Updated to use @zowe/zos-ftp-for-zowe-cli" 1.0.1
- Renamed the repo to zowe-explorer-ftp-extension to prepare donation to Zowe.

## `1.2.0`

- First version showing FTP support for USS files
