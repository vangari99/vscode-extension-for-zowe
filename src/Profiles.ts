/*
* This program and the accompanying materials are made available under the terms of the *
* Eclipse Public License v2.0 which accompanies this distribution, and is available at *
* https://www.eclipse.org/legal/epl-v20.html                                      *
*                                                                                 *
* SPDX-License-Identifier: EPL-2.0                                                *
*                                                                                 *
* Copyright Contributors to the Zowe Project.                                     *
*                                                                                 *
*/

import { IProfileLoaded, Logger, CliProfileManager, IProfile, ISession, IUpdateProfile } from "@zowe/imperative";
import * as nls from "vscode-nls";
import * as path from "path";
import { URL } from "url";
import * as vscode from "vscode";
import * as zowe from "@zowe/cli";
import { ZoweExplorerApiRegister } from "./api/ZoweExplorerApiRegister";
import { getZoweDir } from "./extension";  // TODO: resolve cyclic dependency
import { IZoweTreeNode } from "./api/IZoweTreeNode";
import { IZoweTree } from "./api/IZoweTree";
import { errorHandling } from "./utils";
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

interface IUrlValidator {
    valid: boolean;
    host: string;
    port: number;
}

let IConnection: {
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    rejectUnauthorized: boolean;
};

let InputBoxOptions: vscode.InputBoxOptions;

export class Profiles {
    // Processing stops if there are no profiles detected
    public static async createInstance(log: Logger): Promise<Profiles> {
        Profiles.loader = new Profiles(log);
        await Profiles.loader.refresh();
        return Profiles.loader;
    }

    public static getInstance(): Profiles {
        return Profiles.loader;
    }

    private static loader: Profiles;

    public allProfiles: IProfileLoaded[] = [];
    public loadedProfile: IProfileLoaded;
    private profilesByType = new Map<string, IProfileLoaded[]>();
    private defaultProfileByType = new Map<string, IProfileLoaded>();
    private profileManagerByType= new Map<string, CliProfileManager>();
    private constructor(private log: Logger) {
    }

    public loadNamedProfile(name: string, type?: string): IProfileLoaded {
        for (const profile of this.allProfiles) {
            if (profile.name === name && (type ? profile.type === type : true)) {
                return profile;
            }
        }
        throw new Error(localize("loadNamedProfile.error.profileName", "Could not find profile named: ")
            + name + localize("loadNamedProfile.error.period", "."));
    }

    public getDefaultProfile(type: string = "zosmf"): IProfileLoaded {
        return this.defaultProfileByType.get(type);
    }

    public getProfiles(type: string = "zosmf"): IProfileLoaded[] {
        return this.profilesByType.get(type);
    }

    public async refresh(): Promise<void> {
        this.allProfiles = [];
        for (const type of ZoweExplorerApiRegister.getInstance().registeredApiTypes()) {
            const profileManager = await this.getCliProfileManager(type);
            const profilesForType = (await profileManager.loadAll()).filter((profile) => {
                return profile.type === type;
            });
            if (profilesForType && profilesForType.length > 0) {
                this.allProfiles.push(...profilesForType);
                this.profilesByType.set(type, profilesForType);
                this.defaultProfileByType.set(type, (await profileManager.load({ loadDefault: true })));
            }
        }
    }

    public validateAndParseUrl(newUrl: string): IUrlValidator {
        let url: URL;
        const validProtocols: string[] = ["https"];
        const DEFAULT_HTTPS_PORT: number = 443;

        const validationResult: IUrlValidator = {
            valid: false,
            host: null,
            port: null
        };

        try {
            url = new URL(newUrl);
        } catch (error) {
            return validationResult;
        }

        // overkill with only one valid protocol, but we may expand profile types and protocols in the future?
        if (!validProtocols.some((validProtocol: string) => url.protocol.includes(validProtocol))) {
            return validationResult;
        }

        // if port is empty, set https defaults
        if (!url.port.trim()) {
            validationResult.port = DEFAULT_HTTPS_PORT;
        }
        else {
            validationResult.port = Number(url.port);
        }

        validationResult.host = url.hostname;
        validationResult.valid = true;
        return validationResult;
    }

    public async getUrl(urlInputBox): Promise<string | undefined> {
        return new Promise<string | undefined> ((resolve) => {
            urlInputBox.onDidHide(() => { resolve(urlInputBox.value); });
            urlInputBox.onDidAccept(() => {
                if (this.validateAndParseUrl(urlInputBox.value).valid) {
                    resolve(urlInputBox.value);
                } else {
                    urlInputBox.validationMessage = localize("createNewConnection.invalidzosmfURL",
                        "Please enter a valid URL in the format https://url:port.");
                }
            });
        });
    }

