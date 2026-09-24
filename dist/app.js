"use strict";

const FILE_SPECS = {
  mtOrder: { label: "美团订单", kind: "order", platform: "美团", required: ["日期", "门店id", "门店名称", "商品信息", "下单时间", "订单状态", "订单编号"], optional: ["门店所在城市", "订单实付", "商品原价", "包装费", "活动信息", "神抢手用券核销订单", "神抢手一口价商品订单"] },
  eleOrder: { label: "饿了么订单", kind: "order", platform: "饿了么", required: ["日期", "门店编号", "门店名称", "商品信息", "下单时间", "订单状态", "订单单号"], optional: ["门店所在城市", "顾客实付", "菜品原价", "餐盒费"] },
  mtProduct: { label: "美团商品", kind: "product", platform: "美团", required: ["日期", "商品名", "门店名称", "门店id", "商品销量", "商品销售额"] },
  eleProduct: { label: "饿了么商品", kind: "product", platform: "饿了么", required: ["日期", "商品名称", "门店名称", "门店编号", "销量", "销售额"] },
};

const HEADER_ALIASES = {
  "日期": ["统计日期", "交易日期", "下单日期"],
  "门店名称": ["门店名", "店铺名称", "店铺名"],
  "门店id": ["门店ID", "门店编号", "店铺ID", "店铺编号"],
  "门店编号": ["门店ID", "门店id", "店铺编号", "店铺ID"],
  "商品名": ["商品名称", "菜品名称", "菜品名"],
  "商品名称": ["商品名", "菜品名称", "菜品名"],
  "商品销量": ["销量", "销售数量", "售出数量"],
  "销量": ["商品销量", "销售数量", "售出数量"],
  "商品销售额": ["销售额", "销售金额", "商品销售金额"],
  "销售额": ["商品销售额", "销售金额", "商品销售金额"],
  "订单编号": ["订单单号", "订单号"],
  "订单单号": ["订单编号", "订单号"],
  "门店所在城市": ["城市", "城市名称", "门店城市"],
  "订单实付": ["顾客实付", "用户实付", "订单实际支付"],
  "顾客实付": ["订单实付", "用户实付", "订单实际支付"],
  "商品原价": ["菜品原价", "商品原价金额"],
  "菜品原价": ["商品原价", "商品原价金额"],
  "包装费": ["餐盒费", "打包费"],
  "餐盒费": ["包装费", "打包费"],
};

const state = {
  files: { mtOrder: null, eleOrder: null, mtProduct: null, eleProduct: null },
  parsed: {},
  results: [],
  busy: false,
  bucketSettings: { min: 20, max: 80, step: 5 },
};

const MT_PRICE_QTY_RE = /,单价([\d.]+)\*数量(\d+(?:\.\d+)?)/g;
const MT_ACTIVITY_PRICE_RE = /购买(.+?)原价([\d.]+)元现价([\d.]+)元/g;
const ELE_PRICE_QTY_RE = /_(\d+(?:\.\d+)?)\*([\d.]+)/g;
const PACKAGE_TOKENS = ["套餐", "双杯", "+", "＋", "超大杯美式4选2"];
const PRODUCT_ALIASES = new Map([
  ["超大杯美式·红宝石瑰夏（双杯套餐）", "超大杯美式·红宝石瑰夏（双杯）"],
]);
const ZH_COLLATOR = new Intl.Collator("zh-CN");
const ELE_ADDONS = new Set([
  "加长白山天然椴树蜜", "浓缩加份", "加手作祁红茉香茶蜜", "黄油牛乳", "咸芝士奶盖（分装）",
  "加牛奶", "加燕麦奶", "浓度加份", "黄油香草厚乳", "加椰浆",
]);
const DETAIL_COLUMNS = ["日期", "平台", "门店ID", "门店名称", "城市", "订单单号", "下单时间", "小时", "商品种类数", "商品总件数", "商品总件数（套餐拆开）", "商品信息", "商品组合", "顾客实付", "营业额", "区间", "订单数"];
const HOURLY_PRODUCT_COLUMNS = ["日期", "平台", "门店ID", "门店名称", "小时", "商品名称", "销量", "销售额"];
const HOURLY_COMBO_COLUMNS = ["日期", "平台", "门店ID", "门店名称", "小时", "商品组合", "订单数", "商品种类数"];
const PRODUCT_COLUMNS = ["日期", "平台", "门店名称", "门店id", "商品名", "商品销量", "商品销售额", "备注"];

const els = {
  generate: document.getElementById("generateBtn"),
  clear: document.getElementById("clearBtn"),
  bulkInput: document.getElementById("bulkInput"),
  bulkDropzone: document.getElementById("bulkDropzone"),
  bucketMin: document.getElementById("bucketMin"),
  bucketMax: document.getElementById("bucketMax"),
  bucketStep: document.getElementById("bucketStep"),
  bucketPreview: document.getElementById("bucketPreview"),
  bucketSettings: document.querySelector(".bucket-settings"),
  resetBucket: document.getElementById("resetBucketBtn"),
  alert: document.getElementById("alert"),
  readyCount: document.getElementById("readyCount"),
  orderPairStatus: document.getElementById("orderPairStatus"),
  productPairStatus: document.getElementById("productPairStatus"),
  results: document.getElementById("results"),
  resultCards: document.getElementById("resultCards"),
  resultTime: document.getElementById("resultTime"),
};

document.querySelectorAll("[data-file-input]").forEach((input) => {
  input.addEventListener("change", () => input.files[0] && loadFile(input.dataset.fileInput, input.files[0]));
});

