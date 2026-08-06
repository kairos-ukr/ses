// Сума прописом українською — для підсумкового рядка видаткової накладної.

const ONES_M = ['', 'один', 'два', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const ONES_F = ['', 'одна', 'дві', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять'];
const TEENS = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', 'п’ятнадцять', 'шістнадцять', 'сімнадцять', 'вісімнадцять', 'дев’ятнадцять'];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', 'п’ятдесят', 'шістдесят', 'сімдесят', 'вісімдесят', 'дев’яносто'];
const HUNDREDS = ['', 'сто', 'двісті', 'триста', 'чотириста', 'п’ятсот', 'шістсот', 'сімсот', 'вісімсот', 'дев’ятсот'];

// Групи розрядів: [одн., 2-4, 5+], чи жіночий рід
const GROUPS = [
    { forms: null, feminine: false },                                       // одиниці
    { forms: ['тисяча', 'тисячі', 'тисяч'], feminine: true },
    { forms: ['мільйон', 'мільйони', 'мільйонів'], feminine: false },
    { forms: ['мільярд', 'мільярди', 'мільярдів'], feminine: false },
];

const CURRENCIES = {
    UAH: { main: ['гривня', 'гривні', 'гривень'], mainFeminine: true, frac: ['копійка', 'копійки', 'копійок'], fracShort: 'коп.' },
    USD: { main: ['долар', 'долари', 'доларів'], mainFeminine: false, frac: ['цент', 'центи', 'центів'], fracShort: 'ц.' },
    EUR: { main: ['євро', 'євро', 'євро'], mainFeminine: false, frac: ['цент', 'центи', 'центів'], fracShort: 'ц.' },
};

// Правильна форма слова для числа (1 гривня / 2 гривні / 5 гривень)
export function pluralUa(n, forms) {
    const abs = Math.abs(Math.trunc(n));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    const mod10 = abs % 10;
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
}

// Трійка розрядів (0..999) словами
function tripletToWords(num, feminine) {
    const words = [];
    const h = Math.floor(num / 100);
    const rest = num % 100;
    if (h) words.push(HUNDREDS[h]);
    if (rest >= 10 && rest <= 19) {
        words.push(TEENS[rest - 10]);
    } else {
        const t = Math.floor(rest / 10);
        const o = rest % 10;
        if (t) words.push(TENS[t]);
        if (o) words.push((feminine ? ONES_F : ONES_M)[o]);
    }
    return words.join(' ');
}

// Ціле число словами
export function integerToWordsUa(value, feminine = false) {
    let n = Math.trunc(Math.abs(value));
    if (n === 0) return 'нуль';

    const triplets = [];
    while (n > 0) {
        triplets.push(n % 1000);
        n = Math.floor(n / 1000);
    }

    const parts = [];
    for (let i = triplets.length - 1; i >= 0; i--) {
        const t = triplets[i];
        if (t === 0) continue;
        const group = GROUPS[i] || GROUPS[GROUPS.length - 1];
        const isFeminine = i === 0 ? feminine : group.feminine;
        parts.push(tripletToWords(t, isFeminine));
        if (group.forms) parts.push(pluralUa(t, group.forms));
    }
    return parts.join(' ');
}

/**
 * Сума прописом: 1234.56 UAH → «одна тисяча двісті тридцять чотири гривні 56 коп.»
 * Копійки лишаємо цифрами — так прийнято у первинних документах.
 */
export function amountToWordsUa(amount, currency = 'UAH') {
    const cfg = CURRENCIES[currency] || CURRENCIES.UAH;
    const value = Math.abs(Number(amount) || 0);
    const whole = Math.floor(value + 1e-9);
    const frac = Math.round((value - whole) * 100);

    // Округлення копійок могло дати 100
    const wholeFixed = frac === 100 ? whole + 1 : whole;
    const fracFixed = frac === 100 ? 0 : frac;

    const words = integerToWordsUa(wholeFixed, cfg.mainFeminine);
    const mainWord = pluralUa(wholeFixed, cfg.main);
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);

    return `${capitalized} ${mainWord} ${String(fracFixed).padStart(2, '0')} ${cfg.fracShort}`;
}