    public async editSession(profileLoaded: IProfileLoaded, profileName: string): Promise<any| undefined> {
        const editSession = profileLoaded.profile;
        const editURL = "https://" + editSession.host+ ":" + editSession.port;
        const editUser = editSession.user;
        const editPass = editSession.password;

        const updUrl = await this.urlInfo(editURL);
        const updUser = await this.userInfo(editUser);
        const updPass = await this.passwordInfo(editPass);
        const updRU = await this.ruInfo();

        const updProfile = {
            host: updUrl.host,
            port: updUrl.port,
            user: updUser,
            password: updPass,
            rejectUnauthorized: updRU,
            base64EncodedAuth: null
        };

        try {
            const updSession = await zowe.ZosmfSession.createBasicZosmfSession(updProfile);
            updProfile.base64EncodedAuth = updSession.ISession.base64EncodedAuth;
            await this.updateProfile({profile: updProfile, name: profileName});
            vscode.window.showInformationMessage(localize("editConnection.success", "Profile " + profileName + " was updated"));

            return updProfile;

        } catch (error) {
            await errorHandling(error.message);
        }

    }

    public async createNewConnection(profileName: string, profileType: string ="zosmf"): Promise<string | undefined> {

        const newUrl = await this.urlInfo();
        const newUser = await this.userInfo();
        const newPass = await this.passwordInfo();
        const newRU = await this.ruInfo();


        for (const profile of this.allProfiles) {
            if (profile.name === profileName) {
                vscode.window.showErrorMessage(localize("createNewConnection.duplicateProfileName",
                    "Profile name already exists. Please create a profile using a different name"));
                return undefined;
            }
        }

        IConnection = {
            name: profileName,
            host: newUrl.host,
            port: newUrl.port,
            user: newUser,
            password: newPass,
            rejectUnauthorized: newRU
        };

        try {
            await zowe.ZosmfSession.createBasicZosmfSession(IConnection);
            await this.saveProfile(IConnection, IConnection.name, profileType);
            vscode.window.showInformationMessage("Profile " + profileName + " was created.");
            return profileName;
        } catch (error) {
            await errorHandling(error.message);
        }

    }

    public async promptCredentials(sessName, rePrompt?: boolean) {

        const loadProfile = this.loadNamedProfile(sessName.trim());
        const loadSession = loadProfile.profile as ISession;
        let repromptUser: any;
        let repromptPass: any;

        if (rePrompt) {
            repromptUser = loadSession.user;
            repromptPass = loadSession.password;
        }

        if (!loadSession.user || rePrompt) {

            const newUser = await this.userInfo(repromptUser);

            loadSession.user = loadProfile.profile.user = newUser;
        }

        if (!loadSession.password || rePrompt) {

            const newPass = await this.passwordInfo(repromptPass);

            loadSession.password = loadProfile.profile.password = newPass.trim();

        }

        try {
            const updSession = await zowe.ZosmfSession.createBasicZosmfSession(loadSession as IProfile);
            if (rePrompt) {
                await this.updateProfile(loadProfile);
            }
            return [updSession.ISession.user, updSession.ISession.password, updSession.ISession.base64EncodedAuth];
        } catch (error) {
            await errorHandling(error.message);
        }
    }

    // ** Functions for handling Profile Information */

    private async urlInfo(input?) {

        let zosmfURL: string;

        const urlInputBox = vscode.window.createInputBox();
        if (input) {
            urlInputBox.value = input;
        }
        urlInputBox.ignoreFocusOut = true;
        urlInputBox.placeholder = localize("createNewConnection.option.prompt.url.placeholder", "https://url:port");
        urlInputBox.prompt = localize("createNewConnection.option.prompt.url",
            "Enter a z/OSMF URL in the format 'https://url:port'.");

        urlInputBox.show();
        zosmfURL = await this.getUrl(urlInputBox);
        urlInputBox.dispose();

        if (!zosmfURL) {
            vscode.window.showInformationMessage(localize("createNewConnection.zosmfURL",
                "No valid value for z/OSMF URL. Operation Cancelled"));
            return undefined;
        }

        const zosmfUrlParsed = this.validateAndParseUrl(zosmfURL);

        return zosmfUrlParsed;
    }