els.bulkInput.addEventListener("change", () => {
  if (els.bulkInput.files.length) loadBulkFiles([...els.bulkInput.files]);
});

for (const name of ["dragenter", "dragover"]) {
  els.bulkDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    els.bulkDropzone.classList.add("dragover");
  });
}
for (const name of ["dragleave", "drop"]) {
  els.bulkDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    els.bulkDropzone.classList.remove("dragover");
  });
}
els.bulkDropzone.addEventListener("drop", (event) => {
  const files = [...event.dataTransfer.files];
  if (files.length) loadBulkFiles(files);
});

document.querySelectorAll(".dropzone").forEach((zone) => {
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) loadFile(zone.dataset.key, file);
  });
});

els.generate.addEventListener("click", generateAvailableReports);
els.clear.addEventListener("click", clearAll);
for (const input of [els.bucketMin, els.bucketMax, els.bucketStep]) input.addEventListener("input", updateBucketPreview);
els.resetBucket.addEventListener("click", () => {
  els.bucketMin.value = "20";
  els.bucketMax.value = "80";
  els.bucketStep.value = "5";
  updateBucketPreview();
});

function showAlert(message, type = "info") {
  els.alert.textContent = message;
  els.alert.className = `alert show${type === "error" ? " error" : ""}`;
}

function hideAlert() {
  els.alert.className = "alert";
  els.alert.textContent = "";
}

function pairState(first, second, element) {
  const count = Number(Boolean(state.files[first])) + Number(Boolean(state.files[second]));
  element.className = "pair-status";
  if (count === 2) {
    element.textContent = "已就绪";
    element.classList.add("ready");
  } else if (count === 1) {
    element.textContent = "还差1个文件";
    element.classList.add("partial");
  } else {
    element.textContent = "等待文件";
  }
}

function updateUi() {
  const count = Object.values(state.files).filter(Boolean).length;
  els.readyCount.textContent = `${count} / 4`;
  pairState("mtOrder", "eleOrder", els.orderPairStatus);
  pairState("mtProduct", "eleProduct", els.productPairStatus);
  const hasOrderPair = state.files.mtOrder && state.files.eleOrder;
  const hasProductPair = state.files.mtProduct && state.files.eleProduct;
  els.generate.disabled = state.busy || !(hasOrderPair || hasProductPair);
}

function clearAll() {
  for (const key of Object.keys(state.files)) {
    state.files[key] = null;
    delete state.parsed[key];
    const zone = document.querySelector(`[data-key="${key}"]`);
    zone.classList.remove("loaded", "invalid");
    zone.querySelector(".file-state").textContent = "未选择";
    zone.querySelector("input").value = "";
  }
  els.bulkInput.value = "";
  for (const result of state.results) URL.revokeObjectURL(result.url);
  state.results = [];
  els.results.hidden = true;
  els.resultCards.replaceChildren();
  hideAlert();
  updateUi();
}

function applyLoadedFile(key, file, parsed) {
  const zone = document.querySelector(`[data-key="${key}"]`);
  const fileState = zone.querySelector(".file-state");
  state.files[key] = file;
  state.parsed[key] = parsed;
  zone.classList.remove("invalid");
  zone.classList.add("loaded");
  const range = parsed.dateMin && parsed.dateMax ? ` · ${parsed.dateMin} 至 ${parsed.dateMax}` : "";
  const rowCount = parsed.rawRowCount && parsed.rawRowCount !== parsed.rows.length
    ? `${parsed.rows.length.toLocaleString()}行可用数据 / ${parsed.rawRowCount.toLocaleString()}行源数据`
    : `${parsed.rows.length.toLocaleString()}行`;
  fileState.textContent = `${file.name} · ${rowCount}${range}`;
}

async function loadBulkFiles(files) {
  const excelFiles = files.filter((file) => /\.xlsx?$/i.test(file.name));
  if (!excelFiles.length) {
    showAlert("请选择 .xlsx 或 .xls 文件", "error");
    return;
  }
  els.bulkDropzone.classList.add("processing");
  els.bulkDropzone.querySelector(".bulk-action").textContent = `正在识别 0 / ${excelFiles.length}`;
  hideAlert();
  const loaded = [];
  const failed = [];
  try {
    let completed = 0;
    for (let start = 0; start < excelFiles.length; start += 2) {
      const batch = excelFiles.slice(start, start + 2);
      const results = await Promise.all(batch.map(async (file) => {
        try {
          const identified = await parseWorkbook(file, likelySpecEntries(file.name));
          return { file, identified };
        } catch (error) {
          return { file, error };
        } finally {
          completed += 1;
          els.bulkDropzone.querySelector(".bulk-action").textContent = `正在识别 ${completed} / ${excelFiles.length}`;
        }
      }));
      for (const result of results) {
        if (result.identified) {
          applyLoadedFile(result.identified.key, result.file, result.identified.parsed);
          loaded.push(FILE_SPECS[result.identified.key].label);
        } else failed.push(result.file.name);
      }
      updateUi();
      await nextFrame();
    }
    if (failed.length) {
      showAlert(`已识别${loaded.length}个文件；以下文件无法按现有表头识别：${failed.join("、")}`, "error");
    } else {
      showAlert(`已自动识别：${loaded.join("、")}。可直接生成报表，也可以单独替换文件。`);
    }
  } finally {
    els.bulkDropzone.classList.remove("processing");
    els.bulkDropzone.querySelector(".bulk-action").textContent = "选择多个Excel";
    els.bulkInput.value = "";
    updateUi();
  }
}

