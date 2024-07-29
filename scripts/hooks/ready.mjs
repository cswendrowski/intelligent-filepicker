export default async function ready() {
    await game.modules.get("intelligent-filepicker").api.loadAllFileCaches();
}
