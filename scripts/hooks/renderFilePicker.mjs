export default async function renderFilePicker(app, html, options) {
    const intelligentFilePickerTab = $("<a class='intelligent-filepicker'><i class='fa-solid fa-head-side-brain'></i> Intelligent Filepicker</a>");
    html.find("nav.tabs").append(intelligentFilePickerTab);
    const currentType = game.settings.get("intelligent-filepicker", "currentType");

    async function renderIntelligentFilepicker() {
        app.displayMode = "tiles";
        //app.result.files = files;
        await app.render();
    }

    // Hook up click event
    intelligentFilePickerTab.on('click', async (event) => {
        event.preventDefault();

        await game.settings.set("intelligent-filepicker", "displayed", true);
        await game.settings.set("intelligent-filepicker", "lastMode", app.displayMode);
        await renderIntelligentFilepicker();
    });

    // Hide intelligent file picker when the tab is not selected
    html.on("click", "nav.tabs .item", async (event) => {
        event.preventDefault();

        app.displayMode = game.settings.get("intelligent-filepicker", "lastMode");
        await game.settings.set("intelligent-filepicker", "displayed", false);
        app.render();
    });

    if ( game.settings.get("intelligent-filepicker", "displayed") ) {

        const accountStatus = await game.modules.get("intelligent-filepicker").api.getAccountStatus();
        if ( !accountStatus.hasPremium ) {
            ui.notifications.warn("You need to be a Gold Patron to use the Intelligent File Picker.");
            game.settings.set("intelligent-filepicker", "displayed", false);
            return app.render();
        }

        const files = await game.modules.get("intelligent-filepicker").api.allFiles(currentType);
        const allFileNames = new Set();
        for (const folder of files) {
            for (const file of folder.files) {
                allFileNames.add(`${folder.folder}/${file}`);
            }
        }

        // Unless there is a searchterm in the input, set the files to all files
        const currentSearchTerm = html.find("input[name='filter']").val();
        if ( !currentSearchTerm ) {
            app.result.files = Array.from(allFileNames);
        }


        app._element[0].classList.add("intelligent-filepicker-enabled");

        if ( app.displayMode !== "tiles" ) {
            return renderIntelligentFilepicker();
        }

        // Set .active on this element, and clear it on others
        html.find("nav.tabs .item").removeClass("active");
        intelligentFilePickerTab[0].classList.add("active");

        // Hide unused standard elements
        html.find(".display-modes").parent().hide();

        // Add a new type picker to the file picker
        const displayModes = $(`
            <div class='form-group'>
                <label>Type</label>
                <div class='form-fields display-modes folder-types'>
                    <a class='folder-type ${currentType == "icon" ? 'active' : ''}' data-mode='icon' data-tooltip="Icons"> <i class='fas fa-icons'></i></a>
                    <a class='folder-type ${currentType == "portrait" ? 'active' : ''}' data-mode='portrait' data-tooltip="Portraits"> <i class='fas fa-portrait'></i></a>
                    <a class='folder-type ${currentType == "token" ? 'active' : ''}' data-mode='token' data-tooltip="Tokens"> <i class='fas fa-chess-knight'></i></a>
                </div>
            </div>`);

        displayModes.find(".folder-type").on("click", async (event) => {
            event.preventDefault();
            const type = event.currentTarget.dataset.mode;

            // Clear the current search term
            html.find("input[name='filter']").val("");
            for (const filter of app._searchFilters) {
                filter.query = "";
            }

            await game.settings.set("intelligent-filepicker", "currentType", type);
            const files = await game.modules.get("intelligent-filepicker").api.allFiles(type);
            const allFileNames = new Set();
            for (const folder of files) {
                for (const file of folder.files) {
                    allFileNames.add(`${folder.folder}/${file}`);
                }
            }
            app.result.files = Array.from(allFileNames);
            await renderIntelligentFilepicker();
        });

        html.find(".filter-dir").before(displayModes);

        // Reset height of the file picker
        html.css("height", "auto");

        let searchTerm = "";

        const searchDelay = game.settings.get("intelligent-filepicker", "searchDelay");
        const debouncedSearch = foundry.utils.debounce(async () => {
            console.log("searching:", searchTerm, currentType)

            // Disable the filter input
            html.find("input[name='filter']").prop("disabled", true);

            // Inject a progress bar. Queries take about 6 seconds, so we will try to show some progress
            const progress = $(`<progress value="0" max="60">`);
            html.find(".filter-dir").after(progress);

            let progressWidth = 0;
            const progressInterval = setInterval(() => {
                progressWidth += 1;
                progress.val(progressWidth);
            }, 100);

            const searchFiles = foundry.utils.duplicate(files);
            let finalResults = [];

            // First, find results just by basic text contains
            // First, find results just by basic text contains
            for (const folder of searchFiles) {
                for (const file of folder.files) {
                    const confidence = file.includes(searchTerm) ? 0.85 : 0.7;
                    const reason = file.includes(searchTerm) ? "Name contains search term" : "Filepath contains search term";
                    if (folder.folder.toLowerCase().includes(searchTerm.toLowerCase()) || file.toLowerCase().includes(searchTerm.toLowerCase())) {
                        finalResults.push({
                            file: `${folder.folder}/${file}`,
                            confidence: confidence,
                            reason: reason
                        });

                        // Remove this file from the searchFiles array
                        const index = searchFiles.findIndex(f => f.folder === folder.folder);
                        if (index > -1) {
                            const newFiles = searchFiles[index].files.filter(f => f !== file);
                            if (newFiles.length === 0) {
                                searchFiles.splice(index, 1);
                            }
                            else {
                                searchFiles[index].files = newFiles;
                            }
                        }
                    }
                }
            }

            console.log("direct results", finalResults);

            // If we don't have an api key, skip the API call
            const apiKey = game.settings.get("intelligent-filepicker", "apiKey");
            const enabled = game.settings.get("intelligent-filepicker", "enabled");
            if ( apiKey && enabled ) {

                const result = await game.modules.get("intelligent-filepicker").api.searchFiles(searchTerm, searchFiles);
                console.dir("search result", result);
                // Filter out any files that do not actually exist in all files

                const allFilesArray = Array.from(allFileNames);
                for (const file of result) {

                    // If file.file starts with /, remove it
                    if (file.file.startsWith("/")) {
                        file.file = file.file.slice(1);
                    }

                    // If this file is not in the allFileNames set, try to repair it by looking for it in allFiles by name
                    if (!allFileNames.has(file.file)) {
                        const name = file.file.split("/").pop();
                        const match = allFilesArray.find(f => f.endsWith(name));
                        if (match) {
                            file.file = match;
                            // Lower the confidence
                            file.confidence -= 0.1;
                        } else {
                            file.confidence = -1;
                        }
                    }
                }

                finalResults = finalResults.concat(result);
            }

            const confidenceCutOff = game.settings.get("intelligent-filepicker", "confidenceCutoff");
            let filteredResults = finalResults
                .filter(f => f.confidence >= confidenceCutOff)
                .sort((a, b) => b.confidence - a.confidence)
                .map(f => f.file);

            // If filteredResults is empty, step down the threshold until we get at least one result
            let threshold = confidenceCutOff;
            while (filteredResults.length === 0 && threshold > 0) {
                threshold -= 0.1;
                filteredResults = finalResults
                    .filter(f => f.confidence >= threshold)
                    .sort((a, b) => b.confidence - a.confidence)
                    .map(f => f.file);
            }

            app.result.files = filteredResults;
            console.dir("filtered results", filteredResults);
            clearInterval(progressInterval);
            await app.render();
        }, searchDelay * 1000);

        // Hook up a custom text input handler
        html.find("input[name='filter']").on("input", async (event) => {
            event.preventDefault();
            searchTerm = event.currentTarget.value.trim();
            debouncedSearch();
        });
    }
    else {
        app._element[0].classList.remove("intelligent-filepicker-enabled");
    }
}
