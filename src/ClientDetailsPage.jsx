import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FaArrowLeft, FaPhone, FaMapMarkerAlt, FaBuilding, FaHandshake,
  FaHardHat, FaExternalLinkAlt, FaBolt, FaCalendarAlt, FaProjectDiagram,
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { T, Chip, Card, EmptyState, Skeleton, useToast, humanError } from "./ui";

const STATUS_INFO = {
  planning: { label: 'Планування', tone: 'info' },
  in_progress: { label: 'Виконується', tone: 'accent' },
  on_hold: { label: 'Призупинено', tone: 'warn' },
  completed: { label: 'Завершено', tone: 'ok' },
  cancelled: { label: 'Скасовано', tone: 'danger' },
};

const PAYMENT_INFO = {
  pending: { label: 'Очікує оплати', tone: 'warn' },
  partial: { label: 'Часткова оплата', tone: 'info' },
  paid: { label: 'Оплачено', tone: 'ok' },
  overdue: { label: 'Прострочено', tone: 'danger' },
};

export default function ClientDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [client, setClient] = useState(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients').select('*').eq('custom_id', id).single();
      if (clientError) throw clientError;
      if (!clientData) { toast('Клієнта не знайдено', 'error'); navigate('/clients'); return; }
      setClient(clientData);

      const { data: objData, error: objError } = await supabase
        .from('installations')
        .select('custom_id, name, status, workflow_stage, capacity_kw, total_cost, paid_amount, payment_status, created_at')
        .eq('client_id', clientData.custom_id)
        .order('created_at', { ascending: false });
      if (objError) throw objError;
      setObjects(objData || []);
    } catch (error) {
      toast(humanError(error), 'error');
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('uk-UA') : '—';

  if (loading) {
    return (
      <Layout>
        <div className="p-6"><Skeleton rows={8} /></div>
      </Layout>
    );
  }

  if (!client) return null;

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-[1200px] mx-auto space-y-4">

        <button onClick={() => navigate('/clients')}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:text-indigo-800">
          <FaArrowLeft size={11} /> Усі клієнти
        </button>

        {/* CONTACT CARD */}
        <Card>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{client.company_name || client.name}</h1>
                <span className={T.mono}>ID {client.custom_id}</span>
                {client.is_subcontract && (
                  <Chip tone="warn" icon={FaHandshake}>{client.contractor_company || 'Субпідряд'}</Chip>
                )}
              </div>
              {client.company_name && <p className="text-[13px] text-slate-500 mt-0.5">{client.name}</p>}
            </div>
            {client.working_company && <Chip tone="accent">{client.working_company}</Chip>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div className={`${T.inset} px-3 py-2.5 flex items-center gap-2.5`}>
              <FaPhone className="text-slate-400 flex-shrink-0" size={13} />
              {client.phone
                ? <a href={`tel:${client.phone}`} className="text-[13px] font-bold text-indigo-700">{client.phone}</a>
                : <span className="text-[13px] text-slate-400">Телефон не вказано</span>}
            </div>
            <div className={`${T.inset} px-3 py-2.5 flex items-center gap-2.5`}>
              <FaMapMarkerAlt className="text-slate-400 flex-shrink-0" size={13} />
              <span className="text-[13px] font-semibold text-slate-700">
                {[client.populated_place, client.oblast].filter(Boolean).join(', ') || 'Локація не вказана'}
              </span>
            </div>
            <div className={`${T.inset} px-3 py-2.5 flex items-center gap-2.5`}>
              <FaBuilding className="text-slate-400 flex-shrink-0" size={13} />
              <span className="text-[13px] font-semibold text-slate-700">{client.object_type || 'Тип об\'єкта не вказано'}</span>
            </div>
            <div className={`${T.inset} px-3 py-2.5 flex items-center gap-2.5`}>
              <FaCalendarAlt className="text-slate-400 flex-shrink-0" size={13} />
              <span className="text-[13px] font-semibold text-slate-700">Перший контакт: {formatDate(client.first_contact)}</span>
            </div>
          </div>

          {client.notes && (
            <div className={`${T.inset} px-3 py-2.5 mt-3 text-[12.5px] text-slate-600 whitespace-pre-wrap`}>
              {client.notes}
            </div>
          )}
        </Card>

        {/* OBJECTS LIST */}
        <Card pad="p-0" className="overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <FaHardHat className="text-indigo-500" size={13} />
            <h3 className="text-[13.5px] font-extrabold text-slate-800">Об'єкти клієнта</h3>
            <Chip tone="neutral">{objects.length}</Chip>
          </div>

          {objects.length === 0 ? (
            <EmptyState icon={FaProjectDiagram} title="Об'єктів ще немає" hint="У цього клієнта поки немає жодного об'єкта в системі." />
          ) : (
            <div className="divide-y divide-slate-100">
              {objects.map(o => {
                const statusInfo = STATUS_INFO[o.status] || { label: o.status || '—', tone: 'neutral' };
                const paymentInfo = PAYMENT_INFO[o.payment_status] || null;
                return (
                  <a key={o.custom_id} href={`#/project/${o.custom_id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-slate-900">{o.name || `Об'єкт #${o.custom_id}`}</span>
                        <span className={T.mono}>СЕС-{o.custom_id}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <Chip tone={statusInfo.tone}>{statusInfo.label}</Chip>
                        {paymentInfo && <Chip tone={paymentInfo.tone}>{paymentInfo.label}</Chip>}
                        {o.capacity_kw && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <FaBolt className="text-amber-500" size={10} /> {o.capacity_kw} кВт
                          </span>
                        )}
                      </div>
                    </div>
                    <FaExternalLinkAlt className="text-slate-300 flex-shrink-0" size={12} />
                  </a>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