function likelySpecEntries(filename) {
  const entries = Object.entries(FILE_SPECS);
  if (filename.includes("商品")) return entries.filter(([, spec]) => spec.kind === "product");
  if (filename.includes("订单")) return entries.filter(([, spec]) => spec.kind === "order");
  return entries;
}

async function loadFile(key, file) {
  const zone = document.querySelector(`[data-key="${key}"]`);
  const fileState = zone.querySelector(".file-state");
  zone.classList.remove("loaded", "invalid");
  fileState.textContent = "正在识别…";
  hideAlert();
  try {
    if (!/\.xlsx?$/i.test(file.name)) throw new Error("请选择 .xlsx 或 .xls 文件");
    const identified = await parseWorkbook(file, [[key, FILE_SPECS[key]]]);
    applyLoadedFile(key, file, identified.parsed);
  } catch (error) {
    state.files[key] = null;
    delete state.parsed[key];
    zone.classList.add("invalid");
    fileState.textContent = "识别失败";
    showAlert(`${FILE_SPECS[key].label}：${error.message}`, "error");
  }
  updateUi();
}

async function parseWorkbook(file, specEntries) {
  const productOnly = specEntries.every(([, spec]) => spec.kind === "product");
  if (/\.xlsx$/i.test(file.name) && (file.size >= 40 * 1024 * 1024 || productOnly)) return parseLargeXlsx(file, specEntries);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
  let best = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    repairSheetRef(sheet);
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });
    for (let headerIndex = 0; headerIndex < Math.min(matrix.length, 50); headerIndex += 1) {
      const candidate = bestHeaderCandidate(matrix[headerIndex], specEntries, file.name);
      if (candidate && (!best || candidate.score > best.score)) best = { ...candidate, sheetName, matrix, headerIndex };
    }
  }
  if (!best && /\.xlsx$/i.test(file.name)) return parseLargeXlsx(file, specEntries);
  if (!best) throw unrecognizedWorkbookError(specEntries);
  return { key: best.key, parsed: parsedFromMatrix(best) };
}

function normalizeHeader(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "").replace(/[（(][^）)]*[）)]/g, "").replace(/[：:]/g, "");
}

function headerAliases(target) {
  return [target, ...(HEADER_ALIASES[target] || [])].map(normalizeHeader);
}

function headerMapping(headers, spec) {
  const normalized = headers.map(normalizeHeader);
  const mapping = new Map();
  let score = 0;
  for (const target of spec.required) {
    const aliases = headerAliases(target);
    const exact = normalized.indexOf(normalizeHeader(target));
    const index = exact >= 0 ? exact : normalized.findIndex((header) => aliases.includes(header));
    if (index < 0) return null;
    mapping.set(target, index);
    score += exact >= 0 ? 4 : 1;
  }
  for (const target of spec.optional || []) {
    const aliases = headerAliases(target);
    const exact = normalized.indexOf(normalizeHeader(target));
    const index = exact >= 0 ? exact : normalized.findIndex((header) => aliases.includes(header));
    if (index >= 0) mapping.set(target, index);
  }
  return { mapping, score };
}

function filenameScore(filename, spec) {
  const name = filename.toLowerCase();
  if (name.includes(spec.platform.toLowerCase())) return 3;
  if (spec.platform === "饿了么" && /(?:订单|商品)下载/.test(name)) return 2;
  if (spec.platform === "美团" && /(?:订单|商品)_全部门店|mtora/.test(name)) return 2;
  return 0;
}

function bestHeaderCandidate(row, specEntries, filename) {
  const headers = (row || []).map((value) => text(value));
  let best = null;
  for (const [key, spec] of specEntries) {
    const match = headerMapping(headers, spec);
    if (!match) continue;
    const score = match.score + filenameScore(filename, spec);
    if (!best || score > best.score) best = { key, spec, headers, mapping: match.mapping, score };
  }
  return best;
}

function mappedRecord(row, mapping) {
  const record = {};
  for (const [target, index] of mapping) record[target] = row[index];
  return record;
}

function parsedResult(sheetName, headers, rows) {
  let dateMin = "";
  let dateMax = "";
  for (const row of rows) {
    const date = dateText(row["日期"]);
    if (!date) continue;
    if (!dateMin || date < dateMin) dateMin = date;
    if (!dateMax || date > dateMax) dateMax = date;
  }
  return { sheetName, headers, rows, dateMin, dateMax };
}

function parsedFromMatrix(candidate) {
  const rows = candidate.matrix.slice(candidate.headerIndex + 1)
    .filter((row) => row.some((value) => value !== null && value !== ""))
    .map((row) => mappedRecord(row, candidate.mapping));
  return parsedResult(candidate.sheetName, [...candidate.mapping.keys()], rows);
}

function unrecognizedWorkbookError(specEntries) {
  const fields = [...new Set(specEntries.flatMap(([, spec]) => spec.required))];
  return new Error(`未识别到可用数据字段，请检查文件内容。可识别字段包括：${fields.join("、")}`);
}

