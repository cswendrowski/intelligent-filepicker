

export default class API {

    DEBUG = false;
    LOW = false;
    OUT = false;
    NEEDS_KEY = false;

    constructor() {
        this._apiKey = game.settings.get("intelligent-filepicker", "apiKey");
        if ( !this._apiKey ) this.NEEDS_KEY = true;
        this._baseUrl = this.DEBUG ? "http://localhost:7245/api" :
            "https://intelligentnpcs.azurewebsites.net/api";
    }

    /* -------------------------------------------- */

    getHeaders(body) {
        let headers = {
            "x-api-key": this._apiKey,
            "x-version": "1.0.0"
        };
        // If the body is not a FormData object, we set the content type to JSON
        if (!(body instanceof FormData)) headers.contentType = "application/json";
        return headers;
    }

    /* -------------------------------------------- */

    async callApi(url, body, options={
            method: "POST",
            deserializeResult: true,
            skipErrors: false
        })
    {

        if ( this.NEEDS_KEY ) {
            throw new Error("Set a valid API Key");
        }
        if ( this.OUT ) {
            throw new Error("Out of messages");
        }

        let params = {
            method: options.method,
            headers: this.getHeaders(body)
        };
        if ( options.method === "POST" && body ) {
            params.body = body;
        }
        const response = await fetch(this._baseUrl + url + "?code=I_ZasRU0hlvW5Q8y7zzYl4ZLnc3S8F9roA6H0I-idQuuAzFuUd5Srw==&clientId=module", params);

        // If this is a 401, the user needs to set their API key
        if ( response.status === 401 ) {
            if (!options.skipErrors) ui.notifications.error("You need to set your Intelligent Filepicker API key in the module settings.", {permanent: true});
            this.NEEDS_KEY = true;
            throw new Error("No API key");
        }

        // If this is a 403, the API key is valid but not active
        else if ( response.status === 403 ) {
            if (!options.skipErrors) ui.notifications.error("Your Intelligent Filepicker API key is not active. Please consider supporting the module on Patreon at https://www.patreon.com/ironmoose.", {permanent: true});
            this.NEEDS_KEY = true;
            throw new Error("API key not active");
        }

        // If this is a 404, the API key is not valid
        else if ( response.status === 404 ) {
            if (!options.skipErrors) ui.notifications.error("Your Intelligent Filepicker API key is invalid. Please double check your entry.", {permanent: true});
            this.NEEDS_KEY = true;
            throw new Error("Invalid API key");
        }

        // If this is a 429, we've run out of messages
        else if ( response.status === 429 ) {
            if (!options.skipErrors) ui.notifications.error("You have run out of messages for Intelligent Filepicker. Please consider supporting the module on Patreon at a higher tier for additional requests or purchasing messages via our Website.", {permanent: true});
            this.OUT = true;
            throw new Error("Out of messages");
        }

        // If this is a 503, the API is overloaded
        else if ( response.status === 503 ) {
            if (!options.skipErrors) ui.notifications.error("The Intelligent Filepicker API is overloaded. Please try again in a short bit.");
            throw new Error("API overloaded");
        }

        // Read headers
        const remaining = response.headers.get("x-monthly-requests-remaining");
        if ( !this.LOW && remaining && (parseInt(remaining) <= 20) ) {
            this.LOW = true;
            if (!options.skipErrors) ui.notifications.warn("You are running low on messages for Intelligent Filepicker. Please consider supporting the module on Patreon at a higher tier for additional requests.", {permanent: true});
        }

        if (response.ok) {
            if (options.deserializeResult) {
                const data = await response.json();
                return data;
            }
            else {
                return;
            }
        } else {
            if (!options.skipErrors) ui.notifications.error("Failed to call API");
            console.log(response);
        }
    }

    /* -------------------------------------------- */

    async getAccountStatus() {
        const response = await this.callApi("/AccountStatus", JSON.stringify({}), {
            method: "GET",
            deserializeResult: true
        });
        return response;
    }

    /* -------------------------------------------- */

    async searchFiles(searchTerm, folders) {
        const results = [];

        const searchStartTime = performance.now();

        let skipErrors = false;
        const sendBatch = async () => {
            return this.callApi("/Filepicker", JSON.stringify({
                searchTerm: searchTerm,
                folders: batch
            }), {
                method: "POST",
                deserializeResult: true,
                skipErrors: skipErrors
            }).then(response => {
                results.push(...response.results);
            }).catch(error => {
                console.error("Error during API call: ", error);
            });
        }

        // Chunk the requests into batches of 1000 files or less
        let batch = [];
        let batchSize = 0;
        let pendingRequests = [];
        for ( const folder of folders ) {
            batch.push(folder);
            batchSize += folder.files.length;

            if ( batchSize > 1000 ) {
                pendingRequests.push(sendBatch());
                skipErrors = true;
                batch = [];
                batchSize = 0;
            }
        }

        // Send the last batch if it has files
        if (batchSize > 0) {
            pendingRequests.push(sendBatch());
        }

        // Await all pending requests
        await Promise.all(pendingRequests).catch(error => {
            console.error("Error during API calls: ", error);
        });

        console.log("base results", results);
        const searchEndTime = performance.now();
        console.log(`Search took ${searchEndTime - searchStartTime}ms`);

        // Response is an array of files, sorted by confidense
        return results.sort((a, b) => b.confidence - a.confidence);
    }

    /* -------------------------------------------- */

    async allFiles(type) {

        // If we have a cache, return that
        const cache = game.settings.get("intelligent-filepicker", "filesCache");
        if ( cache && cache[type] && Object.keys(cache[type]).length ) {
            return cache[type];
        }

        // Otherwise, load the cache
        return await this.loadFileCache(type);
    }

    /* -------------------------------------------- */

    async loadAllFileCaches() {
        await this.loadFileCache("icon");
        await this.loadFileCache("portrait");
        await this.loadFileCache("token");
    }

    /* -------------------------------------------- */

    async loadFileCache(type) {
        let allFiles = [];

        // We want to store a list of folders and their contents
        async function discover(source, target) {
            console.log("Discovering", source, target)
            const result = await FilePicker.browse(source, target);
            if ( result.files.length > 0 ) {
                allFiles.push({
                    folder: target,
                    files: result.files.filter(f => !f.endsWith(".svg")).map(f => f.replace(target + "/", ""))
                })
            }

            for ( const dir of result.dirs ) {
                await discover(source, dir);
            }
        }

        const folders = game.settings.get("intelligent-filepicker", type + "Folders");
        for ( const folder of folders ) {
            await discover(folder.source, folder.path);
        }

        const cache = game.settings.get("intelligent-filepicker", "filesCache");
        cache[type] = allFiles;
        game.settings.set("intelligent-filepicker", "filesCache", cache);
        return allFiles;
    }
}
