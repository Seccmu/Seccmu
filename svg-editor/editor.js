const projectVersion = 1;
const maxRows = 32;
const maxCells = 12;
const maxImageBytes = 4 * 1024 * 1024;
const imageTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const imageDataPattern = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/u;
const defaultFont = "Segoe UI, Arial, sans-serif";
const $ = (id) => document.getElementById(id);

function makeCell(fields = {}) {
    return {
        type: "text", weight: 1, text: "新内容", font: "", size: 13, fontWeight: "600",
        color: "#19372d", align: "left", swatch: "#24805e", pattern: "solid",
        image: "", imageAlt: "", fit: "contain", ...fields
    };
}

function makeRow(fields = {}) {
    return { height: 36, gap: 4, background: "#e3f3eb", paintBackground: false, cells: [makeCell()], ...fields };
}

function makeStarter() {
    const rubberRow = (label, model, swatch) => makeRow({
        height: 29, gap: 0, cells: [
            makeCell({ type: "swatch", swatch, weight: 7 }),
            makeCell({ text: label, weight: 21, size: 10, fontWeight: "700", color: "#466557" }),
            makeCell({ text: model, weight: 72 })
        ]
    });
    return {
        version: projectVersion, name: "table-tennis-setup", width: 404, padding: 6, radius: 13,
        background: "#f5fbf8", font: defaultFont, rows: [
            makeRow({ height: 34, paintBackground: true, cells: [
                makeCell({ text: "Butterfly Harimoto Tomokazu Innerforce ALC", size: 14, fontWeight: "700" })
            ] }),
            rubberRow("FOREHAND", "Butterfly Dignics 05", "#273532"),
            rubberRow("BACKHAND", "Butterfly Tenergy 64", "#c54b46")
        ]
    };
}

