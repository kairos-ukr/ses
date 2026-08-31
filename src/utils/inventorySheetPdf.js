// =====================================================================
//  Інвентаризаційна відомість — друкований документ.
//
//  Рендеримо у прихованому iframe і віддаємо браузеру на друк.
//  Користувач у діалозі друку обирає «Зберегти як PDF» і отримує
//  векторний документ: текст лишається текстом, кирилиця не потребує
//  вбудовування шрифтів, розриви сторінок робить сам браузер.
//
//  html2canvas тут не підходить принципово: він знімає растр, через що
//  документ виходить важким, нечітким на друку і не дає виділяти текст.
//
//  Заголовок таблиці лежить у <thead>, тому браузер сам повторює його
//  на кожному аркуші — ручна розбивка на сторінки не потрібна.
// =====================================================================

import { COMPANY_INFO } from './companyInfo';

// Порожні пронумеровані рядки в кінці — під позиції, знайдені на складі,
// але відсутні в обліку.
const BLANK_ROWS = 8;

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n) => {
    const num = Number(n) || 0;
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 1000) / 1000);
};

const STYLES = `
@page { size: A4 portrait; margin: 12mm 10mm 14mm; }

*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; background:#fff; }
body{
  font-family:"Segoe UI",Arial,"Helvetica Neue",sans-serif;
  color:#111827; font-size:9pt; line-height:1.4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}

.sheet{ page-break-after:always; }
.sheet:last-child{ page-break-after:auto; }

/* --- шапка --- */
.org{ display:flex; justify-content:space-between; align-items:flex-start;
      font-size:8pt; color:#4b5563; line-height:1.45; }
.org b{ display:block; color:#111827; font-size:9.5pt; margin-bottom:1mm; }
.org .right{ text-align:right; white-space:nowrap; }

.title{ margin-top:6mm; text-align:center; font-size:15pt; font-weight:700;
        letter-spacing:.06em; color:#0f172a; }
.rule{ border-top:1.6pt solid #0f172a; border-bottom:.5pt solid #0f172a;
       height:1.6mm; margin:2mm 0 5mm; }

.meta{ display:flex; flex-wrap:wrap; gap:1.5mm 8mm; font-size:9pt; margin-bottom:2mm; }
.meta .k{ color:#6b7280; }
.meta .v{ font-weight:700; }
.meta .line{ display:inline-block; min-width:45mm; border-bottom:.5pt solid #9ca3af; }

.scope{ font-size:7.5pt; color:#6b7280; font-style:italic;
        margin-bottom:4mm; padding-bottom:2mm; border-bottom:.5pt dotted #d1d5db; }

/* --- таблиця --- */
table{ width:100%; border-collapse:collapse; table-layout:fixed;
       page-break-inside:auto; }
thead{ display:table-header-group; }
tfoot{ display:table-footer-group; }
tr{ page-break-inside:avoid; page-break-after:auto; }

th{ background:#eef2f7; border:.5pt solid #94a3b8; color:#1f2937;
    font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.03em;
    padding:2mm 1.5mm; text-align:center; line-height:1.25; }
th.running{ background:#fff; border:none; border-bottom:.5pt solid #cbd5e1;
            text-align:left; text-transform:none; letter-spacing:0;
            font-size:7.5pt; font-weight:400; color:#6b7280; padding:1mm 0 1.5mm; }
th.running b{ color:#111827; }

td{ border:.5pt solid #cbd5e1; padding:1.6mm 1.5mm; font-size:8.5pt;
    line-height:1.3; vertical-align:middle; height:7mm; }
tbody tr:nth-child(even) td{ background:#fafbfc; }

.c-num{ text-align:center; color:#6b7280; font-size:8pt; }
.c-sku{ font-family:Consolas,"Courier New",monospace; font-size:7.5pt;
        color:#374151; text-align:center; word-break:break-all; }
.c-name{ font-weight:600; color:#0f172a; }
.c-unit{ text-align:center; color:#6b7280; font-size:8pt; }
.c-qty{ text-align:center; font-weight:700; }
/* колонки під заповнення ручкою */
.fill{ background:#fffdf3 !important; }
.fill-first{ border-left:1pt solid #94a3b8 !important; }
tr.blank td{ background:#fffdf3 !important; height:7.4mm; }
tr.blank td.c-num{ background:#f8fafc !important; }

/* --- підвал --- */
.foot{ margin-top:5mm; page-break-inside:avoid; }
.tot{ display:flex; gap:7mm; flex-wrap:wrap; font-size:9pt; padding:2.5mm 3mm;
      border:.5pt solid #94a3b8; background:#f8fafc; margin-bottom:5mm; }
.tot span.k{ color:#6b7280; font-size:8pt; }
.tot span.v{ font-weight:700; }
.sign{ display:flex; gap:10mm; margin-top:8mm; }
.sign > div{ flex:1; }
.sign .role{ font-size:8.5pt; font-weight:600; color:#111827; margin-bottom:9mm; }
.sign .ln{ border-bottom:.5pt solid #6b7280; height:0; margin-bottom:1.5mm; }
.sign .cap{ font-size:7pt; color:#9ca3af; text-align:center; }
.hint{ margin-top:6mm; font-size:7.5pt; color:#6b7280; line-height:1.5;
       border-left:1.2pt solid #cbd5e1; padding-left:3mm; }

/* Підказка на екрані — на друк не потрапляє */
.screen-only{ padding:14px 18px; background:#fef3c7; color:#78350f;
              font-size:12px; font-weight:600; }
@media print { .screen-only{ display:none !important; } }
`;

