// =====================================================================
//  K-CORE · Особисті налаштування вигляду (employees.ui_prefs)
//
//  Що людина вибрала для себе на екрані — однаково на телефоні й
//  комп'ютері. Кожен екран має свій розділ: today, …
//  useUiPrefs(section, defaults) → [prefs, save]: save(next) одразу
//  показує зміну і зберігає в базі, не чіпаючи інших розділів.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Збережене поверх стандартного; вкладені об'єкти — теж поверх стандартних */
export const mergePrefs = (defaults, saved) => {
    const out = { ...defaults };
    Object.entries(saved || {}).forEach(([k, v]) => {
        out[k] = isPlain(defaults[k]) && isPlain(v) ? { ...defaults[k], ...v } : v;
    });
    return out;
};

export function useUiPrefs(section, defaults) {
    const { employee } = useAuth();
    const defaultsRef = useRef(defaults);
    const [prefs, setPrefs] = useState(() => mergePrefs(defaults, employee?.ui_prefs?.[section]));
    const all = useRef(employee?.ui_prefs || {});
    const loaded = useRef(!!employee);

    // Профіль міг завантажитись пізніше за екран — тоді беремо збережене один раз
    useEffect(() => {
        if (!employee) return;
        all.current = { ...(employee.ui_prefs || {}), ...all.current };
        if (!loaded.current) {
            loaded.current = true;
            setPrefs(mergePrefs(defaultsRef.current, employee.ui_prefs?.[section]));
        }
    }, [employee, section]);

    const save = useCallback(async (next) => {
        setPrefs(next);
        all.current = { ...all.current, [section]: next };
        if (!employee?.id) return;
        await supabase.from('employees').update({ ui_prefs: all.current }).eq('id', employee.id);
    }, [employee?.id, section]);

    return [prefs, save];
}
