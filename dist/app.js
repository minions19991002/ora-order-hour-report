"use strict";

const FILE_SPECS = {
  mtOrder: { label: "美团订单", kind: "order", platform: "美团", required: ["日期", "门店id", "门店名称", "商品信息", "下单时间", "订单状态", "订单编号"] },
  eleOrder: { label: "饿了么订单", kind: "order", platform: "饿了么", required: ["日期", "门店编号", "门店名称", "商品信息", "下单时间", "订单状态", "订单单号"] },
  mtProduct: { label: "美团商品", kind: "product", platform: "美团", required: ["日期", "商品名", "门店名称", "门店id", "商品销量", "商品销售额"] },
  eleProduct: { label: "饿了么商品", kind: "product", platform: "饿了么", required: ["日期", "商品名称", "门店名称", "门店编号", "销量", "销售额"] },
};

const state = {
  files: { mtOrder: null, eleOrder: null, mtProduct: null, eleProduct: null },
  parsed: {},
  results: [],
  busy: false,
};

const MT_PRICE_QTY_RE = /,单价([\d.]+)\*数量(\d+(?:\.\d+)?)/g;
const MT_ACTIVITY_PRICE_RE = /购买(.+?)原价([\d.]+)元现价([\d.]+)元/g;
const ELE_PRICE_QTY_RE = /_(\d+(?:\.\d+)?)\*([\d.]+)/g;
const PACKAGE_TOKENS = ["套餐", "双杯", "+", "＋", "超大杯美式4选2"];
const PRODUCT_ALIASES = new Map([
  ["超大杯美式·红宝石瑰夏（双杯套餐）", "超大杯美式·红宝石瑰夏（双杯）"],
]);
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
  fileState.textContent = `${file.name} · ${parsed.rows.length.toLocaleString()}行${range}`;
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
    for (let index = 0; index < excelFiles.length; index += 1) {
      const file = excelFiles[index];
      els.bulkDropzone.querySelector(".bulk-action").textContent = `正在识别 ${index + 1} / ${excelFiles.length}`;
      let matched = false;
      for (const [key, spec] of Object.entries(FILE_SPECS)) {
        try {
          const parsed = await parseWorkbook(file, spec.required);
          applyLoadedFile(key, file, parsed);
          loaded.push(spec.label);
          matched = true;
          break;
        } catch {
          // Continue checking the remaining known source formats.
        }
      }
      if (!matched) failed.push(file.name);
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

async function loadFile(key, file) {
  const zone = document.querySelector(`[data-key="${key}"]`);
  const fileState = zone.querySelector(".file-state");
  zone.classList.remove("loaded", "invalid");
  fileState.textContent = "正在识别…";
  hideAlert();
  try {
    if (!/\.xlsx?$/i.test(file.name)) throw new Error("请选择 .xlsx 或 .xls 文件");
    const parsed = await parseWorkbook(file, FILE_SPECS[key].required);
    applyLoadedFile(key, file, parsed);
  } catch (error) {
    state.files[key] = null;
    delete state.parsed[key];
    zone.classList.add("invalid");
    fileState.textContent = "识别失败";
    showAlert(`${FILE_SPECS[key].label}：${error.message}`, "error");
  }
  updateUi();
}

async function parseWorkbook(file, requiredHeaders) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    repairSheetRef(sheet);
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });
    const headerIndex = matrix.findIndex((row) => {
      const set = new Set((row || []).map((value) => text(value)));
      return requiredHeaders.every((header) => set.has(header));
    });
    if (headerIndex < 0) continue;
    const headers = matrix[headerIndex].map((value) => text(value));
    const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((value) => value !== null && value !== "")).map((row) => {
      const record = {};
      headers.forEach((header, index) => { if (header) record[header] = row[index]; });
      return record;
    });
    const dates = rows.map((row) => dateText(row["日期"])).filter(Boolean).sort();
    return { sheetName, headers, rows, dateMin: dates[0] || "", dateMax: dates.at(-1) || "" };
  }
  throw new Error(`未找到必需字段：${requiredHeaders.join("、")}`);
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
  if (value >= 0 && value < 20) return "[0,20）";
  if (value >= 20 && value < 25) return "[20,25）";
  for (let lower = 25; lower < 80; lower += 5) if (value >= lower && value < lower + 5) return `[${lower},${lower + 5})`;
  return value >= 80 ? "[80,~)" : "";
}