async function parseLargeXlsx(file, specEntries) {
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持超大Excel流式读取，请使用最新版Chrome或Edge");
  const entries = await zipEntries(file);
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const sharedEntry = entryByName.get("xl/sharedStrings.xml");
  const sharedStrings = sharedEntry ? parseSharedStrings(await zipEntryText(file, sharedEntry)) : [];
  const sheetNames = await workbookSheetNames(file, entryByName);
  const worksheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => Number(a.name.match(/sheet(\d+)/)[1]) - Number(b.name.match(/sheet(\d+)/)[1]));

  for (const entry of worksheetEntries) {
    let candidate = null;
    let wanted = null;
    let inspectedRows = 0;
    let rawRowCount = 0;
    let preExcludedCount = 0;
    const rows = [];
    await consumeWorksheetRows(file, entry, sharedStrings, () => wanted, (row) => {
      if (!candidate) {
        inspectedRows += 1;
        candidate = bestHeaderCandidate(row, specEntries, file.name);
        if (candidate) wanted = new Set(candidate.mapping.values());
        return Boolean(candidate) || inspectedRows < 50;
      }
      if (!row.some((value) => value !== null && value !== "" && value !== undefined)) return true;
      rawRowCount += 1;
      const record = mappedRecord(row, candidate.mapping);
      if (candidate.spec.kind === "product") {
        const productField = candidate.key === "mtProduct" ? "商品名" : "商品名称";
        const quantityField = candidate.key === "mtProduct" ? "商品销量" : "销量";
        if (!text(record[productField]) || number(record[quantityField]) === 0) {
          preExcludedCount += 1;
          return true;
        }
      }
      rows.push(record);
      return true;
    });
    if (!candidate) continue;
    const sheetNumber = Number(entry.name.match(/sheet(\d+)/)[1]);
    const parsed = parsedResult(sheetNames.get(sheetNumber) || `sheet${sheetNumber}`, [...candidate.mapping.keys()], rows);
    parsed.rawRowCount = rawRowCount;
    parsed.preExcludedCount = preExcludedCount;
    return { key: candidate.key, parsed };
  }
  throw unrecognizedWorkbookError(specEntries);
}

async function zipEntries(file) {
  const tailSize = Math.min(file.size, 65557);
  const tail = new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail[index] === 0x50 && tail[index + 1] === 0x4b && tail[index + 2] === 0x05 && tail[index + 3] === 0x06) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("Excel文件结构不完整，未找到ZIP目录");
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  const bytes = new Uint8Array(await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  const entries = [];
  let offset = 0;
  while (offset + 46 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function zipEntryStream(file, entry) {
  const local = new DataView(await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
  if (local.getUint32(0, true) !== 0x04034b50) throw new Error(`Excel文件结构不完整：${entry.name}`);
  const dataOffset = entry.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const compressed = file.slice(dataOffset, dataOffset + entry.compressedSize).stream();
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return compressed.pipeThrough(new DecompressionStream("deflate-raw"));
  throw new Error(`暂不支持Excel压缩方式：${entry.method}`);
}

async function zipEntryText(file, entry) {
  return new TextDecoder("utf-8").decode(await new Response(await zipEntryStream(file, entry)).arrayBuffer());
}

function parseSharedStrings(xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  return [...documentXml.getElementsByTagName("si")].map((item) => item.textContent || "");
}

async function workbookSheetNames(file, entryByName) {
  const result = new Map();
  const workbookEntry = entryByName.get("xl/workbook.xml");
  const relationshipsEntry = entryByName.get("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relationshipsEntry) return result;
  const workbookXml = new DOMParser().parseFromString(await zipEntryText(file, workbookEntry), "application/xml");
  const relationshipsXml = new DOMParser().parseFromString(await zipEntryText(file, relationshipsEntry), "application/xml");
  const paths = new Map([...relationshipsXml.getElementsByTagName("Relationship")].map((item) => [item.getAttribute("Id"), item.getAttribute("Target")]));
  for (const sheet of workbookXml.getElementsByTagName("sheet")) {
    const target = paths.get(sheet.getAttribute("r:id"));
    const match = target && target.match(/sheet(\d+)\.xml$/);
    if (match) result.set(Number(match[1]), sheet.getAttribute("name"));
  }
  return result;
}

async function consumeWorksheetRows(file, entry, sharedStrings, wantedIndices, onRow) {
  const reader = (await zipEntryStream(file, entry)).getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let keepReading = true;
  while (keepReading) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let start = buffer.search(/<row\b/);
    let end = start >= 0 ? buffer.indexOf("</row>", start) : -1;
    while (start >= 0 && end >= 0) {
      const rowXml = buffer.slice(start, end + 6);
      keepReading = onRow(parseXmlRow(rowXml, sharedStrings, wantedIndices())) !== false;
      buffer = buffer.slice(end + 6);
      if (!keepReading) break;
      start = buffer.search(/<row\b/);
      end = start >= 0 ? buffer.indexOf("</row>", start) : -1;
    }
    if (start > 0) buffer = buffer.slice(start);
    else if (start < 0 && buffer.length > 256) buffer = buffer.slice(-256);
    if (done) break;
  }
  if (!keepReading) await reader.cancel();
}

function parseXmlRow(xml, sharedStrings, wanted) {
  const row = [];
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const match of xml.matchAll(cellPattern)) {
    const attributes = match[1];
    const reference = attributes.match(/\br="([A-Z]+)\d+"/);
    if (!reference) continue;
    const index = columnIndex(reference[1]);
    if (wanted && !wanted.has(index)) continue;
    const body = match[2] || "";
    const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "n";
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
    if (type === "s") row[index] = sharedStrings[Number(raw)] ?? "";
    else if (type === "inlineStr") row[index] = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join("");
    else if (type === "str") row[index] = decodeXml(raw);
    else if (raw === "") row[index] = "";
    else row[index] = Number.isFinite(Number(raw)) ? Number(raw) : decodeXml(raw);
  }
  return row;
}

function columnIndex(letters) {
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function decodeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function repairSheetRef(sheet) {
  const cells = Object.keys(sheet).filter((key) => /^[A-Z]+\d+$/.test(key));
  if (!cells.length) return;
  const range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  for (const cell of cells) {
    const point = XLSX.utils.decode_cell(cell);
    range.s.r = Math.min(range.s.r, point.r);
    range.s.c = Math.min(range.s.c, point.c);
    range.e.r = Math.max(range.e.r, point.r);
    range.e.c = Math.max(range.e.c, point.c);
  }
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function number(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) return new Date(parts.y, parts.m - 1, parts.d, parts.H || 0, parts.M || 0, Math.round(parts.S || 0));
  }
  const raw = text(value);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]));
  const normalized = raw.replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function pad(value) { return String(value).padStart(2, "0"); }
