// =====================================================================
//  K-CORE · Стара адреса «Звіти монтажу» (/brigade-reports)
//
//  Окремої сторінки звітів більше немає — звіти живуть у картці об'єкта
//  (вкладка «Звіти монтажу»). Старі посилання (з дзвіночка, закладок)
//  ведуть туди: ?r=<id> — у картку того об'єкта з розгорнутим звітом.
// =====================================================================

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Spinner } from './ui';

export default function BrigadeReportsRedirect() {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    useEffect(() => {
        const r = params.get('r');
        if (!r) { navigate('/today', { replace: true }); return; }
        supabase.from('installer_reports').select('installation_custom_id').eq('id', r).maybeSingle()
            .then(({ data }) => navigate(data ? `/project/${data.installation_custom_id}?tab=reports&r=${r}` : '/today', { replace: true }));
    }, [params, navigate]);

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <Spinner className="w-6 h-6 text-slate-400" />
        </div>
    );
}
