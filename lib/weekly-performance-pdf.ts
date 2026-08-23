import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { firstName, type WeeklyCloseColumn } from "@/lib/weekly-close";
import type { WeeklyPerformanceState } from "@/lib/weekly-performance";
import type { WeeklyPerformanceDocument } from "@/lib/weekly-performance-xlsx";

const LETTER_LANDSCAPE: [number, number] = [792, 612];
const BLUE = rgb(48 / 255, 84 / 255, 150 / 255);
const LIGHT_BLUE = rgb(169 / 255, 203 / 255, 232 / 255);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.05, 0.05, 0.05);
const PALE_GRAY = rgb(0.9, 0.9, 0.9);
const YELLOW = rgb(1, 0.95, 0);
const GREEN = rgb(0, 176 / 255, 80 / 255);
const RED = rgb(235 / 255, 87 / 255, 87 / 255);
const ACHIEVEMENT_RED = rgb(218 / 255, 73 / 255, 66 / 255);
const ACHIEVEMENT_BLACK = rgb(32 / 255, 32 / 255, 32 / 255);
const ACHIEVEMENT_GOLD = rgb(218 / 255, 164 / 255, 52 / 255);

type Fonts = { regular: PDFFont; bold: PDFFont };
type Align = "left" | "center" | "right";
type CellOptions = {
  fill?: ReturnType<typeof rgb>;
  color?: ReturnType<typeof rgb>;
  font?: PDFFont;
  size?: number;
  align?: Align;
  borderWidth?: number;
  padding?: number;
};

export async function buildWeeklyPerformancePdf(
  state: WeeklyPerformanceState,
  document: WeeklyPerformanceDocument = "combined"
) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold)
  };
  pdf.setTitle(pdfTitle(document, state));
  pdf.setAuthor("Clarvex Team");
  pdf.setCreator("Clarvex Team");
  pdf.setProducer("Clarvex Team");
  if (document !== "rds") drawQuotaPage(pdf.addPage(LETTER_LANDSCAPE), state, fonts);
  if (document !== "quota") drawRdsPage(pdf.addPage(LETTER_LANDSCAPE), state, fonts);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function drawQuotaPage(page: PDFPage, state: WeeklyPerformanceState, fonts: Fonts) {
  drawDocumentHeader(page, fonts, state.store.name, state.quotaWeek.weekNumber);
  cell(page, "CUOTA JUSTA", 18, 526, 756, 20, {
    fill: BLUE, color: WHITE, font: fonts.bold, size: 16, borderWidth: 1
  });

  const labelWidth = 84;
  const dayWidth = 72;
  const totalWidth = 90;
  const summaryX = 18;
  const totalX = summaryX + labelWidth + dayWidth * 7 + 6;
  const summaryRows = [
    ["FECHA", ...state.quota.days.map((day) => shortDate(day.date)), ""],
    ["DIA", ...state.quota.days.map((day) => weekday(day.date)), "TOTAL"],
    ["MINIMO", ...state.quota.days.map((day) => money(day.minimum)), money(sum(state.quota.days.map((day) => day.minimum)))],
    ["META", ...state.quota.days.map((day) => money(day.storeGoal)), money(state.quota.storeTotal)]
  ];
  summaryRows.forEach((row, rowIndex) => {
    const y = 512 - rowIndex * 13;
    cell(page, row[0], summaryX, y, labelWidth, 13, blueCell(fonts));
    state.quota.days.forEach((_, dayIndex) => {
      const isDate = rowIndex === 0;
      const isDay = rowIndex === 1;
      cell(page, row[dayIndex + 1], summaryX + labelWidth + dayIndex * dayWidth, y, dayWidth, 13, {
        fill: isDate ? LIGHT_BLUE : isDay ? BLUE : WHITE,
        color: isDay ? WHITE : BLACK,
        font: rowIndex <= 2 ? fonts.bold : fonts.regular,
        size: rowIndex <= 1 ? 7.2 : 7.5
      });
    });
    if (rowIndex > 0) cell(page, row[8], totalX, y, totalWidth, 13, blueCell(fonts, rowIndex === 1 ? 7.2 : 7.5));
  });

  drawQuotaPointOfSale(page, state, fonts, 458);
  drawQuotaWhatsapp(page, state, fonts, 264);
  footer(page, fonts, `${rangeLabel(state.quotaWeek.weekStart, state.quotaWeek.weekEnd)} | Generado por Clarvex Team`);
}