function dateText(value) {
  const date = excelDate(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : text(value).slice(0, 10);
}
function dateTimeText(value) {
  const date = excelDate(value);
  return date ? `${dateText(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` : text(value);
}
function hourOf(value) { const date = excelDate(value); return date ? date.getHours() : ""; }
function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function tidyNumber(value) { return Number.isInteger(value) ? value : Number(value.toFixed(4)); }
function boundaryText(value) { return String(tidyNumber(Number(value))); }

function readBucketSettings() {
  const settings = {
    min: Number(els.bucketMin.value),
    max: Number(els.bucketMax.value),
    step: Number(els.bucketStep.value),
  };
  if (!Number.isFinite(settings.min) || settings.min < 0) throw new Error("营业额区间最小值必须大于或等于0");
  if (!Number.isFinite(settings.max) || settings.max <= settings.min) throw new Error("营业额区间最大值必须大于最小值");
  if (!Number.isFinite(settings.step) || settings.step <= 0) throw new Error("营业额区间步长必须大于0");
  if (Math.ceil((settings.max - settings.min) / settings.step) > 100) throw new Error("营业额区间数量不能超过100个，请增大步长");
  return settings;
}

function bucketLabels(settings) {
  const labels = settings.min > 0 ? [`[0,${boundaryText(settings.min)}）`] : [];
  let lower = settings.min;
  let index = 0;
  while (lower < settings.max - 1e-9) {
    const upper = Math.min(lower + settings.step, settings.max);
    labels.push(`[${boundaryText(lower)},${boundaryText(upper)}${index === 0 ? "）" : ")"}`);
    lower = upper;
    index += 1;
  }
  labels.push(`[${boundaryText(settings.max)},~)`);
  return labels;
}

function updateBucketPreview() {
  try {
    const settings = readBucketSettings();
    state.bucketSettings = settings;
    els.bucketSettings.classList.remove("invalid");
    els.bucketPreview.textContent = bucketLabels(settings).join("、");
  } catch (error) {
    els.bucketSettings.classList.add("invalid");
    els.bucketPreview.textContent = error.message;
  }
}

function normalizeProductName(rawName) {
  let name = text(rawName);
  name = name.replace(/-\d+人份\[[^\]]+\]$/, "").trim();
  name = name.replace(/-(?:\d+人份|个|片|盒|袋|标准|标杯|大杯|470ml|澳白杯)(?:\([^)]*\))?(?:\[[^\]]*\])?$/, "").trim();
  name = name.replace(/\[[^\]]+\]$/, "").trim();
  return PRODUCT_ALIASES.get(name) || name;
}

function isPackage(name) { return PACKAGE_TOKENS.some((token) => name.includes(token)); }

function parseMeituanActivity(raw) {
  const prices = new Map();
  const source = text(raw);
  MT_ACTIVITY_PRICE_RE.lastIndex = 0;
  for (const match of source.matchAll(MT_ACTIVITY_PRICE_RE)) prices.set(match[1].trim(), number(match[2]));
  return prices;
}

function parseMeituanItems(rawInfo, rawActivity) {
  const source = text(rawInfo);
  const activityPrices = parseMeituanActivity(rawActivity);
  const items = [];
  let cursor = 0;
  MT_PRICE_QTY_RE.lastIndex = 0;
  for (const match of source.matchAll(MT_PRICE_QTY_RE)) {
    const description = source.slice(cursor, match.index).replace(/^\/+/, "").trim();
    const name = normalizeProductName(description.split("(", 1)[0].trim());
    if (name) items.push({ name, qty: number(match[2]), price: activityPrices.get(name) ?? number(match[1]) });
    cursor = match.index + match[0].length;
  }
  return items;
}

function isEleProduct(name, price) {
  if (price <= 0 || ELE_ADDONS.has(name)) return false;
  if (/^【(?:个|标杯|大杯|470ml|澳白杯|标准|片)】/.test(name) && !name.includes("-")) return false;
  return true;
}

function parseEleItems(rawInfo) {
  const source = text(rawInfo);
  const items = [];
  let cursor = 0;
  ELE_PRICE_QTY_RE.lastIndex = 0;
  for (const match of source.matchAll(ELE_PRICE_QTY_RE)) {
    const rawName = source.slice(cursor, match.index).replace(/^\++/, "").trim();
    const qty = number(match[1]);
    const price = number(match[2]);
    if (rawName && isEleProduct(rawName, price)) items.push({ name: normalizeProductName(rawName), qty, price });
    cursor = match.index + match[0].length;
  }
  return items;
}

function comboFromItems(items) {
  const grouped = new Map();
  for (const item of items) grouped.set(item.name, (grouped.get(item.name) || 0) + item.qty);
  const entries = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-CN"));
  return {
    grouped,
    combo: entries.map(([name, qty]) => `${name} x${tidyNumber(qty)}`).join(" + "),
  };
}

