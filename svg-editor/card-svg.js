const svgNamespace = "http://www.w3.org/2000/svg";
const projectMetadataId = "seccmu-card-project";
const textMetrics = document.createElement("canvas").getContext("2d");

function xml(value) {
    return String(value)
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu, "")
        .replace(/[&<>"']/gu, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
        })[character]);
}

function wrapText(text, width, maxLines, font) {
    if (maxLines < 1 || width < 1) return [];
    textMetrics.font = font;
    const measure = (value) => textMetrics.measureText(value).width;
    const lines = [];

    for (const paragraph of text.split(/\r?\n/u)) {
        let line = "";
        for (const character of paragraph) {
            if (line && measure(line + character) > width) {
                const breakAt = line.lastIndexOf(" ");
                if (breakAt > 0 && character !== " ") {
                    lines.push(line.slice(0, breakAt));
                    line = line.slice(breakAt + 1) + character;
                    continue;
                }
                lines.push(line.trimEnd());
                line = character.trimStart();
                continue;
            }
            line += character;
        }
        lines.push(line.trimEnd());
    }

    const visible = lines.slice(0, maxLines);
    if (lines.length > visible.length) {
        const last = Array.from(visible.at(-1));
        while (last.length && measure(last.join("") + "…") > width) last.pop();
        visible[visible.length - 1] = last.join("").trimEnd() + "…";
    }
    return visible;
}

function renderCell(cell, box, key, defaultFont, definitions) {
    const { x, y, width, height } = box;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const clip = `clip-${key}`;

    if (cell.type === "swatch") {
        const size = Math.min(14, width, height - 4);
        let fill = cell.swatch;
        if (cell.pattern !== "solid") {
            const mark = cell.pattern === "dots"
                ? '<circle cx="2" cy="2" r=".8" fill="#fff" opacity=".62"/>'
                : '<path d="M0 0v4" stroke="#fff" stroke-width="1.6" opacity=".56"/>';
            const rotation = cell.pattern === "stripes" ? ' patternTransform="rotate(35)"' : "";
            definitions.push(`<pattern id="pattern-${key}" width="4" height="4" patternUnits="userSpaceOnUse"${rotation}><rect width="4" height="4" fill="${cell.swatch}"/>${mark}</pattern>`);
            fill = `url(#pattern-${key})`;
        }
        return `<rect x="${centerX - size / 2}" y="${centerY - size / 2}" width="${size}" height="${size}" rx="${Math.min(3, size / 4)}" fill="${fill}"/>`;
    }

    if (cell.type === "empty" || (cell.type === "image" && !cell.image)) return "";
    definitions.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);

    if (cell.type === "image") {
        const scale = cell.fit === "cover" ? "slice" : "meet";
        const title = cell.imageAlt ? `<title>${xml(cell.imageAlt)}</title>` : "";
        return `<g clip-path="url(#${clip})">${title}<image x="${x}" y="${y}" width="${width}" height="${height}" xlink:href="${cell.image}" preserveAspectRatio="xMidYMid ${scale}"/></g>`;
    }

    const inset = Math.min(7, width / 4);
    const font = cell.font || defaultFont;
    const lineHeight = cell.size * 1.22;
    const lines = wrapText(cell.text, width - 2 * inset, Math.floor((height - 2) / lineHeight),
        `${cell.fontWeight} ${cell.size}px ${font}`);
    const anchor = { left: "start", center: "middle", right: "end" }[cell.align];
    const textX = { left: x + inset, center: centerX, right: x + width - inset }[cell.align];
    const firstBaseline = centerY - ((lines.length - 1) * lineHeight) / 2 + cell.size * .34;
    const spans = lines.map((line, index) =>
        `<tspan x="${textX}" y="${firstBaseline + index * lineHeight}">${xml(line)}</tspan>`).join("");
    return `<text clip-path="url(#${clip})" fill="${cell.color}" font-family="${xml(font)}" font-size="${cell.size}" font-weight="${cell.fontWeight}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}

function renderCard(project, editable = false) {
    const definitions = [];
    const elements = [];
    const rowGap = 2;
    const contentWidth = project.width - 2 * project.padding;
    const height = project.rows.reduce((sum, row) => sum + row.height, 2 * project.padding)
        + rowGap * (project.rows.length - 1);
    const radius = Math.min(project.radius, height / 2);
    let y = project.padding;

    for (const [rowIndex, row] of project.rows.entries()) {
        if (row.paintBackground) {
            elements.push(`<rect x="${project.padding}" y="${y}" width="${contentWidth}" height="${row.height}" rx="${Math.min(8, row.height / 2)}" fill="${row.background}"/>`);
        }
        const splits = row.cells.length - 1;
        const gap = splits ? Math.min(row.gap, contentWidth / splits / 2) : 0;
        const weightedWidth = contentWidth - gap * splits;
        const totalWeight = row.cells.reduce((sum, cell) => sum + cell.weight, 0);
        let x = project.padding;

        for (const [cellIndex, cell] of row.cells.entries()) {
            const width = weightedWidth * cell.weight / totalWeight;
            const box = { x, y, width, height: row.height };
            elements.push(renderCell(cell, box, `${rowIndex}-${cellIndex}`, project.font.trim() || defaultFont, definitions));
            x += width + gap;
        }
        y += row.height + rowGap;
    }

    const labels = project.rows.flatMap((row) => row.cells.map((cell) =>
        cell.type === "text" ? cell.text : cell.type === "image" && cell.image ? cell.imageAlt : "")).filter(Boolean);
    const metadata = editable
        ? `<metadata id="${projectMetadataId}">${xml(JSON.stringify(project))}</metadata>` : "";
    const svg = `<svg xmlns="${svgNamespace}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${project.width}" height="${height}" viewBox="0 0 ${project.width} ${height}" role="img" aria-labelledby="svg-title svg-description">
  <title id="svg-title">${xml(project.name)}</title>
  <desc id="svg-description">${xml(labels.join(". "))}</desc>
  ${metadata}
  <defs>
    <clipPath id="card-bounds"><rect width="${project.width}" height="${height}" rx="${radius}"/></clipPath>
    ${definitions.join("\n    ")}
  </defs>
  <g clip-path="url(#card-bounds)">
    <rect width="${project.width}" height="${height}" fill="${project.background}"/>
    ${elements.filter(Boolean).join("\n    ")}
  </g>
  <rect x=".5" y=".5" width="${project.width - 1}" height="${height - 1}" rx="${Math.max(0, radius - .5)}" fill="none" stroke="#bad5c9"/>
</svg>
`;
    return { svg, height };
}
