import API from "../../api.mjs";
import IconFolderLocationsApp from "../apps/IconFolderLocationsApp.mjs";
import PortraitFolderLocationsApp from "../apps/PortraitFolderLocationsApp.mjs";
import TokenFolderLocationsApp from "../apps/TokenFolderLocationsApp.mjs";

export async function init() {

    // attachTempPdfMethod();

    game.settings.register("intelligent-filepicker", "apiKey", {
        name: "Intelligent Filepicker API Key",
        hint: "You can get an API key by being a Patreon supporter at https://www.patreon.com/ironmoose.",
        scope: "world",
        default: "",
        config: true,
        type: String,
        requiresReload: true,
    });

    game.settings.register("intelligent-filepicker", "enabled", {
        name: "Enhance search with Intelligent Filepicker suggestions",
        hint: "Turn this off if you just want name based folder-deep search",
        scope: "client",
        default: true,
        config: true,
        type: Boolean
    });

    game.settings.register("intelligent-filepicker", "iconFolders", {
        scope: "world",
        config: false,
        default: [
            { "label": "icons", "path": "icons", "source": "public" },
        ],
        type: Array,
    });
    game.settings.registerMenu("intelligent-filepicker", "iconFolders", {
        name: "Icon Folders to search",
        label: "Icon Folders to search",
        icon: "fas fa-folder",
        type: IconFolderLocationsApp,
        restricted: true,
    });

    game.settings.register("intelligent-filepicker", "portraitFolders", {
        scope: "world",
        config: false,
        default: [],
        type: Array,
    });
    game.settings.registerMenu("intelligent-filepicker", "portraitFolders", {
        name: "Portrait Folders to search",
        label: "Portrait Folders to search",
        icon: "fas fa-folder",
        type: PortraitFolderLocationsApp,
        restricted: true,
    });

    game.settings.register("intelligent-filepicker", "tokenFolders", {
        scope: "world",
        config: false,
        default: [],
        type: Array,
    });
    game.settings.registerMenu("intelligent-filepicker", "tokenFolders", {
        name: "Token Folders to search",
        label: "Token Folders to search",
        icon: "fas fa-folder",
        type: TokenFolderLocationsApp,
        restricted: true,
    });

    game.settings.register("intelligent-filepicker", "confidenceCutoff", {
        name: "Confidence Cutoff",
        hint: "The minimum confidence level for the intelligent file picker to display a result. Lower this value to see more results, but they will be less relevant.",
        scope: "user",
        config: true,
        default: 0.6,
        type: Number,
        range: {
            min: 0,
            max: 1,
            step: 0.05,
        }
    });

    game.settings.register("intelligent-filepicker", "searchDelay", {
        name: "Search Delays",
        hint: "How long to wait (in seconds) after the user stops typing before searching for results.",
        scope: "user",
        config: true,
        default: 0.5,
        type: Number,
        range: {
            min: 0,
            max: 3,
            step: 0.1,
        }
    });

    game.settings.register("intelligent-filepicker", "filesCache", {
        scope: "world",
        config: false,
        default: {},
        type: Object,
    });

    game.settings.register("intelligent-filepicker", "displayed", {
        scope: "client",
        config: false,
        default: true,
        type: Boolean,
    });

    game.settings.register("intelligent-filepicker", "lastMode", {
        scope: "client",
        config: false,
        default: "tiles",
        type: String,
    });

    game.settings.register("intelligent-filepicker", "currentType", {
        scope: "client",
        config: false,
        default: "icon",
        type: String,
    });

    game.modules.get("intelligent-filepicker")["api"] = new API();
}

function cleanText(text) {
    // Clean out /n and /r
    text = text.replaceAll("\n", " ").replaceAll("\r", " ");

    // Clean out extra spaces
    while (text.includes("  ")) {
        text = text.replaceAll("  ", " ");
    }
    return text;
}

function attachTempPdfMethod() {
    window.journalToPdf = function (journalId) {
        const journal = game.journal.get(journalId);
        if (!journal) {
            ui.notifications.error("Journal not found");
            return;
        }

        const pageWidth = 8.5,
            lineHeight = 1.2,
            margin = 0.5,
            maxLineWidth = pageWidth - margin * 2,
            fontSize = 12,
            ptsPerInch = 72,
            oneLineHeight = (fontSize * lineHeight) / ptsPerInch;

        const doc = new jspdf.jsPDF({
            unit: "in",
            lineHeight: lineHeight,
            fontSize: fontSize,
        }).setProperties({title: journal.name});

        let firstPage = true;

        for (let page of journal.pages) {
            if (!firstPage) doc.addPage("a4", "1");
            firstPage = false;

            // doc.html(page.text.content, {
            //     callback: function (doc) {
            //         console.log(doc);
            //         doc.save("html.pdf");
            //     },
            //     x: 10,
            //     y: 10,
            // });

            let htmlContent = page.text.content;
            // Load a DOM tree into a parser to get just the text
            let parser = new DOMParser();
            let htmlDoc = parser.parseFromString(htmlContent, "text/html");
            let textContent = htmlDoc.body.textContent.replaceAll(/\n/g, " ");

            // Replace UUID references such as @UUID[JournalEntry.k5b3J8XntDD4aDgY.JournalEntryPage.5x3UCj7aIBRhxCpk]{Cait's
            // Rest} with just the name
            textContent = textContent.replaceAll(/@UUID\[.+\]\{(.+?)\}/g, "$1");

            // Add the page title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(fontSize + 2);
            doc.text(page.name, margin, margin);

            const textLines = doc
                .setFont("helvetica", "normal")
                .setFontSize(fontSize)
                .splitTextToSize(textContent, maxLineWidth);
            doc.text(textLines, margin, margin + 2 * oneLineHeight);
        }

        doc.save(`${journal.name}.pdf`);
    }

}