function integer(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

function string(value, max, fallback = "") {
    return typeof value === "string" ? value.slice(0, max) : fallback;
}

function option(value, values, fallback) {
    return values.includes(value) ? value : fallback;
}

function color(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

function normalizeCell(source) {
    const defaults = makeCell();
    const data = string(source.image, Math.ceil(maxImageBytes / 3) * 4 + 40);
    return makeCell({
        type: option(source.type, ["text", "swatch", "image", "empty"], defaults.type),
        weight: integer(source.weight, 1, 100, defaults.weight),
        text: string(source.text, 600, defaults.text),
        font: string(source.font, 120).trim(),
        size: integer(source.size, 8, 160, defaults.size),
        fontWeight: option(source.fontWeight, ["400", "600", "700"], defaults.fontWeight),
        color: color(source.color, defaults.color),
        align: option(source.align, ["left", "center", "right"], defaults.align),
        swatch: color(source.swatch, defaults.swatch),
        pattern: option(source.pattern, ["solid", "dots", "stripes"], defaults.pattern),
        image: imageDataPattern.test(data) && data === source.image ? data : "",
        imageAlt: string(source.imageAlt, 160),
        fit: option(source.fit, ["contain", "cover"], defaults.fit)
    });
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readProject(source) {
    if (!isRecord(source) || source.version !== projectVersion || !Array.isArray(source.rows)
        || source.rows.length < 1 || source.rows.length > maxRows) throw new Error("项目格式或版本不受支持。");

    const defaults = makeStarter();
    const rows = source.rows.map((row) => {
        if (!isRecord(row) || !Array.isArray(row.cells) || row.cells.length < 1
            || row.cells.length > maxCells || !row.cells.every(isRecord)) {
            throw new Error("每行必须至少有一列，最多十二列。");
        }
        return makeRow({
            height: integer(row.height, 22, 800, 36),
            gap: integer(row.gap, 0, 48, 4),
            background: color(row.background, "#e3f3eb"),
            paintBackground: row.paintBackground === true,
            cells: row.cells.map(normalizeCell)
        });
    });
    return {
        version: projectVersion,
        name: string(source.name, 100, defaults.name).trim() || defaults.name,
        width: integer(source.width, 160, 2400, defaults.width),
        padding: integer(source.padding, 0, 64, defaults.padding),
        radius: integer(source.radius, 0, 80, defaults.radius),
        background: color(source.background, defaults.background),
        font: string(source.font, 120, defaults.font).trim() || defaults.font,
        rows
    };
}

function readSvg(source) {
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    if (parsed.documentElement.namespaceURI !== svgNamespace || parsed.documentElement.localName !== "svg"
        || parsed.getElementsByTagName("parsererror").length) throw new Error("无法读取这份 SVG。");

    const metadata = parsed.querySelector(`metadata[id="${projectMetadataId}"]`);
    if (metadata) return readProject(JSON.parse(metadata.textContent));

    const ids = ["setup-title", "forehand", "backhand"];
    const texts = ids.map((id) => parsed.querySelector(`text[id="${id}"]`));
    if (texts.some((node) => !node)) {
        throw new Error("请选择此编辑器导出的 SVG，或仓库原有的三行装备卡。");
    }
    const result = makeStarter();
    result.width = Number(parsed.documentElement.getAttribute("width")) || result.width;
    result.rows[0].cells[0].text = texts[0].textContent;
    const style = parsed.getElementsByTagName("style")[0]?.textContent || "";
    const font = /\.card-type\s*\{[^}]*font-family:\s*([^;}]+)/u.exec(style);
    if (font) result.font = font[1].trim();

    for (const [index, name] of ids.slice(1).entries()) {
        const row = result.rows[index + 1];
        row.cells[2].text = texts[index + 1].textContent;
        const rule = new RegExp(`\\.` + name + `-swatch\\s*\\{[^}]*fill:\\s*([^;}]+)`, "u").exec(style);
        const fill = rule?.[1].trim();
        const patterns = { "url(#fine-dots)": "dots", "url(#diagonal-stripes)": "stripes" };
        row.cells[0].pattern = patterns[fill] || "solid";
        row.cells[0].swatch = color(fill, row.cells[0].swatch);
    }
    return readProject(result);
}

let project = makeStarter();
let rowIndex = 0;
let cellIndex = 0;
let previewUrl = "";
let previewFrame = 0;
let openRequest = 0;
const pendingImages = new WeakMap();
const selectedRow = () => project.rows[rowIndex];
const selectedCell = () => selectedRow().cells[cellIndex];

function notify(message, error = false) {
    $("status").textContent = message;
    $("status").dataset.error = String(error);
}

function updatePreview() {
    previewFrame = 0;
    const { svg, height } = renderCard(project);
    const previous = previewUrl;
    previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = $("preview-image");
    image.width = project.width;
    image.height = height;
    image.src = previewUrl;
    $("dimensions").textContent = `${project.width} × ${height} px`;
    if (previous) URL.revokeObjectURL(previous);
}

function queuePreview() {
    if (!previewFrame) previewFrame = requestAnimationFrame(updatePreview);
}

function updateFields(id, source) {
    for (const control of $(id).querySelectorAll("[data-field]")) {
        const value = source[control.dataset.field];
        if (control.type === "checkbox") control.checked = value;
        else control.value = value;
    }
}

function updateChoices(id, list, selected, label, onSelect) {
    $(id).replaceChildren(...list.map((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label(item, index);
        button.setAttribute("aria-pressed", String(index === selected));
        button.addEventListener("click", () => onSelect(index));
        return button;
    }));
}

function updateCellFields() {
    const cell = selectedCell();
    updateFields("cell-controls", cell);
    $("text-fields").hidden = cell.type !== "text";
    $("swatch-fields").hidden = cell.type !== "swatch";
    $("image-fields").hidden = cell.type !== "image";
    $("remove-image").disabled = !cell.image;
}

function updateSelections(focusId = "") {
    const row = selectedRow();
    const kinds = { text: "文字", image: "图片", swatch: "色块", empty: "留白" };
    updateChoices("rows", project.rows, rowIndex, (_, index) => `第 ${index + 1} 行`, (index) => {
        rowIndex = index;
        cellIndex = 0;
        updateSelections("rows");
    });
    updateChoices("cells", row.cells, cellIndex, (cell, index) => `${index + 1} · ${kinds[cell.type]}`, (index) => {
        cellIndex = index;
        updateSelections("cells");
    });
    updateFields("row-controls", row);
    updateCellFields();

    $("add-row").disabled = $("copy-row").disabled = project.rows.length >= maxRows;
    $("row-up").disabled = rowIndex === 0;
    $("row-down").disabled = rowIndex === project.rows.length - 1;
    $("remove-row").disabled = project.rows.length === 1;
    $("add-cell").disabled = row.cells.length >= maxCells;
    $("cell-left").disabled = cellIndex === 0;
    $("cell-right").disabled = cellIndex === row.cells.length - 1;
    $("remove-cell").disabled = row.cells.length === 1;
    if (focusId) $(focusId).querySelector('[aria-pressed="true"]')?.focus();
}

function watchFields(id, readTarget) {
    $(id).addEventListener("input", (event) => {
        const control = event.target;
        const field = control.dataset.field;
        if (!field) return;
        let value = control.value;
        if (control.type === "number") {
            if (!Number.isFinite(control.valueAsNumber)) return;
            value = integer(control.valueAsNumber, Number(control.min), Number(control.max));
        } else if (control.type === "checkbox") {
            value = control.checked;
        }
        const target = readTarget();
        target[field] = value;
        if (field === "type") updateSelections();
        queuePreview();
    });
    $(id).addEventListener("change", (event) => {
        const control = event.target;
        if (control.type === "number" && control.dataset.field) {
            control.value = readTarget()[control.dataset.field];
        }
    });
}

function placeRow(row) {
    if (project.rows.length >= maxRows) return;
    project.rows.splice(rowIndex + 1, 0, row);
    rowIndex += 1;
    cellIndex = 0;
    updateSelections("rows");
    queuePreview();
}

function moveItem(list, index, offset) {
    const destination = index + offset;
    if (destination < 0 || destination >= list.length) return index;
    const [item] = list.splice(index, 1);
    list.splice(destination, 0, item);
    return destination;
}

function moveRow(offset) {
    rowIndex = moveItem(project.rows, rowIndex, offset);
    updateSelections("rows");
    queuePreview();
}

function moveCell(offset) {
    cellIndex = moveItem(selectedRow().cells, cellIndex, offset);
    updateSelections("cells");
    queuePreview();
}

function readImage(file, type) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result));
        reader.addEventListener("error", () => reject(new Error("无法读取图片。")));
        reader.readAsDataURL(new Blob([file], { type }));
    });
}

