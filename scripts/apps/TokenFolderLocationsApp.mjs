import FolderLocationsApp from "./FolderLocationsApp.mjs";

export default class TokenFolderLocationsApp extends FolderLocationsApp {

    /** @override */
    get type() {
        return "token";
    }
}