function drawQuotaPointOfSale(page: PDFPage, state: WeeklyPerformanceState, fonts: Fonts, top: number) {
  const x = 18;
  const nameWidth = 84;
  const percentWidth = 24;
  const amountWidth = 47;
  const dayWidth = percentWidth + amountWidth;
  const totalWidth = 75;
  const totalsX = x + nameWidth + dayWidth * 7 + 4;
  const people = state.quota.days[0]?.allocations ?? [];

  cell(page, "PUNTO DE VENTA", x, top, nameWidth + dayWidth * 7, 13, blueCell(fonts, 8));
  cell(page, "MINIMO", totalsX, top, totalWidth, 13, blueCell(fonts, 7));
  cell(page, "META", totalsX + totalWidth, top, totalWidth, 13, blueCell(fonts, 7));

  for (let slot = 0; slot < 10; slot += 1) {
    const y = top - 12 * (slot + 1);
    const person = people[slot];
    cell(page, person ? firstName(person.name) : "", x, y, nameWidth, 12, {
      fill: person ? WHITE : YELLOW, font: person ? fonts.bold : fonts.regular, size: 7.2
    });
    state.quota.days.forEach((day, dayIndex) => {
      const allocation = person ? day.allocations.find((item) => item.userId === person.userId) : null;
      cell(page, allocation ? percent(allocation.percentage) : "", x + nameWidth + dayIndex * dayWidth, y, percentWidth, 12, {
        fill: person ? WHITE : YELLOW, font: fonts.regular, size: 6.5
      });
      cell(page, allocation ? money(allocation.goal) : "", x + nameWidth + dayIndex * dayWidth + percentWidth, y, amountWidth, 12, {
        fill: WHITE, font: fonts.regular, size: 6.2, align: "right"
      });
    });
    const minimumTotal = person ? round2(sum(state.quota.days.map((day) => {
      const allocation = day.allocations.find((item) => item.userId === person.userId);
      return day.minimum * (allocation?.percentage ?? 0) / 100;
    }))) : null;
    cell(page, minimumTotal === null ? "" : money(minimumTotal), totalsX, y, totalWidth, 12, {
      fill: PALE_GRAY, font: fonts.bold, size: 6.8, align: "right"
    });
    cell(page, person ? money(state.quota.personTotals[person.userId]?.goal ?? 0) : "", totalsX + totalWidth, y, totalWidth, 12, {
      fill: PALE_GRAY, font: fonts.bold, size: 6.8, align: "right"
    });
  }

  const totalY = top - 12 * 11;
  cell(page, "TOTAL", x, totalY, nameWidth, 13, blueCell(fonts, 7));
  state.quota.days.forEach((day, dayIndex) => {
    cell(page, percent(day.percentageTotal), x + nameWidth + dayIndex * dayWidth, totalY, percentWidth, 13, blueCell(fonts, 6.2));
    cell(page, money(day.storeGoal), x + nameWidth + dayIndex * dayWidth + percentWidth, totalY, amountWidth, 13, blueCell(fonts, 6.2, "right"));
  });
  cell(page, money(sum(state.quota.days.map((day) => day.minimum))), totalsX, totalY, totalWidth, 13, blueCell(fonts, 6.5, "right"));
  cell(page, money(state.quota.storeTotal), totalsX + totalWidth, totalY, totalWidth, 13, blueCell(fonts, 6.5, "right"));
}