function revenueBucket(value) {
  const { min, max, step } = state.bucketSettings;
  if (value < 0) return "";
  if (value < min) return `[0,${boundaryText(min)}）`;
  if (value >= max) return `[${boundaryText(max)},~)`;
  const index = Math.floor((value - min) / step);
  const lower = min + index * step;
  const upper = Math.min(lower + step, max);
  return `[${boundaryText(lower)},${boundaryText(upper)}${index === 0 ? "）" : ")"}`;
}

function keyOf(parts) { return JSON.stringify(parts); }
function sortRows(rows, columns) {
  rows.sort((a, b) => {
    for (const column of columns) {
      const av = a[column] ?? "";
      const bv = b[column] ?? "";
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : ZH_COLLATOR.compare(String(av), String(bv));
      if (result) return result;
    }
    return 0;
  });
}

function processOrders() {
  const detail = [];
  const hourlyProducts = new Map();
  const hourlyCombos = new Map();
  const associationSeeds = [];
  const warnings = [];
  const stats = { mtRaw: 0, mtExcluded: 0, eleRaw: 0, eleExcluded: 0, shenqiangshou: 0 };

  const sources = [
    { key: "mtOrder", platform: "美团", id: "门店id", city: "门店所在城市", order: "订单编号", paid: "订单实付", original: "商品原价", packaging: "包装费", excluded: "已取消" },
    { key: "eleOrder", platform: "饿了么", id: "门店编号", city: "门店所在城市", order: "订单单号", paid: "顾客实付", original: "菜品原价", packaging: "餐盒费", excluded: "订单无效" },
  ];

  for (const source of sources) {
    const rows = state.parsed[source.key].rows;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (source.platform === "美团") stats.mtRaw += 1; else stats.eleRaw += 1;
      if (text(row["订单状态"]) === source.excluded) {
        if (source.platform === "美团") stats.mtExcluded += 1; else stats.eleExcluded += 1;
        continue;
      }
      if (source.platform === "美团" && (text(row["神抢手用券核销订单"]) === "是" || text(row["神抢手一口价商品订单"]) === "是")) stats.shenqiangshou += 1;
      const items = source.platform === "美团" ? parseMeituanItems(row["商品信息"], row["活动信息"]) : parseEleItems(row["商品信息"]);
      if (!items.length) {
        warnings.push(`${source.platform} 第${index + 2}行，订单${text(row[source.order]) || "未知"}`);
        continue;
      }
      const date = dateText(row["日期"]);
      const orderTime = dateTimeText(row["下单时间"]);
      const hour = hourOf(row["下单时间"]);
      const storeId = text(row[source.id]);
      const storeName = text(row["门店名称"]);
      const { grouped, combo } = comboFromItems(items);
      const totalQty = [...grouped.values()].reduce((sum, qty) => sum + qty, 0);
      const packageQty = [...grouped.entries()].reduce((sum, [name, qty]) => sum + (isPackage(name) ? qty : 0), 0);
      const revenue = round2(number(row[source.original]) + number(row[source.packaging]));
      detail.push({
        "日期": date, "平台": source.platform, "门店ID": storeId, "门店名称": storeName,
        "城市": text(row[source.city]), "订单单号": text(row[source.order]), "下单时间": orderTime, "小时": hour,
        "商品种类数": grouped.size, "商品总件数": tidyNumber(totalQty), "商品总件数（套餐拆开）": tidyNumber(totalQty + packageQty),
        "商品信息": text(row["商品信息"]), "商品组合": combo, "顾客实付": round2(number(row[source.paid])),
        "营业额": revenue, "区间": revenueBucket(revenue), "订单数": 1,
      });
      associationSeeds.push({ date, platform: source.platform, storeId, storeName, names: [...grouped.keys()].sort((a, b) => a.localeCompare(b, "zh-CN")) });

      for (const item of items) {
        const key = keyOf([date, source.platform, storeId, storeName, hour, item.name]);
        const current = hourlyProducts.get(key) || { "日期": date, "平台": source.platform, "门店ID": storeId, "门店名称": storeName, "小时": hour, "商品名称": item.name, "销量": 0, "销售额": 0 };
        current["销量"] += item.qty;
        current["销售额"] += item.qty * item.price;
        hourlyProducts.set(key, current);
      }
      const comboKey = keyOf([date, source.platform, storeId, storeName, hour, combo]);
      const currentCombo = hourlyCombos.get(comboKey) || { "日期": date, "平台": source.platform, "门店ID": storeId, "门店名称": storeName, "小时": hour, "商品组合": combo, "订单数": 0, "商品种类数": grouped.size };
      currentCombo["订单数"] += 1;
      hourlyCombos.set(comboKey, currentCombo);
    }
  }

  if (warnings.length) throw new Error(`有${warnings.length}条有效订单未识别出商品。请检查源文件格式，例如：${warnings.slice(0, 3).join("；")}`);
  const expected = stats.mtRaw - stats.mtExcluded + stats.eleRaw - stats.eleExcluded;
  if (detail.length !== expected) throw new Error(`订单校验未通过：状态筛选后应有${expected}单，实际生成${detail.length}单。`);

  const productRows = [...hourlyProducts.values()].map((row) => ({ ...row, "销量": tidyNumber(row["销量"]), "销售额": round2(row["销售额"]) }));
  const comboRows = [...hourlyCombos.values()];
  sortRows(detail, ["日期", "平台", "门店ID", "门店名称", "小时", "下单时间", "订单单号"]);
  sortRows(productRows, ["日期", "平台", "门店ID", "门店名称", "小时", "商品名称"]);
  sortRows(comboRows, ["日期", "平台", "门店ID", "门店名称", "小时", "商品组合"]);
  const associations = buildAssociations(associationSeeds);
  return {
    tables: [
      { name: "订单明细", columns: DETAIL_COLUMNS, rows: detail },
      { name: "各小时商品销量", columns: HOURLY_PRODUCT_COLUMNS, rows: productRows },
      { name: "各小时组合订单", columns: HOURLY_COMBO_COLUMNS, rows: comboRows },
      ...associations.tables,
    ],
    dateMin: detail[0]?.["日期"] || "", dateMax: detail.at(-1)?.["日期"] || "",
    summary: `有效订单 ${detail.length.toLocaleString()} 单；剔除美团已取消 ${stats.mtExcluded.toLocaleString()} 单、饿了么订单无效 ${stats.eleExcluded.toLocaleString()} 单；${associations.note}`,
  };
}

