// =====================================================================
//  Лист комплектації — те, з чим комірник іде по складу.
//
//  Друкується так само, як інвентаризаційна відомість: розмітка у
//  прихованому iframe, далі діалог друку браузера. «Зберегти як PDF»
//  дає векторний документ, кирилиця не потребує вбудованих шрифтів.
//
//  Головне на аркуші — колонка «Взято», яку відмічають ручкою, і
//  колонка «Є на складі», щоб було видно, де очікувати проблему.
// =====================================================================

import { COMPANY_INFO } from './companyInfo';

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmt = (n) => {
    const num = Number(n) || 0;
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 1000) / 1000);
};

const dateStr = (v) => v ? new Date(v).toLocaleDateString('uk-UA') : '—';

const STYLES = `
@page { size: A4 portrait; margin: 12mm 10mm 14mm; }

*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; background:#fff; }
body{
  font-family:"Segoe UI",Arial,"Helvetica Neue",sans-serif;
  color:#111827; font-size:9pt; line-height:1.4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}

.org{ display:flex; justify-content:space-between; align-items:flex-start;
      font-size:8pt; color:#4b5563; line-height:1.45; }
.org b{ display:block; color:#111827; font-size:9.5pt; margin-bottom:1mm; }
.org .right{ text-align:right; white-space:nowrap; }

.title{ margin-top:5mm; text-align:center; font-size:14pt; font-weight:700;
        letter-spacing:.05em; color:#0f172a; }
.docno{ text-align:center; font-size:11pt; font-weight:700; color:#0f172a; margin-top:1mm; }
.rule{ border-top:1.6pt solid #0f172a; border-bottom:.5pt solid #0f172a;
       height:1.6mm; margin:2.5mm 0 5mm; }

.meta{ display:flex; flex-wrap:wrap; gap:1.5mm 8mm; font-size:9pt; margin-bottom:2mm; }
.meta .k{ color:#6b7280; }
.meta .v{ font-weight:700; }
.note{ margin:2mm 0 4mm; padding:2mm 3mm; border-left:1.5pt solid #94a3b8;
       background:#f8fafc; font-size:8.5pt; color:#374151; }

table{ width:100%; border-collapse:collapse; table-layout:fixed; page-break-inside:auto; }
thead{ display:table-header-group; }
tr{ page-break-inside:avoid; }

th{ background:#eef2f7; border:.5pt solid #94a3b8; color:#1f2937;
    font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.03em;
    padding:2mm 1.5mm; text-align:center; line-height:1.25; }
th.running{ background:#fff; border:none; border-bottom:.5pt solid #cbd5e1;
            text-align:left; text-transform:none; letter-spacing:0;
            font-size:7.5pt; font-weight:400; color:#6b7280; padding:1mm 0 1.5mm; }
th.running b{ color:#111827; }

td{ border:.5pt solid #cbd5e1; padding:1.8mm 1.5mm; font-size:8.5pt;
    line-height:1.3; vertical-align:middle; height:8mm; }
tbody tr:nth-child(even) td{ background:#fafbfc; }

.c-num{ text-align:center; color:#6b7280; font-size:8pt; }
.c-sku{ font-family:Consolas,"Courier New",monospace; font-size:7.5pt;
        color:#374151; text-align:center; word-break:break-all; }
.c-name{ font-weight:600; color:#0f172a; }
.c-name i{ display:block; font-weight:400; color:#6b7280; font-size:7.5pt; font-style:italic; }
.c-unit{ text-align:center; color:#6b7280; font-size:8pt; }
.c-qty{ text-align:center; font-weight:700; font-size:9.5pt; }
.c-have{ text-align:center; font-size:8pt; }
.c-have.short{ color:#b91c1c; font-weight:700; }
.c-have.ok{ color:#047857; }
/* Колонка під галочку комірника */
.c-take{ background:#fffdf3 !important; border-left:1pt solid #94a3b8 !important; }

.foot{ margin-top:6mm; page-break-inside:avoid; }
.sign{ display:flex; gap:10mm; margin-top:8mm; }
.sign > div{ flex:1; }
.sign .role{ font-size:8.5pt; font-weight:600; color:#111827; margin-bottom:9mm; }
.sign .ln{ border-bottom:.5pt solid #6b7280; height:0; margin-bottom:1.5mm; }
.sign .cap{ font-size:7pt; color:#9ca3af; text-align:center; }
.hint{ margin-top:6mm; font-size:7.5pt; color:#6b7280; line-height:1.5;
       border-left:1.2pt solid #cbd5e1; padding-left:3mm; }

.screen-only{ padding:14px 18px; background:#fef3c7; color:#78350f;
              font-size:12px; font-weight:600; }
@media print { .screen-only{ display:none !important; } }
`;

/**
 * Друкує лист комплектації.
 *
 * @param {Object} doc  { number, date, neededBy, warehouse, recipient,
 *                        recipientPhone, purpose, requestedBy, notes }
 * @param {Array}  rows [{ name, sku, unit, requested, issued, outstanding, available, note }]
 */