function drawQuotaWhatsapp(page: PDFPage, state: WeeklyPerformanceState, fonts: Fonts, top: number) {
  const x = 18;
  const nameWidth = 84;
  const percentWidth = 24;
  const amountWidth = 47;
  const dayWidth = percentWidth + amountWidth;
  const totalWidth = 154;
  const totalX = x + nameWidth + dayWidth * 7 + 4;
  const people = state.quota.days[0]?.allocations ?? [];
  const dailyBudget = state.quota.days.length ? round2(state.plan.whatsappBudget / state.quota.days.length) : 0;

  cell(page, "PPTO", x, top, nameWidth, 13, { fill: YELLOW, font: fonts.bold, size: 7 });
  state.quota.days.forEach((_, dayIndex) => {
    cell(page, money(dailyBudget), x + nameWidth + dayIndex * dayWidth, top, dayWidth, 13, {
      fill: GREEN, font: fonts.regular, size: 7
    });
  });
  cell(page, money(state.plan.whatsappBudget), totalX, top, totalWidth, 13, {
    fill: GREEN, font: fonts.bold, size: 7.2, align: "right"
  });
  cell(page, "WHATSAPP", x, top - 13, nameWidth + dayWidth * 7, 13, blueCell(fonts, 8));
  cell(page, "META", totalX, top - 13, totalWidth, 13, blueCell(fonts, 7));

  for (let slot = 0; slot < 10; slot += 1) {
    const y = top - 13 - 12 * (slot + 1);
    const person = people[slot];
    cell(page, person ? firstName(person.name) : "", x, y, nameWidth, 12, {
      fill: WHITE, font: person ? fonts.bold : fonts.regular, size: 7.2
    });
    state.quota.days.forEach((day, dayIndex) => {
      const allocation = person ? day.allocations.find((item) => item.userId === person.userId) : null;
      cell(page, allocation ? percent(allocation.percentage) : "", x + nameWidth + dayIndex * dayWidth, y, percentWidth, 12, {
        fill: WHITE, font: fonts.regular, size: 6.5
      });
      cell(page, allocation ? money(allocation.whatsappGoal) : "", x + nameWidth + dayIndex * dayWidth + percentWidth, y, amountWidth, 12, {
        fill: WHITE, font: fonts.regular, size: 6.2, align: "right"
      });
    });
    cell(page, person ? money(state.quota.personTotals[person.userId]?.whatsappGoal ?? 0) : "", totalX, y, totalWidth, 12, {
      fill: WHITE, font: person ? fonts.bold : fonts.regular, size: 6.8, align: "right"
    });
  }

  const totalY = top - 13 - 12 * 11;
  cell(page, "TOTAL", x, totalY, nameWidth, 13, blueCell(fonts, 7));
  state.quota.days.forEach((day, dayIndex) => {
    cell(page, percent(day.percentageTotal), x + nameWidth + dayIndex * dayWidth, totalY, percentWidth, 13, blueCell(fonts, 6.2));
    cell(page, money(sum(day.allocations.map((item) => item.whatsappGoal))), x + nameWidth + dayIndex * dayWidth + percentWidth, totalY, amountWidth, 13, blueCell(fonts, 6.2, "right"));
  });
  cell(page, money(state.plan.whatsappBudget), totalX, totalY, totalWidth, 13, blueCell(fonts, 7, "right"));
}