const colgroup = `
<colgroup>
  <col style="width:5%"><col style="width:12%"><col style="width:33%"><col style="width:6%">
  <col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%">
</colgroup>`;

const dataRow = (row, index) => `
<tr>
  <td class="c-num">${index}</td>
  <td class="c-sku">${esc(row.sku || '—')}</td>
  <td class="c-name">${esc(row.name)}</td>
  <td class="c-unit">${esc(row.unit || 'шт')}</td>
  <td class="c-qty">${fmt(row.onHand)}</td>
  <td class="fill fill-first"></td>
  <td class="fill"></td>
  <td class="fill"></td>
</tr>`;

const blankRow = (index) => `
<tr class="blank">
  <td class="c-num">${index}</td>
  <td class="c-sku"></td><td class="c-name"></td><td class="c-unit"></td>
  <td class="c-qty"></td><td class="fill fill-first"></td><td class="fill"></td><td class="fill"></td>
</tr>`;

const sheetHtml = ({ warehouse, rows, dateStr, compiledBy, scopeText }) => {
    const totalQty = rows.reduce((sum, r) => sum + (Number(r.onHand) || 0), 0);
    const body = rows.map((r, i) => dataRow(r, i + 1)).join('');
    const blanks = Array.from({ length: BLANK_ROWS }, (_, i) => blankRow(rows.length + i + 1)).join('');

    return `
<div class="sheet">
  <div class="org">
    <div>
      <b>${esc(COMPANY_INFO.name)}</b>
      ЄДРПОУ ${esc(COMPANY_INFO.edrpou)}<br>${esc(COMPANY_INFO.address)}
    </div>
    <div class="right">тел. ${esc(COMPANY_INFO.phone)}</div>
  </div>

  <div class="title">ІНВЕНТАРИЗАЦІЙНА ВІДОМІСТЬ</div>
  <div class="rule"></div>

  <div class="meta">
    <span><span class="k">Склад:</span> <span class="v">${esc(warehouse.name)}</span></span>
    <span><span class="k">Адреса:</span> <span class="v">${esc(warehouse.address || '—')}</span></span>
    <span><span class="k">Дата:</span> <span class="v">${esc(dateStr)}</span></span>
  </div>
  <div class="meta">
    <span><span class="k">Склав:</span> <span class="v">${esc(compiledBy || '—')}</span></span>
    <span><span class="k">Перерахунок провів:</span> <span class="line"></span></span>
  </div>
  <div class="scope">Охоплення: ${esc(scopeText)}</div>

  <table>
    ${colgroup}
    <thead>
      <tr><th class="running" colspan="8">
        <b>Інвентаризаційна відомість</b> · склад «${esc(warehouse.name)}» · ${esc(dateStr)}
      </th></tr>
      <tr>
        <th>№</th><th>SKU</th><th>Найменування</th><th>Од.</th>
        <th>Обліковий<br>залишок</th><th>Фактично</th><th>Розбіжність</th><th>Примітка</th>
      </tr>
    </thead>
    <tbody>${body}${blanks}</tbody>
  </table>

  <div class="foot">
    <div class="tot">
      <span><span class="k">Позицій в обліку:</span> <span class="v">${rows.length}</span></span>
      <span><span class="k">Разом обліковий залишок:</span> <span class="v">${fmt(totalQty)}</span></span>
      <span><span class="k">Фактично виявлено:</span> <span class="v">_____________</span></span>
    </div>
    <div class="sign">
      <div><div class="role">Матеріально відповідальна особа</div><div class="ln"></div><div class="cap">підпис / ПІБ</div></div>
      <div><div class="role">Перерахунок провів</div><div class="ln"></div><div class="cap">підпис / ПІБ</div></div>
      <div><div class="role">Перевірив</div><div class="ln"></div><div class="cap">підпис / ПІБ</div></div>
    </div>
    <div class="hint">
      Колонки «Фактично» та «Розбіжність» заповнюються від руки під час перерахунку.
      Розбіжність = фактично мінус обліковий залишок. Порожні рядки в кінці —
      для позицій, знайдених на складі, але відсутніх в обліку.
    </div>
  </div>
</div>`;
};