export function printPickingList({ doc, rows }) {
    return new Promise((resolve, reject) => {
        const body = rows.map((r, i) => {
            const short = r.available != null && r.available < r.outstanding;
            const haveCell = r.available == null
                ? '<td class="c-have">—</td>'
                : `<td class="c-have ${short ? 'short' : 'ok'}">${fmt(r.available)}</td>`;
            return `
<tr>
  <td class="c-num">${i + 1}</td>
  <td class="c-sku">${esc(r.sku || '—')}</td>
  <td class="c-name">${esc(r.name)}${r.note ? `<i>${esc(r.note)}</i>` : ''}</td>
  <td class="c-unit">${esc(r.unit || 'шт')}</td>
  <td class="c-qty">${fmt(r.outstanding)}</td>
  ${haveCell}
  <td class="c-take"></td>
  <td class="c-take"></td>
</tr>`;
        }).join('');

        const totalLines = rows.length;
        const totalQty = rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);
        const problems = rows.filter(r => r.available != null && r.available < r.outstanding).length;

        const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<title>${esc(doc.number)}</title><style>${STYLES}</style></head><body>
<div class="screen-only">У діалозі друку оберіть «Зберегти як PDF» або друкуйте одразу.</div>

<div class="org">
  <div>
    <b>${esc(COMPANY_INFO.name)}</b>
    ЄДРПОУ ${esc(COMPANY_INFO.edrpou)}<br>${esc(COMPANY_INFO.address)}
  </div>
  <div class="right">тел. ${esc(COMPANY_INFO.phone)}</div>
</div>

<div class="title">ЛИСТ КОМПЛЕКТАЦІЇ</div>
<div class="docno">${esc(doc.number)}</div>
<div class="rule"></div>

<div class="meta">
  <span><span class="k">Кому:</span> <span class="v">${esc(doc.recipient)}</span></span>
  ${doc.recipientPhone ? `<span><span class="k">Телефон:</span> <span class="v">${esc(doc.recipientPhone)}</span></span>` : ''}
  <span><span class="k">Зі складу:</span> <span class="v">${esc(doc.warehouse || '—')}</span></span>
</div>
<div class="meta">
  <span><span class="k">Створено:</span> <span class="v">${dateStr(doc.date)}</span></span>
  ${doc.neededBy ? `<span><span class="k">Потрібно до:</span> <span class="v">${dateStr(doc.neededBy)}</span></span>` : ''}
  <span><span class="k">Склав:</span> <span class="v">${esc(doc.requestedBy || '—')}</span></span>
  <span><span class="k">Операція:</span> <span class="v">${esc(doc.purpose || '—')}</span></span>
</div>

${doc.notes ? `<div class="note">${esc(doc.notes)}</div>` : ''}
${problems > 0 ? `<div class="note" style="border-left-color:#dc2626;background:#fef2f2;color:#991b1b">
  Увага: за ${problems} позиціями на складі менше, ніж потрібно. Дивіться колонку «Є на складі».
</div>` : ''}

<table>
  <colgroup>
    <col style="width:5%"><col style="width:12%"><col style="width:34%"><col style="width:6%">
    <col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:11%">
  </colgroup>
  <thead>
    <tr><th class="running" colspan="8">
      <b>Лист комплектації ${esc(doc.number)}</b> · ${esc(doc.recipient)} · склад «${esc(doc.warehouse || '—')}»
    </th></tr>
    <tr>
      <th>№</th><th>SKU</th><th>Найменування</th><th>Од.</th>
      <th>Треба</th><th>Є на складі</th><th>Взято</th><th>Примітка</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>

<div class="foot">
  <div class="meta" style="margin-top:4mm">
    <span><span class="k">Позицій:</span> <span class="v">${totalLines}</span></span>
    <span><span class="k">Разом одиниць:</span> <span class="v">${fmt(totalQty)}</span></span>
  </div>
  <div class="sign">
    <div><div class="role">Видав (комірник)</div><div class="ln"></div><div class="cap">підпис / ПІБ</div></div>
    <div><div class="role">Отримав</div><div class="ln"></div><div class="cap">підпис / ПІБ</div></div>
  </div>
  <div class="hint">
    Колонку «Взято» заповнює комірник під час збирання. Після цього видачу
    треба підтвердити в системі — саме тоді товар спишеться зі складу.
    Доки підтвердження немає, залишок лишається незмінним.
  </div>
</div>
</body></html>`;

        const iframe = document.createElement('iframe');
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
            setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 500);
            resolve();
        };

        try {
            const d = iframe.contentWindow.document;
            d.open(); d.write(html); d.close();

            const run = () => {
                try {
                    const win = iframe.contentWindow;
                    win.addEventListener('afterprint', cleanup, { once: true });
                    win.focus();
                    win.print();
                    setTimeout(cleanup, 60000);
                } catch (err) {
                    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    reject(err);
                }
            };

            if (d.readyState === 'complete') requestAnimationFrame(() => setTimeout(run, 60));
            else iframe.onload = () => requestAnimationFrame(() => setTimeout(run, 60));
        } catch (err) {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            reject(err);
        }
    });
}