function drawRdsPage(page: PDFPage, state: WeeklyPerformanceState, fonts: Fonts) {
  drawDocumentHeader(page, fonts, state.store.name, state.reportWeek.weekNumber);
  cell(page, "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)", 18, 526, 756, 22, {
    fill: BLUE, color: WHITE, font: fonts.bold, size: 14, borderWidth: 1
  });
  const x = 18;
  const labelWidth = 94;
  const personWidth = 56;
  const gapWidth = 6;
  const totalWidth = 96;
  const totalX = x + labelWidth + personWidth * 10 + gapWidth;
  const columns = state.report.columns.slice(0, 10);
  let y = 510;

  cell(page, "ASESOR", x, y, labelWidth, 16, blueCell(fonts, 7.2));
  for (let slot = 0; slot < 10; slot += 1) {
    cell(page, columns[slot] ? firstName(columns[slot].name) : "", x + labelWidth + personWidth * slot, y, personWidth, 16, blueCell(fonts, 6.5));
  }
  cell(page, "TOTAL", totalX, y, totalWidth, 16, blueCell(fonts, 7.2));
  y -= 13;
  y = rdsSection(page, fonts, "PUNTO DE VENTA", y, x, labelWidth, personWidth, gapWidth, totalWidth);
  y = rdsRows(page, fonts, columns, state.report.store, y, x, labelWidth, personWidth, gapWidth, totalWidth, [
    ["META", (item) => money(item.goal), (item) => money(item.goal)],
    ["VENTA", (item) => money(item.sales), (item) => money(item.sales)],
    ["DIFERENCIA", (item) => money(item.difference), (item) => money(item.difference)],
    ["ALCANCE", (item) => percent(item.achievement), (item) => percent(item.achievement), "pointOfSale"],
    ["TICKETS", (item) => integer(item.transactions), (item) => integer(item.transactions)],
    ["ARTICULOS", (item) => integer(item.pieces), (item) => integer(item.pieces)],
    ["TRAFICO", (item) => nullableInteger(item.traffic), (item) => nullableInteger(item.traffic)]
  ]);
  y -= 5;
  y = rdsSection(page, fonts, "INDICADORES", y, x, labelWidth, personWidth, gapWidth, totalWidth);
  y = rdsRows(page, fonts, columns, state.report.store, y, x, labelWidth, personWidth, gapWidth, totalWidth, [
    ["EPT", (item) => nullableMoney(item.ept), (item) => nullableMoney(item.ept)],
    ["PERDIDA EPT", (item) => nullableMoney(item.lossEpt), () => ""],
    ["UPT", (item) => nullableDecimal(item.upt), (item) => nullableDecimal(item.upt)],
    ["PERDIDA UPT", (item) => nullableMoney(item.lossUpt), () => ""],
    ["AUR", (item) => nullableMoney(item.aur), (item) => nullableMoney(item.aur)],
    ["PERDIDA AUR", (item) => nullableMoney(item.lossAur), () => ""],
    ["TC", (item) => nullablePercent(item.tc), (item) => nullablePercent(item.tc)]
  ], true);
  y -= 5;
  cell(page, "INDICADOR A TRABAJAR", x, y, labelWidth, 14, blueCell(fonts, 6.5));
  columns.forEach((item, index) => cell(page, item.focus, x + labelWidth + personWidth * index, y, personWidth, 14, {
    fill: item.focus === "FELICIDADES" ? GREEN : item.focus === "SIN DATOS" ? YELLOW : WHITE,
    font: fonts.bold, size: 6
  }));
  for (let slot = columns.length; slot < 10; slot += 1) cell(page, "", x + labelWidth + personWidth * slot, y, personWidth, 14, { fill: YELLOW, font: fonts.regular });
  cell(page, "", totalX, y, totalWidth, 14, blueCell(fonts, 6.5));
  y -= 18;
  y = rdsSection(page, fonts, "WHATSAPP", y, x, labelWidth, personWidth, gapWidth, totalWidth);
  rdsRows(page, fonts, columns, state.report.store, y, x, labelWidth, personWidth, gapWidth, totalWidth, [
    ["META", (item) => nullableMoney(item.waMeta), (item) => nullableMoney(item.waMeta)],
    ["VENTA", (item) => nullableMoney(item.waSales), (item) => nullableMoney(item.waSales)],
    ["ALCANCE", (item) => whatsappAchievement(item), (item) => whatsappAchievement(item), "whatsapp"],
    ["TICKETS", (item) => nullableInteger(item.waTransactions), (item) => nullableInteger(item.waTransactions)],
    ["ARTICULOS", (item) => nullableInteger(item.waPieces), (item) => nullableInteger(item.waPieces)]
  ]);
  footer(page, fonts, `${rangeLabel(state.reportWeek.weekStart, state.reportWeek.weekEnd)} | Generado por Clarvex Team`);
}

type RdsAchievementKind = "pointOfSale" | "whatsapp";
export type RdsAchievementMarker = "star" | "black" | "red" | null;
type RdsRow = [
  string,
  (item: WeeklyCloseColumn) => string,
  (item: WeeklyCloseColumn) => string,
  RdsAchievementKind?
];

function rdsSection(page: PDFPage, fonts: Fonts, title: string, y: number, x: number, labelWidth: number, personWidth: number, gapWidth: number, totalWidth: number) {
  cell(page, title, x, y, labelWidth + personWidth * 10 + gapWidth + totalWidth, 12, blueCell(fonts, 7));
  return y - 13;
}