    private async userInfo(input?) {

        let userName: string;

        if (input) {
            userName = input;
        }
        InputBoxOptions = {
            placeHolder: localize("createNewConnection.option.prompt.username.placeholder", "Optional: User Name"),
            prompt: localize("createNewConnection.option.prompt.username", "Enter the user name for the connection. Leave blank to not store."),
            value: userName
        };
        userName = await vscode.window.showInputBox(InputBoxOptions);

        if (userName === undefined) {
            vscode.window.showInformationMessage(localize("createNewConnection.undefined.username",
                "Operation Cancelled"));
            return;
        }

        return userName;
    }

    private async passwordInfo(input?) {

        let passWord: string;

        if (input) {
            passWord = input;
        }

        InputBoxOptions = {
            placeHolder: localize("createNewConnection.option.prompt.password.placeholder", "Optional: Password"),
            prompt: localize("createNewConnection.option.prompt.password", "Enter the password for the connection. Leave blank to not store."),
            password: true,
            value: passWord
        };
        passWord = await vscode.window.showInputBox(InputBoxOptions);

        if (passWord === undefined) {
            vscode.window.showInformationMessage(localize("createNewConnection.undefined.passWord",
                "Operation Cancelled"));
            return;
        }

        return passWord;
    }

    private async ruInfo() {

        let rejectUnauthorize: boolean;

        const quickPickOptions: vscode.QuickPickOptions = {
            placeHolder: localize("createNewConnection.option.prompt.ru.placeholder", "Reject Unauthorized Connections"),
            ignoreFocusOut: true,
            canPickMany: false
        };

        const selectRU = ["True - Reject connections with self-signed certificates",
            "False - Accept connections with self-signed certificates"];

        const ruOptions = Array.from(selectRU);

        const chosenRU = await vscode.window.showQuickPick(ruOptions, quickPickOptions);

        if (chosenRU === ruOptions[0]) {
            rejectUnauthorize = true;
        } else if (chosenRU === ruOptions[1]) {
            rejectUnauthorize = false;
        } else {
            vscode.window.showInformationMessage(localize("createNewConnection.rejectUnauthorize",
                "Operation Cancelled"));
            return undefined;
        }

        return rejectUnauthorize;
    }

    // ** Functions that Calls Get CLI Profile Manager  */

    private async updateProfile(ProfileInfo) {

        for (const type of ZoweExplorerApiRegister.getInstance().registeredApiTypes()) {
            const profileManager = await this.getCliProfileManager(type);
            this.loadedProfile = (await profileManager.load({ name: ProfileInfo.name }));
        }


        const OrigProfileInfo = this.loadedProfile.profile;
        const NewProfileInfo = ProfileInfo.profile;

        if (OrigProfileInfo.user) {
            OrigProfileInfo.user = NewProfileInfo.user;
        }

        if (OrigProfileInfo.password) {
            OrigProfileInfo.password = NewProfileInfo.password;
        }

        OrigProfileInfo.host = NewProfileInfo.host;
        OrigProfileInfo.port = NewProfileInfo.port;
        OrigProfileInfo.rejectUnauthorized = NewProfileInfo.rejectUnauthorized;
        OrigProfileInfo.base64EncodedAuth = NewProfileInfo.base64EncodedAuth;

        const updateParms: IUpdateProfile = {
            name: this.loadedProfile.name,
            merge: true,
            profile: OrigProfileInfo as IProfile
        };

        try {
            (await this.getCliProfileManager(this.loadedProfile.type)).update(updateParms);
        } catch (error) {
            vscode.window.showErrorMessage(error.message);
        }
    }

    private async saveProfile(ProfileInfo, ProfileName, ProfileType) {
        let zosmfProfile: IProfile;
        try {
            zosmfProfile = await (await this.getCliProfileManager(ProfileType)).save({ profile: ProfileInfo, name: ProfileName, type: ProfileType });
        } catch (error) {
            vscode.window.showErrorMessage(error.message);
        }
        return zosmfProfile.profile;
    }

    private async getCliProfileManager(type: string): Promise<CliProfileManager> {
        let profileManager = this.profileManagerByType.get(type);
        if (!profileManager) {
            profileManager = await new CliProfileManager({
                profileRootDirectory: path.join(getZoweDir(), "profiles"),
                type
            });
            if (profileManager) {
                this.profileManagerByType.set(type, profileManager);
            } else {
                return undefined;
            }
        }
        return profileManager;
    }
}