async function attachImage(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const cell = selectedCell();
    const request = {};
    pendingImages.set(cell, request);
    try {
        const extension = file.name.split(".").at(-1).toLowerCase();
        const extensionType = Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : "";
        const type = Object.values(imageTypes).includes(file.type) ? file.type : extensionType;
        if (!type || file.size > maxImageBytes) throw new Error("请选择 4 MB 以内的 PNG、JPEG、WebP 或 GIF 图片。");
        const data = await readImage(file, type);
        if (!imageDataPattern.test(data)) throw new Error("图片格式不受支持。");
        const image = new Image();
        image.src = data;
        try {
            await image.decode();
        } catch {
            throw new Error("图片无法解码，请换一个文件。");
        }
        if (pendingImages.get(cell) !== request || !project.rows.some((row) => row.cells.includes(cell))) return;
        cell.image = data;
        cell.imageAlt ||= file.name.slice(0, 160);
        if (selectedCell() === cell) updateCellFields();
        notify(`已嵌入 ${file.name}。`);
        queuePreview();
    } catch (error) {
        if (pendingImages.get(cell) === request) notify(error.message, true);
    }
}

async function openProject(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const request = ++openRequest;
    try {
        const source = await file.text();
        if (request !== openRequest) return;
        const loaded = file.name.toLowerCase().endsWith(".svg")
            ? readSvg(source) : readProject(JSON.parse(source));
        project = loaded;
        rowIndex = 0;
        cellIndex = 0;
        updateFields("card-controls", project);
        updateSelections();
        queuePreview();
        notify(`已打开 ${file.name}。`);
    } catch (error) {
        if (request !== openRequest) return;
        notify(error instanceof SyntaxError ? "文件内容不是有效的项目数据。" : error.message, true);
    }
}

function download(content, extension, type) {
    const name = project.name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-").replace(/[. ]+$/u, "")
        || "svg-card";
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`已导出 ${link.download}。`);
}

$("add-row").addEventListener("click", () => placeRow(makeRow()));
$("copy-row").addEventListener("click", () => placeRow(structuredClone(selectedRow())));
$("row-up").addEventListener("click", () => moveRow(-1));
$("row-down").addEventListener("click", () => moveRow(1));
$("remove-row").addEventListener("click", () => {
    if (project.rows.length === 1) return;
    project.rows.splice(rowIndex, 1);
    rowIndex = Math.min(rowIndex, project.rows.length - 1);
    cellIndex = 0;
    updateSelections("rows");
    queuePreview();
});
$("add-cell").addEventListener("click", () => {
    const { cells } = selectedRow();
    if (cells.length >= maxCells) return;
    cells.splice(cellIndex + 1, 0, makeCell({ weight: selectedCell().weight }));
    cellIndex += 1;
    updateSelections("cells");
    queuePreview();
});
$("cell-left").addEventListener("click", () => moveCell(-1));
$("cell-right").addEventListener("click", () => moveCell(1));
$("remove-cell").addEventListener("click", () => {
    const { cells } = selectedRow();
    if (cells.length === 1) return;
    cells.splice(cellIndex, 1);
    cellIndex = Math.min(cellIndex, cells.length - 1);
    updateSelections("cells");
    queuePreview();
});
$("image-file").addEventListener("change", attachImage);
$("remove-image").addEventListener("click", () => {
    const cell = selectedCell();
    pendingImages.delete(cell);
    cell.image = "";
    cell.imageAlt = "";
    updateCellFields();
    queuePreview();
});
$("project-file").addEventListener("change", openProject);
$("save-project").addEventListener("click", () =>
    download(JSON.stringify(project, null, 2), "json", "application/json;charset=utf-8"));
$("save-svg").addEventListener("click", () =>
    download(renderCard(project, true).svg, "svg", "image/svg+xml;charset=utf-8"));

watchFields("card-controls", () => project);
watchFields("row-controls", selectedRow);
watchFields("cell-controls", selectedCell);
updateFields("card-controls", project);
updateSelections();
queuePreview();
