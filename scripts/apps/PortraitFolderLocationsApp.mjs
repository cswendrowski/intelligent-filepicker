import FolderLocationsApp from "./FolderLocationsApp.mjs";

export default class PortraitFolderLocationsApp extends FolderLocationsApp {

    /** @override */
    get type() {
        return "portrait";
    }
}