function combinations(items, size) {
  const result = [];
  function walk(start, current) {
    if (current.length === size) { result.push([...current]); return; }
    for (let index = start; index <= items.length - (size - current.length); index += 1) {
      current.push(items[index]); walk(index + 1, current); current.pop();
    }
  }
  walk(0, []);
  return result;
}

function buildAssociations(seeds) {
  const dates = [...new Set(seeds.map((row) => row.date).filter(Boolean))].sort();
  if (!dates.length) return { tables: [], note: "没有可用于关联搭配统计的日期" };
  const tables = [];
  for (const size of [2, 3]) {
    const counts = new Map();
    for (const seed of seeds) {
      if (!seed.date || seed.names.length < size) continue;
      for (const products of combinations(seed.names, size)) {
        const key = keyOf([seed.date, seed.platform, seed.storeId, seed.storeName, ...products]);
        const entry = counts.get(key) || { date: seed.date, platform: seed.platform, storeId: seed.storeId, storeName: seed.storeName, products, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      }
    }
    const productColumns = Array.from({ length: size }, (_, index) => `商品${String.fromCharCode(65 + index)}`);
    const columns = ["日期", "平台", "门店ID", "门店名称", ...productColumns, "合计", "共同出现订单数"];
    const rows = [...counts.values()].map((entry) => {
      const row = { "日期": entry.date, "平台": entry.platform, "门店ID": entry.storeId, "门店名称": entry.storeName, "合计": entry.products.join("+") };
      productColumns.forEach((column, index) => { row[column] = entry.products[index]; });
      row["共同出现订单数"] = entry.count;
      return row;
    });
    rows.sort((a, b) => a["日期"].localeCompare(b["日期"]) || b["共同出现订单数"] - a["共同出现订单数"] || a["平台"].localeCompare(b["平台"], "zh-CN") || a["门店名称"].localeCompare(b["门店名称"], "zh-CN") || a["合计"].localeCompare(b["合计"], "zh-CN"));
    tables.push({ name: `${size}个品强关联搭配`, columns, rows });
  }
  return { tables, note: `关联搭配按${dates[0]}至${dates.at(-1)}逐日统计` };
}

function processProducts() {
  const aggregated = new Map();
  let rawRows = 0;
  let excluded = 0;
  const sources = [
    { key: "mtProduct", platform: "美团", product: "商品名", id: "门店id", qty: "商品销量", sales: "商品销售额" },
    { key: "eleProduct", platform: "饿了么", product: "商品名称", id: "门店编号", qty: "销量", sales: "销售额" },
  ];
  for (const source of sources) {
    const parsed = state.parsed[source.key];
    rawRows += parsed.rawRowCount ?? parsed.rows.length;
    excluded += parsed.preExcludedCount ?? 0;
    for (const row of parsed.rows) {
      const product = text(row[source.product]);
      const qty = number(row[source.qty]);
      if (!product || product === "需要餐具" || product === "不需要餐具" || qty === 0) { excluded += 1; continue; }
      const date = dateText(row["日期"]);
      const storeName = text(row["门店名称"]);
      const storeId = text(row[source.id]);
      const key = keyOf([date, source.platform, storeName, storeId, product]);
      const current = aggregated.get(key) || { "日期": date, "平台": source.platform, "门店名称": storeName, "门店id": storeId, "商品名": product, "商品销量": 0, "商品销售额": 0, "备注": isPackage(product) ? "套餐" : "" };
      current["商品销量"] += qty;
      current["商品销售额"] += number(row[source.sales]);
      aggregated.set(key, current);
    }
  }
  const rows = [...aggregated.values()].map((row) => ({ ...row, "商品销量": tidyNumber(row["商品销量"]), "商品销售额": round2(row["商品销售额"]) }));
  sortRows(rows, ["日期", "平台", "门店名称", "门店id", "商品名"]);
  return {
    tables: [{ name: "商品汇总", columns: PRODUCT_COLUMNS, rows }],
    dateMin: rows[0]?.["日期"] || "", dateMax: rows.at(-1)?.["日期"] || "",
    summary: `汇总 ${rows.length.toLocaleString()} 行；源数据 ${rawRows.toLocaleString()} 行；剔除非商品或零销量 ${excluded.toLocaleString()} 行`,
  };
}

async function generateAvailableReports() {
  if (state.busy) return;
  const orderPair = state.files.mtOrder && state.files.eleOrder;
  const productPair = state.files.mtProduct && state.files.eleProduct;
  if (!orderPair && !productPair) return;
  try {
    state.bucketSettings = readBucketSettings();
    updateBucketPreview();
  } catch (error) {
    showAlert(error.message, "error");
    return;
  }
  const partialOrder = Boolean(state.files.mtOrder) !== Boolean(state.files.eleOrder);
  const partialProduct = Boolean(state.files.mtProduct) !== Boolean(state.files.eleProduct);
  if (partialOrder || partialProduct) {
    const missing = [];
    if (partialOrder) missing.push(state.files.mtOrder ? "饿了么订单" : "美团订单");
    if (partialProduct) missing.push(state.files.mtProduct ? "饿了么商品" : "美团商品");
    showAlert(`未成对的数据不会生成：还缺${missing.join("、")}。已就绪的数据仍会正常处理。`);
  } else hideAlert();

  state.busy = true;
  els.generate.classList.add("loading");
  setGenerateStatus("正在整理数据…");
  updateUi();
  try {
    for (const result of state.results) URL.revokeObjectURL(result.url);
    state.results = [];
    if (orderPair) {
      const report = processOrders();
      await addResult("订单小时汇总", report, `订单小时汇总_${compactDate(report.dateMin)}_${compactDate(report.dateMax)}.xlsx`);
    }
    if (productPair) {
      const report = processProducts();
      await addResult("商品汇总", report, `双平台商品汇总_${compactDate(report.dateMin)}_${compactDate(report.dateMax)}.xlsx`);
    }
    renderResults();
    document.querySelectorAll(".step").forEach((step) => step.classList.add("active"));
  } catch (error) {
    showAlert(`生成失败：${error.message}`, "error");
  } finally {
    state.busy = false;
    els.generate.classList.remove("loading");
    setGenerateStatus("生成可用报表");
    updateUi();
  }
}

function compactDate(value) { return text(value).replace(/-/g, "") || "未知日期"; }

async function addResult(title, report, filename) {
  setGenerateStatus(`正在快速导出${title}…`);
  const buffer = await buildFastExcel(report.tables, title);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  state.results.push({ title, filename, summary: report.summary, url: URL.createObjectURL(blob) });
}

function setGenerateStatus(label) {
  els.generate.querySelector(".btn-label").textContent = label;
}

async function buildFastExcel(tables, title) {
  const workbook = XLSX.utils.book_new();
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length, 0);
  let writtenRows = 0;
  for (const table of tables) {
    const worksheet = XLSX.utils.aoa_to_sheet([table.columns]);
    for (let start = 0; start < table.rows.length; start += 10000) {
      const matrix = table.rows.slice(start, start + 10000).map((row) => table.columns.map((column) => row[column] ?? ""));
      XLSX.utils.sheet_add_aoa(worksheet, matrix, { origin: -1 });
      writtenRows += matrix.length;
      setGenerateStatus(`正在导出${title} ${Math.round(writtenRows / Math.max(totalRows, 1) * 100)}%`);
      await nextFrame();
    }
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: table.columns.length - 1 } }) };
    worksheet["!cols"] = table.columns.map((column) => ({ wch: columnWidth(column) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, table.name);
  }
  setGenerateStatus(`正在压缩${title}…`);
  await nextFrame();
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
}