function keyOf(parts) { return JSON.stringify(parts); }
function sortRows(rows, columns) {
  rows.sort((a, b) => {
    for (const column of columns) {
      const av = a[column] ?? "";
      const bv = b[column] ?? "";
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "zh-CN");
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
  const dates = detail.map((row) => row["日期"]).filter(Boolean).sort();
  return {
    tables: [
      { name: "订单明细", columns: DETAIL_COLUMNS, rows: detail },
      { name: "各小时商品销量", columns: HOURLY_PRODUCT_COLUMNS, rows: productRows },
      { name: "各小时组合订单", columns: HOURLY_COMBO_COLUMNS, rows: comboRows },
      ...associations.tables,
    ],
    dateMin: dates[0] || "", dateMax: dates.at(-1) || "",
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
    for (const row of state.parsed[source.key].rows) {
      rawRows += 1;
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
  const dates = rows.map((row) => row["日期"]).filter(Boolean).sort();
  return {
    tables: [{ name: "商品汇总", columns: PRODUCT_COLUMNS, rows }],
    dateMin: dates[0] || "", dateMax: dates.at(-1) || "",
    summary: `汇总 ${rows.length.toLocaleString()} 行；源数据 ${rawRows.toLocaleString()} 行；剔除非商品或零销量 ${excluded.toLocaleString()} 行`,
  };
}

async function generateAvailableReports() {
  if (state.busy) return;
  const orderPair = state.files.mtOrder && state.files.eleOrder;
  const productPair = state.files.mtProduct && state.files.eleProduct;
  if (!orderPair && !productPair) return;
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
    updateUi();
  }
}

function compactDate(value) { return text(value).replace(/-/g, "") || "未知日期"; }

async function addResult(title, report, filename) {
  const buffer = await buildExcel(report.tables);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  state.results.push({ title, filename, summary: report.summary, url: URL.createObjectURL(blob) });
}

async function buildExcel(tables) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ORA 双平台报表台";
  workbook.created = new Date();
  for (const table of tables) {
    const worksheet = workbook.addWorksheet(table.name, { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    worksheet.columns = table.columns.map((column) => ({ header: column, key: column, width: columnWidth(column) }));
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
    const header = worksheet.getRow(1);
    header.height = 26;
    header.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    header.alignment = { horizontal: "center", vertical: "middle" };
    for (let start = 0; start < table.rows.length; start += 2000) {
      for (const source of table.rows.slice(start, start + 2000)) {
        const values = {};
        for (const column of table.columns) values[column] = column === "日期" && source[column] ? excelDate(source[column]) : source[column];
        const row = worksheet.addRow(values);
        row.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF202B31" } };
        row.alignment = { vertical: "middle" };
      }
      await nextFrame();
    }
    table.columns.forEach((column, index) => {
      const excelColumn = worksheet.getColumn(index + 1);
      if (column === "日期") excelColumn.numFmt = "yyyy-mm-dd";
      if (["顾客实付", "营业额", "销售额", "商品销售额"].includes(column)) excelColumn.numFmt = "#,##0.00";
      if (["门店ID", "门店id", "订单单号"].includes(column)) excelColumn.numFmt = "@";
    });
  }
  return workbook.xlsx.writeBuffer();
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
registerWebMcp();
window.__ORA_REPORT_APP__ = { state, parseMeituanItems, parseEleItems, normalizeProductName, revenueBucket, processOrders, processProducts };
