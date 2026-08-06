import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaPrint, FaFileInvoice, FaCog } from 'react-icons/fa';
import { useReactToPrint } from 'react-to-print';
import { COMPANY_INFO } from '../utils/companyInfo';
import { amountToWordsUa } from '../utils/numberToWordsUa';

const TITLES = {
    sale: 'Видаткова накладна',
    partner_transfer: 'Видаткова накладна (передача партнеру)',
    issue: 'Накладна на видачу під об’єкт',
};

const CURRENCY_SIGN = { UAH: 'грн', USD: 'USD', EUR: 'EUR' };

const fmtQty = (n) => {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso || Date.now()).toLocaleDateString('uk-UA');

// Стилі верстки друкуються разом із вузлом, тому не залежать від Tailwind
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.dn-sheet { font-family: "Times New Roman", Times, serif; color: #000; font-size: 12px; line-height: 1.35; background: #fff; }
.dn-sheet * { box-sizing: border-box; }
.dn-title { text-align: center; font-size: 17px; font-weight: bold; margin: 0 0 2px; }
.dn-subtitle { text-align: center; font-size: 12px; margin-bottom: 14px; }
.dn-parties { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.dn-parties td { vertical-align: top; padding: 2px 0; }
.dn-label { width: 130px; font-weight: bold; white-space: nowrap; padding-right: 8px !important; }
.dn-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.dn-table th, .dn-table td { border: 1px solid #000; padding: 4px 6px; }
.dn-table th { background: #f2f2f2; font-size: 11px; text-align: center; }
.dn-table td.num { text-align: center; white-space: nowrap; }
.dn-table td.money { text-align: right; white-space: nowrap; }
.dn-table tfoot td { font-weight: bold; }
.dn-sku { font-size: 10px; color: #444; }
.dn-total-words { margin: 10px 0 4px; }
.dn-notes { margin-top: 8px; font-size: 11px; font-style: italic; }
.dn-signs { width: 100%; border-collapse: collapse; margin-top: 34px; }
.dn-signs td { width: 50%; vertical-align: bottom; padding-top: 6px; }
.dn-signline { border-bottom: 1px solid #000; height: 18px; margin: 0 60px 3px 0; }
.dn-signcap { font-size: 10px; color: #333; margin-right: 60px; text-align: center; }
`;

export default function DeliveryNoteModal({ isOpen, onClose, doc }) {
    const printRef = useRef(null);
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: doc?.number || 'Видаткова накладна',
    });

    // Налаштування друку (у документ не потрапляють)
    const [showPrices, setShowPrices] = useState(true);
    const [showObject, setShowObject] = useState(true);
    const [displayCurrency, setDisplayCurrency] = useState('UAH');

    useEffect(() => {
        setShowPrices(true);
        setShowObject(true);
        setDisplayCurrency('UAH');
    }, [doc?.number]);

    if (!doc) return null;

    const items = doc.items || [];
    const hasPrices = items.some(i => i.price !== null && i.price !== undefined);

    // Валюта документа і перерахунок у гривню за курсом операції
    const docCurrency = doc.currency || 'UAH';
    const rate = Number(doc.exchangeRate) || 0;
    const canShowUah = docCurrency === 'UAH' || rate > 0;
    const effCurrency = (displayCurrency === 'UAH' && canShowUah) ? 'UAH' : docCurrency;
    const factor = (effCurrency === 'UAH' && docCurrency !== 'UAH') ? rate : 1;

    const withPrices = showPrices && hasPrices;
    const priceOf = (i) => (i.price === null || i.price === undefined) ? null : Number(i.price) * factor;
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (priceOf(i) || 0), 0);
    const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const curLabel = CURRENCY_SIGN[effCurrency] || effCurrency;

    const buyerLine = [
        doc.buyerPhone ? `тел. ${doc.buyerPhone}` : null,
        doc.buyerId ? `ID #${doc.buyerId}` : null,
    ].filter(Boolean).join(', ');

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[90]">
                    <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-[24px] sm:rounded-[24px] w-full sm:max-w-4xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" onClick={e => e.stopPropagation()}>

                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FaFileInvoice className="text-indigo-500" /> {TITLES[doc.kind] || TITLES.sale}</h2>
                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">№ {doc.number} від {fmtDate(doc.date)} • позицій: {items.length}</p>
                                </div>
                                <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm flex-shrink-0"><FaTimes /></button>
                            </div>

                            {/* Налаштування — на друк не йдуть */}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><FaCog size={10} /> Друкувати:</span>

                                <button
                                    type="button"
                                    onClick={() => setShowPrices(p => !p)}
                                    disabled={!hasPrices}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${withPrices ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                    title={hasPrices ? 'Показувати ціни та суми в накладній' : 'У цій операції немає цін'}
                                >
                                    {withPrices ? 'З вартістю' : 'Без вартості'}
                                </button>

                                {withPrices && docCurrency !== 'UAH' && (
                                    <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => setDisplayCurrency('UAH')}
                                            disabled={!canShowUah}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors disabled:opacity-40 ${effCurrency === 'UAH' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                                            title={canShowUah ? `Перерахунок за курсом ${fmtMoney(rate)}` : 'Курс операції невідомий'}
                                        >
                                            у гривні
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDisplayCurrency(docCurrency)}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${effCurrency !== 'UAH' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                                        >
                                            у {docCurrency}
                                        </button>
                                    </div>
                                )}

                                {doc.objectLabel && (
                                    <button
                                        type="button"
                                        onClick={() => setShowObject(o => !o)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${showObject ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        Об’єкт
                                    </button>
                                )}
                            </div>
                            {withPrices && effCurrency === 'UAH' && docCurrency !== 'UAH' && (
                                <p className="text-[10px] text-slate-400 font-medium mt-1.5">Суми перераховано з {docCurrency} за курсом {fmtMoney(rate)} ₴, зафіксованим в операції.</p>
                            )}
                        </div>

                        {/* Попередній перегляд аркуша */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-200 p-3 sm:p-6">
                            <div className="bg-white mx-auto shadow-lg p-6 sm:p-10" style={{ maxWidth: '210mm' }}>
                                <div ref={printRef} className="dn-sheet">
                                    <style>{PRINT_CSS}</style>

                                    <div className="dn-title">{TITLES[doc.kind] || TITLES.sale} № {doc.number}</div>
                                    <div className="dn-subtitle">від {fmtDate(doc.date)} р.</div>

                                    <table className="dn-parties">
                                        <tbody>
                                            <tr>
                                                <td className="dn-label">Постачальник:</td>
                                                <td>
                                                    <b>{COMPANY_INFO.name}</b>
                                                    {COMPANY_INFO.edrpou ? `, ЄДРПОУ ${COMPANY_INFO.edrpou}` : ''}
                                                    {COMPANY_INFO.address ? `, ${COMPANY_INFO.address}` : ''}
                                                    {COMPANY_INFO.phone ? `, тел. ${COMPANY_INFO.phone}` : ''}
                                                    {COMPANY_INFO.iban ? `, IBAN ${COMPANY_INFO.iban}` : ''}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="dn-label">Одержувач:</td>
                                                <td>
                                                    <b>{doc.buyerName || '—'}</b>
                                                    {buyerLine ? `, ${buyerLine}` : ''}
                                                </td>
                                            </tr>
                                            {showObject && doc.objectLabel && (
                                                <tr>
                                                    <td className="dn-label">Об’єкт:</td>
                                                    <td>{doc.objectLabel}</td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td className="dn-label">Відвантажено зі складу:</td>
                                                <td>{doc.warehouseName || '—'}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <table className="dn-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '32px' }}>№</th>
                                                <th>Найменування товару</th>
                                                <th style={{ width: '52px' }}>Од.</th>
                                                <th style={{ width: '62px' }}>К-сть</th>
                                                {withPrices && <th style={{ width: '90px' }}>Ціна, {curLabel}</th>}
                                                {withPrices && <th style={{ width: '100px' }}>Сума, {curLabel}</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((it, idx) => {
                                                const price = priceOf(it);
                                                return (
                                                    <tr key={idx}>
                                                        <td className="num">{idx + 1}</td>
                                                        <td>
                                                            {it.name}
                                                            {it.sku && <div className="dn-sku">SKU: {it.sku}</div>}
                                                        </td>
                                                        <td className="num">{it.unit || 'шт'}</td>
                                                        <td className="num">{fmtQty(it.qty)}</td>
                                                        {withPrices && <td className="money">{price !== null ? fmtMoney(price) : '—'}</td>}
                                                        {withPrices && <td className="money">{price !== null ? fmtMoney((Number(it.qty) || 0) * price) : '—'}</td>}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={3} className="money">Разом:</td>
                                                <td className="num">{fmtQty(totalQty)}</td>
                                                {withPrices && <td></td>}
                                                {withPrices && <td className="money">{fmtMoney(total)}</td>}
                                            </tr>
                                        </tfoot>
                                    </table>

                                    {withPrices ? (
                                        <div className="dn-total-words">
                                            Всього відпущено на суму: <b>{amountToWordsUa(total, effCurrency)}</b>
                                        </div>
                                    ) : (
                                        <div className="dn-total-words">
                                            Всього відпущено найменувань: <b>{items.length}</b>, загальна кількість: <b>{fmtQty(totalQty)}</b>
                                        </div>
                                    )}

                                    {doc.notes && <div className="dn-notes">Примітка: {doc.notes}</div>}

                                    <table className="dn-signs">
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <div>Відпустив:</div>
                                                    <div className="dn-signline"></div>
                                                    <div className="dn-signcap">{COMPANY_INFO.signatory || doc.responsibleName || '(підпис, ПІБ)'}</div>
                                                </td>
                                                <td>
                                                    <div>Отримав:</div>
                                                    <div className="dn-signline"></div>
                                                    <div className="dn-signcap">(підпис, ПІБ)</div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0 pb-safe">
                            <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Закрити</button>
                            <button type="button" onClick={handlePrint} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2">
                                <FaPrint /> Друк
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