function rdsRows(
  page: PDFPage,
  fonts: Fonts,
  columns: WeeklyCloseColumn[],
  store: WeeklyCloseColumn,
  top: number,
  x: number,
  labelWidth: number,
  personWidth: number,
  gapWidth: number,
  totalWidth: number,
  rows: RdsRow[],
  colorLosses = false
) {
  const totalX = x + labelWidth + personWidth * 10 + gapWidth;
  rows.forEach(([label, value, total, achievementKind], rowIndex) => {
    const y = top - rowIndex * 14;
    cell(page, label, x, y, labelWidth, 14, blueCell(fonts, 6.6));
    for (let slot = 0; slot < 10; slot += 1) {
      const item = columns[slot];
      const isLoss = colorLosses && label.startsWith("PERDIDA");
      const rawLoss = item ? label === "PERDIDA EPT" ? item.lossEpt : label === "PERDIDA UPT" ? item.lossUpt : label === "PERDIDA AUR" ? item.lossAur : null : null;
      const cellX = x + labelWidth + personWidth * slot;
      const options: CellOptions = {
        fill: !item ? YELLOW : isLoss && rawLoss !== null ? rawLoss < 0 ? RED : GREEN : WHITE,
        font: isLoss ? fonts.bold : fonts.regular,
        size: 6.4
      };
      if (item && achievementKind) {
        achievementCell(page, value(item), achievementValue(item, achievementKind), achievementKind, cellX, y, personWidth, 14, options);
      } else {
        cell(page, item ? value(item) : "", cellX, y, personWidth, 14, options);
      }
    }
    const totalOptions = blueCell(fonts, 6.8);
    if (achievementKind) {
      achievementCell(page, total(store), achievementValue(store, achievementKind), achievementKind, totalX, y, totalWidth, 14, totalOptions);
    } else {
      cell(page, total(store), totalX, y, totalWidth, 14, totalOptions);
    }
  });
  return top - rows.length * 14;
}

function drawDocumentHeader(page: PDFPage, fonts: Fonts, storeName: string, weekNumber: number) {
  page.drawText("TIENDA:", { x: 318, y: 572, size: 8, font: fonts.regular, color: BLACK });
  page.drawLine({ start: { x: 365, y: 568 }, end: { x: 650, y: 568 }, thickness: 0.8, color: BLACK });
  drawFitted(page, storeName, 365, 571, 285, 11, fonts.bold, "center", BLACK);
  page.drawText("SEMANA:", { x: 675, y: 572, size: 8, font: fonts.regular, color: BLACK });
  page.drawLine({ start: { x: 728, y: 568 }, end: { x: 774, y: 568 }, thickness: 0.8, color: BLACK });
  drawFitted(page, String(weekNumber), 728, 571, 46, 12, fonts.bold, "center", BLACK);
}

function footer(page: PDFPage, fonts: Fonts, text: string) {
  drawFitted(page, text, 18, 24, 756, 6.8, fonts.regular, "right", rgb(0.42, 0.42, 0.42));
}

function cell(page: PDFPage, text: string, x: number, y: number, width: number, height: number, options: CellOptions = {}) {
  const fill = options.fill ?? WHITE;
  const color = options.color ?? BLACK;
  const font = options.font!;
  const size = options.size ?? 7;
  const align = options.align ?? "center";
  const padding = options.padding ?? 2;
  const borderWidth = options.borderWidth ?? 0.65;
  page.drawRectangle({ x, y, width, height, color: fill, borderColor: BLACK, borderWidth });
  drawFitted(page, text, x + padding, y + (height - size) / 2 + 0.8, width - padding * 2, size, font, align, color);
}

export function rdsAchievementMarker(value: number | null, kind: RdsAchievementKind): RdsAchievementMarker {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 100) return "star";
  // La plantilla original usa un punto negro entre 85 % y 99.99 % solo para
  // Punto de venta. WhatsApp conserva el punto rojo hasta alcanzar el 100 %.
  if (kind === "pointOfSale" && value >= 85) return "black";
  return "red";
}

function achievementValue(item: WeeklyCloseColumn, kind: RdsAchievementKind) {
  if (kind === "pointOfSale") return item.achievement;
  if (item.waMeta === null || item.waMeta <= 0 || item.waSales === null) return null;
  return item.waSales / item.waMeta * 100;
}

