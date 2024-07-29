export default class FolderLocationsApp extends FormApplication {

    get type() {
        throw new Error("This method must be overridden in a subclass");
    }

    /* -------------------------------------------- */

    _activeSource = "data";
    _displayMode = "tiles";

    /* -------------------------------------------- */

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: "Folder Locations",
            template: "modules/intelligent-filepicker/templates/folder-locations.hbs",
            classes: ["filepicker", "intelligent-folder-locations"],
            width: 525,
            height: 'auto',
            tabs: [{navSelector: ".tabs"}],
            closeOnSubmit: true,
            submitOnChange: false,
            submitOnClose: true,
            resizable: true
        });
    }

    /** @override */
    get title() {
        let typeLabel = this.type.charAt(0).toUpperCase() + this.type.slice(1);
        return typeLabel + " Folder Locations";
    }

    /* -------------------------------------------- */

    /**
     * Return the source object for the currently active source
     * @type {object}
     */
    get source() {
        return new FilePicker().sources[this._activeSource];
    }

    /* -------------------------------------------- */

    /**
     * Return the target directory for the currently active source
     * @type {string}
     */
    get target() {
        return this.source.target;
    }

    /* -------------------------------------------- */

    _onChangeTab(event, tabs, active) {
        this._activeSource = active;
        this._currentPath = "";
        this.render();
    }

    /* -------------------------------------------- */

    _currentPath = "";
    async getData(options) {
        const context = await super.getData(options);
        context.folders = game.settings.get("intelligent-filepicker", this.type + "Folders");


        const result = await FilePicker.browse(this._activeSource, this._currentPath);

        // Sort directories alphabetically and store their paths
        let dirs = result.dirs.map(d => ({
            name: decodeURIComponent(d.split("/").pop()),
            path: d,
            private: result.private || result.privateDirs.includes(d)
        }));
        dirs = dirs.sort((a, b) => a.name.localeCompare(b.name));

        // Sort files alphabetically and store their client URLs
        let files = result.files.map(f => {
            let img = f;
            if ( VideoHelper.hasVideoExtension(f) ) img = "icons/svg/video.svg";
            else if ( AudioHelper.hasAudioExtension(f) ) img = "icons/svg/sound.svg";
            else if ( !ImageHelper.hasImageExtension(f) ) img = "icons/svg/book.svg";
            return {
                name: decodeURIComponent(f.split("/").pop()),
                url: f,
                img: img
            };
        });
        files = files.sort((a, b) => a.name.localeCompare(b.name));

        context.dirs = dirs;
        context.files = files;
        context.sources = new FilePicker().sources;
        context.target = result.target;
        context.source = this.source;
        context.canGoBack = this._currentPath.length > 0;
        context.displayMode = this._displayMode;
        context.favorites = FilePicker.favorites


        return context;
    }

    /* -------------------------------------------- */

    render(force, options) {
        if ( game.world && !game.user.can("FILES_BROWSE") ) return this;
        this.position.height = null;
        this.element.css({height: ""});
        this._tabs[0].active = this._activeSource;
        return super.render(force, options);
    }

    /* -------------------------------------------- */

    async _updateObject(event, formData) {
        // No action needed
    }

    /* -------------------------------------------- */

    activateListeners(html) {
        super.activateListeners(html);

        const form = html[0];

        // Header Control Buttons
        html.find(".current-dir button").click(this._onClickDirectoryControl.bind(this));

        // Change the S3 bucket
        html.find('select[name="bucket"]').change(this._onChangeBucket.bind(this));

        // Activate display mode controls
        const modes = html.find(".display-modes");
        modes.on("click", ".display-mode", this._onChangeDisplayMode.bind(this));
        for ( let li of modes[0].children ) {
            li.classList.toggle("active", li.dataset.mode === this.displayMode);
        }

        // Directory-level actions
        html.find(".directory").on("click", "li", this._onPick.bind(this));

        // Directory-level actions
        html.find(".favorites").on("click", "a", this._onClickFavorite.bind(this));

        // Flag the current pick
        let li = form.querySelector(`.file[data-path="${this.request}"]`);
        if ( li ) li.classList.add("picked");

        // Intersection Observer to lazy-load images
        const files = html.find(".files-list");
        const observer = new IntersectionObserver(this._onLazyLoadImages.bind(this), {root: files[0]});
        files.find("li.file").each((i, li) => observer.observe(li));

        html.find(".add-folder").click(this._addFolder.bind(this));
        html.find(".remove-folder").click(this._removeFolder.bind(this));
    }

    /* -------------------------------------------- */

    _onChangeDisplayMode(event) {
        event.preventDefault();
        const a = event.currentTarget;
        if ( !FilePicker.DISPLAY_MODES.includes(a.dataset.mode) ) {
            throw new Error("Invalid display mode requested");
        }
        if ( a.dataset.mode === this._displayMode ) return;
        this._displayMode = a.dataset.mode;
        this.render();
    }

    /* -------------------------------------------- */

    _onClickDirectoryControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        switch (action) {
            case "back":
                let target = this.target.split("/");
                target.pop();
                this._currentPath = target.join("/");
                return this.render();
        }
    }

    /* -------------------------------------------- */

    _onChangeBucket(event) {
        event.preventDefault();
        const select = event.currentTarget;
        this.sources.s3.bucket = select.value;
        this._currentPath = "";
        this._activeSource = "s3";
        return this.render();
    }

    /* -------------------------------------------- */

    _onPick(event) {
        const li = event.currentTarget;
        const form = li.closest("form");
        if ( li.classList.contains("dir") ) {
            this._currentPath = li.dataset.path;
            return this.render();
        }
        for ( let l of li.parentElement.children ) {
            l.classList.toggle("picked", l === li);
        }
        if ( form.file ) form.file.value = li.dataset.path;
    }

    /* -------------------------------------------- */

    _onLazyLoadImages(...args) {
        // Don't load images in list mode.
        if ( this.displayMode === "list" ) return;
        return SidebarTab.prototype._onLazyLoadImage.call(this, ...args);
    }

    /* -------------------------------------------- */

    async _onClickFavorite(event) {
        const action = event.currentTarget.dataset.action;
        const source = event.currentTarget.dataset.source || this._activeSource;
        const path = event.currentTarget.dataset.path || this._currentPath;
        let label = event.currentTarget.dataset.label || this._currentPath.split("/").pop();

        switch (action) {
            case "goToFavorite":
                this._activeSource = source;
                this._currentPath = path;
                return this.render();
                break;
            case "setFavorite":
                await FilePicker.setFavorite(source, path);
                break;
            case "removeFavorite":
                await FilePicker.removeFavorite(source, path);
                break;
            case "goToFolder":
                this._activeSource = source;
                this._currentPath = path;
                return this.render();
                break;
            case "addFolder":
                await this._addFolder(source, path, label);
                break;
            case "removeFolder":
                await this._removeFolder(source, path);
                break;
        }
    }

    /* -------------------------------------------- */

    async _addFolder(source, path, label) {
        const folders = game.settings.get("intelligent-filepicker", this.type + "Folders");

        if ( label == "" ) {
            ui.notifications.error("The base folder cannot be chosen, as it causes performance issues. Please choose a subfolder.");
            return;
        }

        // If this source + path already exist, do nothing
        if ( folders.find(f => f.source === source && f.path === path) ) return;
        folders.push({source, path, label});
        await game.settings.set("intelligent-filepicker", this.type + "Folders", folders);
        return this.render();
    }

    /* -------------------------------------------- */

    async _removeFolder(source, path) {
        const folders = game.settings.get("intelligent-filepicker", this.type + "Folders");
        // If this source + path don't exist, do nothing
        if ( !folders.find(f => f.source === source && f.path === path) ) return;
        folders.splice(folders.findIndex(f => f.source === source && f.path === path), 1);
        await game.settings.set("intelligent-filepicker", this.type + "Folders", folders);
        return this.render();
    }
}