function columnWidth(column) {
  const widths = {
    "日期": 13, "平台": 10, "门店ID": 15, "门店id": 15, "门店名称": 34, "城市": 12, "订单单号": 24,
    "下单时间": 21, "小时": 8, "商品种类数": 12, "商品总件数": 12, "商品总件数（套餐拆开）": 22,
    "商品信息": 64, "商品组合": 54, "商品名称": 34, "商品名": 34, "顾客实付": 12, "营业额": 12,
    "区间": 12, "订单数": 10, "销量": 10, "销售额": 13, "商品销量": 12, "商品销售额": 14, "备注": 10,
    "商品A": 34, "商品B": 34, "商品C": 34, "合计": 64, "差值": 10,
  };
  if (column === "共同出现订单数") return 18;
  return widths[column] || 16;
}

function renderResults() {
  els.resultCards.replaceChildren();
  for (const result of state.results) {
    const card = document.createElement("article");
    card.className = "result-card";
    const content = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = result.filename;
    const summary = document.createElement("p");
    summary.textContent = result.summary;
    content.append(heading, summary);
    const link = document.createElement("a");
    link.className = "download-btn";
    link.href = result.url;
    link.download = result.filename;
    link.textContent = "下载Excel";
    card.append(content, link);
    els.resultCards.append(card);
  }
  els.resultTime.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
  els.results.hidden = false;
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function nextFrame() { return new Promise((resolve) => setTimeout(resolve, 0)); }

function registerWebMcp() {
  if (!document.modelContext?.registerTool) return;
  document.modelContext.registerTool({
    name: "get_report_status",
    description: "查看ORA报表台当前上传文件和可生成报表状态",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => ({ content: [{ type: "text", text: JSON.stringify({ uploaded: Object.fromEntries(Object.entries(state.files).map(([key, file]) => [key, file?.name || null])), generated: state.results.map((item) => item.filename) }, null, 2) }] }),
  });
  document.modelContext.registerTool({
    name: "generate_available_reports",
    description: "根据已上传且成对的双平台文件生成可下载Excel报表",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => { await generateAvailableReports(); return { content: [{ type: "text", text: state.results.length ? `已生成：${state.results.map((item) => item.filename).join("、")}` : "没有可生成的完整文件组" }] }; },
  });
}

updateUi();
updateBucketPreview();
registerWebMcp();
window.__ORA_REPORT_APP__ = { state, parseMeituanItems, parseEleItems, normalizeProductName, revenueBucket, processOrders, processProducts };