function achievementCell(
  page: PDFPage,
  text: string,
  value: number | null,
  kind: RdsAchievementKind,
  x: number,
  y: number,
  width: number,
  height: number,
  options: CellOptions
) {
  cell(page, "", x, y, width, height, options);
  const marker = rdsAchievementMarker(value, kind);
  const font = options.font!;
  const color = options.color ?? BLACK;
  const preferredSize = options.size ?? 7;
  const cleanText = sanitize(text);
  let size = preferredSize;
  const markerSize = marker === "star" ? 7 : marker ? 6 : 0;
  const gap = marker ? 2.25 : 0;
  const available = width - 4 - markerSize - gap;
  while (size > 4.5 && font.widthOfTextAtSize(cleanText, size) > available) size -= 0.25;
  const textWidth = font.widthOfTextAtSize(cleanText, size);
  const groupWidth = markerSize + gap + textWidth;
  const startX = x + (width - groupWidth) / 2;
  if (marker) {
    const markerY = marker === "star"
      ? y + (height + markerSize) / 2
      : y + (height - markerSize) / 2;
    drawAchievementMarker(page, marker, startX, markerY, markerSize);
  }
  page.drawText(cleanText, {
    x: startX + markerSize + gap,
    y: y + (height - size) / 2 + 0.8,
    size,
    font,
    color
  });
}

function drawAchievementMarker(page: PDFPage, marker: Exclude<RdsAchievementMarker, null>, x: number, y: number, size: number) {
  if (marker === "star") {
    page.drawSvgPath("M5 0 L6.18 3.38 L9.76 3.45 L6.9 5.62 L7.94 9.05 L5 7 L2.06 9.05 L3.1 5.62 L0.24 3.45 L3.82 3.38 Z", {
      x,
      y,
      scale: size / 10,
      color: ACHIEVEMENT_GOLD,
      borderColor: rgb(160 / 255, 111 / 255, 21 / 255),
      borderWidth: 0.45
    });
    return;
  }
  page.drawCircle({
    x: x + size / 2,
    y: y + size / 2,
    size: size / 2,
    color: marker === "black" ? ACHIEVEMENT_BLACK : ACHIEVEMENT_RED
  });
}

function drawFitted(page: PDFPage, raw: string, x: number, y: number, width: number, preferredSize: number, font: PDFFont, align: Align, color: ReturnType<typeof rgb>) {
  const text = sanitize(raw);
  let size = preferredSize;
  while (size > 4.5 && font.widthOfTextAtSize(text, size) > width) size -= 0.25;
  const measured = font.widthOfTextAtSize(text, size);
  const drawX = align === "right" ? x + width - measured : align === "center" ? x + (width - measured) / 2 : x;
  page.drawText(text, { x: drawX, y, size, font, color });
}

function blueCell(fonts: Fonts, size = 7, align: Align = "center"): CellOptions {
  return { fill: BLUE, color: WHITE, font: fonts.bold, size, align };
}

function pdfTitle(document: WeeklyPerformanceDocument, state: WeeklyPerformanceState) {
  if (document === "quota") return `Cuota Justa S${state.quotaWeek.weekNumber}`;
  if (document === "rds") return `RDS S${state.reportWeek.weekNumber}`;
  return `Cuota Justa S${state.quotaWeek.weekNumber} y RDS S${state.reportWeek.weekNumber}`;
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year.slice(2)}`;
}
function weekday(value: string) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`)).toLocaleUpperCase("es-MX");
}
function rangeLabel(start: string, end: string) { return `${shortDate(start)} - ${shortDate(end)}`; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value); }
function percent(value: number) { return `${round2(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`; }
function integer(value: number) { return Math.round(value).toLocaleString("es-MX"); }
function nullableInteger(value: number | null) { return value === null ? "-" : integer(value); }
function nullableMoney(value: number | null) { return value === null ? "-" : money(value); }
function nullableDecimal(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function nullablePercent(value: number | null) { return value === null ? "-" : percent(value); }
function whatsappAchievement(item: WeeklyCloseColumn) {
  return item.waMeta && item.waMeta > 0 && item.waSales !== null ? percent(item.waSales / item.waMeta * 100) : "-";
}
function sanitize(value: string) { return value.replace(/[–—]/g, "-").replace(/\u00a0/g, " "); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