/**
 * Формує відомість і відкриває діалог друку.
 * У діалозі обирається «Зберегти як PDF» — на виході векторний PDF-документ.
 *
 * @param {Array}  sections   [{ warehouse: {name, address}, rows: [{sku, name, unit, onHand}] }]
 * @param {String} scopeText  опис фільтрів, під якими зібрано документ
 * @param {String} compiledBy ПІБ того, хто сформував
 * @param {String} docTitle   назва документа — Chrome підставляє її як ім'я файлу PDF
 */
export function printInventorySheet({ sections, scopeText, compiledBy, docTitle }) {
    return new Promise((resolve, reject) => {
        const dateStr = new Date().toLocaleDateString('uk-UA');
        const sheets = sections
            .map(({ warehouse, rows }) => sheetHtml({ warehouse, rows, dateStr, compiledBy, scopeText }))
            .join('');

        const iframe = document.createElement('iframe');
        // Не display:none і не нульовий розмір — інакше частина браузерів
        // не розкладає вміст і віддає на друк порожній аркуш.
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.opacity = '0';
        iframe.style.border = '0';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);

        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            // Прибираємо не одразу: частина браузерів читає документ уже після виклику print()
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 500);
            resolve();
        };

        try {
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`<!doctype html><html lang="uk"><head><meta charset="utf-8">`
                + `<title>${esc(docTitle)}</title><style>${STYLES}</style></head>`
                + `<body><div class="screen-only">У діалозі друку оберіть «Зберегти як PDF».</div>`
                + `${sheets}</body></html>`);
            doc.close();

            const run = () => {
                try {
                    const win = iframe.contentWindow;
                    win.addEventListener('afterprint', cleanup, { once: true });
                    win.focus();
                    win.print();
                    // Частина браузерів не шле afterprint — підстраховуємось таймером
                    setTimeout(cleanup, 60000);
                } catch (err) {
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    reject(err);
                }
            };

            // Даємо браузеру кадр на розкладку вмісту iframe перед друком
            if (doc.readyState === 'complete') requestAnimationFrame(() => setTimeout(run, 60));
            else iframe.onload = () => requestAnimationFrame(() => setTimeout(run, 60));
        } catch (err) {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            reject(err);
        }
    });
}
