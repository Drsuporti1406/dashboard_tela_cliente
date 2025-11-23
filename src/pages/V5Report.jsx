import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Chart from 'chart.js/auto';
import '../pages/V5Report.css';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import logoImg from '../assets/logo.png';

export default function V5Report() {
  const [allTickets, setAllTickets] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [displayedTickets, setDisplayedTickets] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clienteFilter, setClienteFilter] = useState('all');
  const [clienteName, setClienteName] = useState('all');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [unidadesList, setUnidadesList] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverTickets, setServerTickets] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [excludedRequerentes, setExcludedRequerentes] = useState([]);
  const [excludedCategorias, setExcludedCategorias] = useState([]);
  const [npsSummary, setNpsSummary] = useState({ total_responses: 0, promotores: 0, neutros: 0, detratores: 0, nps: 0 });
  const [tmaSummary, setTmaSummary] = useState({ solved_count: 0, avg_tma_minutes: null });
  // removed debouncedFilters: we will fetch immediately on filter change for realtime data

  const chartLinhaRef = useRef(null);
  const chartCategoriaRef = useRef(null);
  const chartCategoriaIdsRef = useRef([]);
  const chartUnidadeRef = useRef(null);
  const chartUsuarioRef = useRef(null);
  const chartUsuarioIdsRef = useRef([]);
  const chartNPSRef = useRef(null);
  const dateRangeRef = useRef(null);
  const fpRef = useRef(null);
  const latestFetchId = useRef(0);
  const currentRequestController = useRef(null);
  const lastChartKeyRef = useRef(null);
  // chartRenderTimerRef removed to avoid intentional delays
  const lastServerResponseFiltersRef = useRef(null);
  const chartsFetchId = useRef(0);

  const _VITE_BACKEND = import.meta.env.VITE_BACKEND_URL || '';
  const _BASE_URL = import.meta.env.BASE_URL || '';
  const BACKEND = (_VITE_BACKEND || _BASE_URL || '').replace(/\/$/, '');

  // forward minimal client-side debug events to the backend for offline inspection
  const clientLog = async (obj) => {
    try {
      // keep a small in-memory buffer so developers can inspect logs from the console
      if (typeof window !== 'undefined') {
        window.__v5_local_logs = window.__v5_local_logs || [];
        const entry = { source: 'V5Report', ts: new Date().toISOString(), ...obj };
        window.__v5_local_logs.push(entry);
        // keep last entry handy
        window.__v5_last = entry;
        // console output suppressed for cleaner UI; logs still forwarded via clientLog
      }
      // fire-and-forget; do not block UI on logging
      axios.post(`${BACKEND}/api/db/client-logs`, { source: 'V5Report', ts: new Date().toISOString(), ...obj }).catch(() => {});
    } catch (e) {
      // suppressed
    }
  };

  const parseDate = (str) => (str ? new Date(str) : null);
  const formatDate = (d) => {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('pt-BR');
  };
  const formatDateTime = (d) => {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    try {
      return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return `${formatDate(dt)} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  };
  // Safely decode HTML entities (browser-only) and strip HTML tags
  const decodeHtmlEntities = (html) => {
    try {
      if (typeof document !== 'undefined') {
        const txt = document.createElement('textarea');
        txt.innerHTML = String(html || '');
        return txt.value;
      }
    } catch (e) {}
    return String(html || '');
  };
  const stripHtmlTags = (s) => {
    try {
      return String(s || '').replace(/<[^>]*>/g, '');
    } catch (e) {
      return String(s || '');
    }
  };
  const renderPlainWithBreaks = (raw) => {
    const decoded = decodeHtmlEntities(raw);
    const stripped = stripHtmlTags(decoded);
    const parts = String(stripped || '').split(/\r?\n/);
    return parts.map((line, i) => (
      // keep line breaks but avoid using dangerouslySetInnerHTML
      <span key={i}>{line}{i < parts.length - 1 ? <br/> : null}</span>
    ));
  };
  const resolveClienteName = (t) => {
    // prefer textual cliente when available
    if (!t) return null;
    if (t.cliente && typeof t.cliente === 'string' && !/^\d+$/.test(t.cliente)) return t.cliente;
    // try common id fields
    const candidateIds = [t.cliente, t.cliente_id, t.entity_id, t.entities_id, t.entitiesId].filter(Boolean);
    for (const cid of candidateIds) {
      const found = (empresas || []).find((e) => String(e.id) === String(cid));
      if (found) return found.name;
    }
    // fallback to any provided name-like field
    if (t.cliente && typeof t.cliente === 'string') return t.cliente;
    if (t.cliente_name && typeof t.cliente_name === 'string') return t.cliente_name;
    return null;
  };
  const avg = (arr) => {
    const nums = arr.filter((n) => typeof n === 'number' && !isNaN(n));
    if (!nums.length) return 0;
    return nums.reduce((s, v) => s + v, 0) / nums.length;
  };
  const formatDurationFromMinutes = (minutes) => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '-';
    const mins = Number(minutes);
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    if (mins < 60) return `${Math.round(mins)} min`;
    return `${(mins / 60).toFixed(1)}h`;
  };

  const formatDurationTmeFromTicket = (t) => {
    // start = ticket date, end = takeintoaccountdate (when attendance started)
    const start = t.date || null;
    const end = t.takeintoaccountdate || null;
    if (start && end) {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        const secs = Math.round((e - s) / 1000);
        if (secs < 60) return `${secs}s`;
        if (secs < 3600) return `${Math.round(secs / 60)} min`;
        return `${(secs / 3600).toFixed(1)}h`;
      }
    }
    // fallback to tmeMin (minutes)
    const minutes = (t.tmeMin !== null && t.tmeMin !== undefined) ? Number(t.tmeMin) : null;
    if (minutes === null || isNaN(minutes)) return '-';
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    return `${(minutes / 60).toFixed(1)}h`;
  };
  const formatDurationFromTicket = (t) => {
    // prefer precise timestamps when available
    const start = t.takeintoaccountdate || t.date || null;
    const end = t.solvedate || t.closedate || null;
    if (start && end) {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        const secs = Math.round((e - s) / 1000);
        if (secs < 60) return `${secs}s`;
        if (secs < 3600) return `${Math.round(secs / 60)} min`;
        return `${(secs / 3600).toFixed(1)}h`;
      }
    }
    // fallback to provided minutes values (tempoSolucaoMin or tmaMin)
    const minutes = (t.tempoSolucaoMin !== null && t.tempoSolucaoMin !== undefined) ? Number(t.tempoSolucaoMin) : (typeof t.tmaMin === 'number' ? Number(t.tmaMin) : null);
    if (minutes === null || isNaN(minutes)) return '-';
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    return `${(minutes / 60).toFixed(1)}h`;
  };
  
  // generate distinct colors for charts
  const makeColors = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const hue = Math.round((i * 360) / Math.max(1, n));
      out.push(`hsl(${hue} 70% 55%)`);
    }
    return out;
  };
  // convert hex like '#22c55e' to {r,g,b}
  const hexToRgb = (hex) => {
    if (!hex) return null;
    const h = String(hex).replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map((c)=>c+c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  };
  const fadeHex = (hex, alpha = 0.28) => {
    const c = hexToRgb(hex);
    if (!c) return hex;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };
  // group array of objects by key and return [[key, count], ...]
  const groupCount = (arr, key) => {
    const m = Object.create(null);
    (arr || []).forEach((it) => {
      let k = null;
      if (it && Object.prototype.hasOwnProperty.call(it, key)) {
        k = it[key];
      }
      if (k === null || k === undefined || String(k) === '') k = 'Não informado';
      const ks = String(k);
      m[ks] = (m[ks] || 0) + 1;
    });
    return Object.keys(m).map((k) => [k, m[k]]);
  };
  
  const within = (date, start, end) => {
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };
  const applyExclusions = (tickets) => {
    if (!tickets || !tickets.length) return [];
    const exclReq = (excludedRequerentes || []).map((p) => String(p));
    const exclCat = (excludedCategorias || []).map((p) => String(p));
    if (!exclReq.length && !exclCat.length) return tickets.slice();
    return tickets.filter((t) => {
      // requerente key
      const idVal = (t && (t.requerenteId !== null && t.requerenteId !== undefined)) ? Number(t.requerenteId) : null;
      const req = t && t.requerente ? t.requerente : 'Não informado';
      const reqKey = (idVal !== null && !isNaN(idVal)) ? String(idVal) : String(req);
      if (exclReq.indexOf(reqKey) !== -1) return false;
      // categoria key (use resolved categoria string)
      let cat = 'Não informado';
      if (t && t.categoria) cat = String(t.categoria);
      else if (t && (t.categoria_id || t.itilcategories_id) && categorias && categorias.length) {
        const cid = t.categoria_id || t.itilcategories_id;
        const found = categorias.find((c) => String(c.id) === String(cid));
        if (found) cat = found.name;
      }
      // support 'Outros' special slice: when user toggles 'Outros', it should target tickets whose
      // category is NOT in the top labels currently shown by the category chart.
      const topLabels = chartCategoriaIdsRef.current || [];
      if (exclCat.indexOf('Outros') !== -1) {
        if (topLabels.length && topLabels.indexOf(cat) === -1) return false;
      }
      if (exclCat.indexOf(cat) !== -1) return false;
      return true;
    });
  };
  // helper: determine if a ticket status represents a closed/encerrado ticket
  const isClosedStatus = (status) => {
    if (typeof status === 'number') return status >= 5; // GLPI common: 5/6 are solved/closed
    if (typeof status === 'string') return String(status).toLowerCase() === 'encerrado' || String(status).toLowerCase() === 'closed' || String(status).toLowerCase() === 'resolvido' || String(status).toLowerCase() === 'solucionado';
    return false;
  };

  // helper: map ticket object to simple status key: 'play' | 'pause' | 'check'
  const ticketStatusClass = (ticket) => {
    try {
      if (!ticket) return 'pause';
      const st = ticket.status;
      const label = (ticket.statusLabel || '').toString().toLowerCase();
      if (typeof st === 'number' && st >= 5) return 'check';
      if (label.indexOf('fechado') !== -1 || label.indexOf('resolvid') !== -1 || label.indexOf('solucionad') !== -1) return 'check';
      if (label.indexOf('pend') !== -1) return 'pause';
      if (label.indexOf('atend') !== -1 || label.indexOf('em atendimento') !== -1) return 'play';
      // fallback: if technician has taken the ticket, consider 'em atendimento'
      if (ticket.takeintoaccountdate) return 'play';
      return 'pause';
    } catch (e) {
      return 'pause';
    }
  };
  // NPS classification for 1-5 scale:
  // 5 -> promotor, 4 -> neutro (passive), 1-3 -> detrator
  const classificaNps = (nota) => {
    if (typeof nota !== 'number' || isNaN(nota)) return null;
    if (nota >= 5) return 'promotor';
    if (nota === 4) return 'neutro';
    return 'detrator';
  };

  const npsScore = (notas) => {
    const arr = (notas || []).filter((n) => typeof n === 'number' && !isNaN(n));
    if (!arr.length) return 0;
    let prom = 0, det = 0;
    arr.forEach((n) => {
      const t = classificaNps(n);
      if (t === 'promotor') prom++;
      else if (t === 'detrator') det++;
    });
    return Math.round(((prom / arr.length) - (det / arr.length)) * 100);
  };
  // run once on mount: register window helper and load entities (do NOT re-run on filter changes)
  useEffect(() => {
    window.ingestTickets = (lista) => {
      const arr = Array.isArray(lista) ? lista.slice() : [];
      setAllTickets(arr);
    };

    // fetch full list of entities (companies) once so the Cliente dropdown keeps all options
    const fetchEntities = async () => {
      try {
        const res = await axios.get(`${BACKEND}/api/db/entities`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
          // keep parent relation (parent_id) to populate unidades when a company is selected
          setEmpresas(res.data.data.map((r) => ({ id: r.id, name: r.name, parent_id: r.parent_id || null })));
        }
      } catch (err) {
        console.error('Erro ao buscar entidades:', err?.message || err);
      }
    };
    fetchEntities();

    // fetch categories once so charts can use the canonical names
    const fetchCategories = async () => {
      try {
        const res = await axios.get(`${BACKEND}/api/db/categories`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
          setCategorias(res.data.data.map((c) => ({ id: c.id, name: c.name })));
        }
      } catch (err) {
        console.error('Erro ao buscar categorias:', err?.message || err);
      }
    };
    fetchCategories();

    // fetch technicians for the Técnico filter
    const fetchTechnicians = async () => {
      try {
        const res = await axios.get(`${BACKEND}/api/db/technicians`);
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
          setTechnicians(res.data.data.map((r) => ({ id: r.id, name: r.display_name || r.name || r.login || String(r.id) })));
        }
      } catch (err) {
        console.error('Erro ao buscar técnicos:', err?.message || err);
      }
    };
    fetchTechnicians();

    // fetch initial NPS summary (global) — will be refreshed by a dedicated effect when filters change
    try { axios.get(`${BACKEND}/api/db/tickets/nps`).then((r) => { if (r && r.data && r.data.success) setNpsSummary(r.data.data || {}); }).catch(() => {}); } catch (e) {}

    return () => { delete window.ingestTickets; };
  }, []);

  // fetch only charts data (no exclusion applied) so chartUsuario keeps bars visible
  useEffect(() => {
    let chartsController = null;
    let cancelled = false;
    const fetchCharts = async () => {
      try { if (chartsController) chartsController.abort(); } catch (e) {}
      chartsController = new AbortController();
      const localId = ++chartsFetchId.current;
      try {
          let url = `${BACKEND}/api/db/tickets?limit=0`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate + ' 00:00:00')}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate + ' 23:59:59')}`;
        if (clienteFilter && clienteFilter !== 'all') {
          url += `&cliente=${encodeURIComponent(clienteFilter)}`;
          url += `&include_children=1`;
        }
        if (unidadeFilter && unidadeFilter !== 'all') url += `&unidade=${encodeURIComponent(unidadeFilter)}`;
        if (technicianFilter && technicianFilter !== 'all') url += `&tecnico=${encodeURIComponent(technicianFilter)}`;
          // NOTE: do not send `exclude_requerentes` to charts fetch — charts should remain
          // aware of all users so clicking a bar only toggles visual exclusion (fade)
          // while the table (server page) is filtered. Sending the exclude parameter
          // here would remove the bar entirely (count 0).
        const res = await axios.get(url, { signal: chartsController.signal, timeout: 20000 });
        if (localId !== chartsFetchId.current) return; // stale
        if (res && res.data && res.data.success && Array.isArray(res.data.data)) {
          const mapped = res.data.data.map((t) => ({
            id: t.id,
            dataRegistro: t.dataRegistro || t.date || null,
            cliente: t.cliente || null,
            unidadeNegocio: t.unidadeNegocio || t.unidade_name || null,
            unidadeId: t.unidadeId || t.unidade_id || null,
            requerente: t.requerente || null,
            requerenteId: (t.requerenteId || t.requerente_id) ? (Number(t.requerenteId || t.requerente_id) || null) : null,
            titulo: t.titulo || t.name || '-',
            categoria: t.categoria || null,
            categoria_id: t.categoria_id || t.itilcategories_id || null,
            tmeMin: t.tmeMin || null,
            tmaMin: t.tmaMin || null,
            notaNps: t.notaNps || null,
            status: t.status || null
          }));
          clientLog({ event: 'fetchCharts.done', clienteFilter, unidadeFilter, count: mapped.length });
          setFiltered(mapped);
        }
      } catch (err) {
        const isAbort = err && (err.name === 'CanceledError' || err.code === 'ERR_CANCELED');
        if (!isAbort) console.error('[V5Report] fetchCharts error', err?.message || err);
      }
    };
    fetchCharts();
    return () => { cancelled = true; try { if (chartsController) chartsController.abort(); } catch (e) {} };
  }, [startDate, endDate, clienteFilter, unidadeFilter, excludedRequerentes, excludedCategorias, technicianFilter]);

  // initialize flatpickr on a single input in range mode so user can pick start/end on one calendar
  useEffect(() => {
    try {
      if (dateRangeRef && dateRangeRef.current) {
        // destroy previous instance if any
        try { if (fpRef.current && fpRef.current.destroy) fpRef.current.destroy(); } catch (e) {}
        fpRef.current = flatpickr(dateRangeRef.current, {
          mode: 'range',
          dateFormat: 'Y-m-d',
          defaultDate: (startDate && endDate) ? [startDate, endDate] : (startDate ? [startDate] : []),
          allowInput: true,
          onChange: (selectedDates, dateStr, instance) => {
            try {
              if (!selectedDates || selectedDates.length === 0) {
                setStartDate('');
                setEndDate('');
                return;
              }
              if (selectedDates.length === 1) {
                const d1 = instance.formatDate(selectedDates[0], 'Y-m-d');
                setStartDate(d1);
                setEndDate('');
                return;
              }
              if (selectedDates.length >= 2) {
                const d1 = instance.formatDate(selectedDates[0], 'Y-m-d');
                const d2 = instance.formatDate(selectedDates[1], 'Y-m-d');
                setStartDate(d1);
                setEndDate(d2);
                return;
              }
            } catch (err) {
              // ignore
            }
          }
        });
      }
    } catch (e) {
      // ignore initialization errors silently
    }
    return () => {
      try { if (fpRef.current && fpRef.current.destroy) fpRef.current.destroy(); } catch (e) {}
      fpRef.current = null;
    };
    // we only want to initialize once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // if startDate/endDate are changed programmatically, reflect them onto the picker
  useEffect(() => {
    try {
      if (fpRef.current) {
        const dates = [];
        if (startDate) dates.push(startDate);
        if (endDate) dates.push(endDate);
        if (dates.length) fpRef.current.setDate(dates, true);
        else fpRef.current.clear();
      }
    } catch (e) {}
  }, [startDate, endDate]);

  // fetch server-side page (table) and respect exclude_requerentes here
  useEffect(() => {
    // abort previous request (if any)
    try { if (currentRequestController.current) currentRequestController.current.abort(); } catch (e) {}
    const controller = new AbortController();
    currentRequestController.current = controller;
    const fetchId = ++latestFetchId.current;
    (async () => {
      try {
        const offset = (page - 1) * pageSize;
        let url = `${BACKEND}/api/db/tickets?limit=${pageSize}&offset=${offset}`;
        if (startDate) url += `&startDate=${encodeURIComponent(startDate + ' 00:00:00')}`;
        if (endDate) url += `&endDate=${encodeURIComponent(endDate + ' 23:59:59')}`;
        if (clienteFilter && clienteFilter !== 'all') url += `&cliente=${encodeURIComponent(clienteFilter)}`;
        if (unidadeFilter && unidadeFilter !== 'all') url += `&unidade=${encodeURIComponent(unidadeFilter)}`;
        if (technicianFilter && technicianFilter !== 'all') url += `&tecnico=${encodeURIComponent(technicianFilter)}`;
        if (excludedRequerentes && excludedRequerentes.length > 0) {
          url += `&exclude_requerentes=${encodeURIComponent(excludedRequerentes.join(','))}`;
        }
        const includeChildrenFlag = !!(clienteFilter && clienteFilter !== 'all');
        const requestFilters = { cliente: clienteFilter || 'all', unidade: unidadeFilter || 'all', tecnico: technicianFilter || 'all', includeChildren: includeChildrenFlag, startDate: startDate || '', endDate: endDate || '', page, pageSize, excludeRequerentes: (excludedRequerentes && excludedRequerentes.length > 0) ? excludedRequerentes.slice().sort() : [], excludeCategorias: (excludedCategorias && excludedCategorias.length > 0) ? excludedCategorias.slice().sort() : [] };
        lastServerResponseFiltersRef.current = requestFilters;
        clientLog({ event: 'fetchPage.request', requestFilters });
        if (includeChildrenFlag) url += `&include_children=1`;
        // debug suppressed
        const res = await axios.get(url, { signal: controller.signal, timeout: 15000 });
        if (res && res.data) {
          const respData = Array.isArray(res.data.data) ? res.data.data : [];
          const respTotal = typeof res.data.total === 'number' ? res.data.total : (res.data.total ? Number(res.data.total) : 0);
          // debug suppressed
          clientLog({ event: 'fetchPage.done', requestFilters, dataCount: respData.length, total: respTotal });
          if (respTotal > 0 && respData.length === 0) {
            const lastPage = Math.max(1, Math.ceil(respTotal / pageSize));
            if (page > lastPage) {
              // debug suppressed
              setPage(lastPage);
              return;
            }
          }
        }
        if (fetchId !== latestFetchId.current) return;
        if (res.data && res.data.success) {
          const respData = Array.isArray(res.data.data) ? res.data.data : [];
          const mappedResp = respData.map((t) => {
            const base = {
              ...t,
              requerenteId: (t.requerenteId || t.requerente_id) ? (Number(t.requerenteId || t.requerente_id) || null) : null,
            };
            const resolved = resolveClienteName(base);
            if (resolved) base.cliente = resolved;
            return base;
          });
          const respTotal = typeof res.data.total === 'number' ? res.data.total : 0;
          setServerTickets(mappedResp);
          setServerTotal(respTotal);
          lastServerResponseFiltersRef.current = requestFilters;
        } else {
          setServerTickets([]);
          setServerTotal(0);
          lastServerResponseFiltersRef.current = null;
        }
      } catch (err) {
        const isAbort = err && (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.message === 'canceled' || err?.message === 'The user aborted a request.');
        if (!isAbort) console.error('Erro ao buscar página de tickets:', err?.message || err);
        setServerTickets([]);
        setServerTotal(0);
      } finally {
        try { if (currentRequestController.current === controller) currentRequestController.current = null; } catch (e) {}
      }
    })();
    return () => { try { if (currentRequestController.current === controller) currentRequestController.current = null; } catch (e) {} };
  }, [page, pageSize, startDate, endDate, clienteFilter, unidadeFilter, excludedRequerentes, excludedCategorias, technicianFilter]);

  // fetch aggregated NPS summary from backend (no LIMIT) for the current filters
  useEffect(() => {
    const controller = new AbortController();
    const fetchNps = async () => {
      try {
        let url = `${BACKEND}/api/db/tickets/nps`;
        const parts = [];
        if (startDate) parts.push(`startDate=${encodeURIComponent(startDate + ' 00:00:00')}`);
        if (endDate) parts.push(`endDate=${encodeURIComponent(endDate + ' 23:59:59')}`);
        if (clienteFilter && clienteFilter !== 'all') {
          parts.push(`cliente=${encodeURIComponent(clienteFilter)}`);
          parts.push('include_children=1');
        }
        if (unidadeFilter && unidadeFilter !== 'all') parts.push(`unidade=${encodeURIComponent(unidadeFilter)}`);
        if (technicianFilter && technicianFilter !== 'all') parts.push(`tecnico=${encodeURIComponent(technicianFilter)}`);
        if (excludedRequerentes && excludedRequerentes.length > 0) parts.push(`exclude_requerentes=${encodeURIComponent(excludedRequerentes.join(','))}`);
        if (parts.length) url += `?${parts.join('&')}`;
        const res = await axios.get(url, { signal: controller.signal, timeout: 15000 });
        if (res && res.data && res.data.success && res.data.data) {
          setNpsSummary(res.data.data);
        }
      } catch (err) {
        const isAbort = err && (err.name === 'CanceledError' || err.code === 'ERR_CANCELED');
        if (!isAbort) console.error('Erro ao buscar resumo NPS:', err?.message || err);
      }
    };
    fetchNps();
    return () => { try { controller.abort(); } catch (e) {} };
  }, [startDate, endDate, clienteFilter, unidadeFilter, excludedRequerentes, technicianFilter]);

  // fetch aggregated TMA summary from backend for the current filters
  useEffect(() => {
    const controller = new AbortController();
    const fetchTma = async () => {
      try {
        let url = `${BACKEND}/api/db/tickets/tma`;
        const parts = [];
        if (startDate) parts.push(`startDate=${encodeURIComponent(startDate + ' 00:00:00')}`);
        if (endDate) parts.push(`endDate=${encodeURIComponent(endDate + ' 23:59:59')}`);
        if (clienteFilter && clienteFilter !== 'all') {
          parts.push(`cliente=${encodeURIComponent(clienteFilter)}`);
          parts.push('include_children=1');
        }
        if (unidadeFilter && unidadeFilter !== 'all') parts.push(`unidade=${encodeURIComponent(unidadeFilter)}`);
        if (technicianFilter && technicianFilter !== 'all') parts.push(`tecnico=${encodeURIComponent(technicianFilter)}`);
        if (excludedRequerentes && excludedRequerentes.length > 0) parts.push(`exclude_requerentes=${encodeURIComponent(excludedRequerentes.join(','))}`);
        if (parts.length) url += `?${parts.join('&')}`;
        const res = await axios.get(url, { signal: controller.signal, timeout: 15000 });
        if (res && res.data && res.data.success && res.data.data) {
          setTmaSummary(res.data.data);
        }
      } catch (err) {
        const isAbort = err && (err.name === 'CanceledError' || err.code === 'ERR_CANCELED');
        if (!isAbort) console.error('Erro ao buscar resumo TMA:', err?.message || err);
      }
    };
    fetchTma();
    return () => { try { controller.abort(); } catch (e) {} };
  }, [startDate, endDate, clienteFilter, unidadeFilter, excludedRequerentes, technicianFilter]);

  // debounce cliente/unidade changes so we don't fire multiple requests when user clicks quickly
  // realtime: fetch immediately when cliente/unidade changes (no debounce)

  useEffect(() => {
    // recomputaFiltro will run as a fallback only when server charts are not available
    if (!serverTotal || (Array.isArray(serverTickets) && serverTickets.length === 0)) {
      recomputaFiltro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTickets, startDate, endDate, clienteFilter, unidadeFilter, serverTickets, serverTotal]);
  // recompute when selected requerentes change as well
  useEffect(() => {
    recomputaFiltro();
  }, [excludedRequerentes, excludedCategorias]);

  // when empresas or clienteFilter changes, populate unidadesList with children of the selected company
  useEffect(() => {
    if (!empresas || empresas.length === 0) { setUnidadesList([]); return; }
    if (clienteFilter === 'all') {
      // no client selected -> do not prefill unidades; keep Unidade as "Todas"
      setUnidadesList([]);
      return;
    }
    const children = empresas.filter((e) => String(e.parent_id) === String(clienteFilter));
    setUnidadesList(children);
  }, [empresas, clienteFilter]);

  // log filter changes to help debug selection flow
  useEffect(() => {
    clientLog({ event: 'cliente.selected', clienteFilter, clienteName, page, pageSize });
  }, [clienteFilter, clienteName]);

  useEffect(() => {
    clientLog({ event: 'unidade.selected', unidadeFilter, page, pageSize });
  }, [unidadeFilter]);

  // log when server-side page data updates
  useEffect(() => {
    // server tickets update (no client console noise)
    // we may forward when applying server page; avoid duplicate logs here
  }, [serverTickets, serverTotal, page, pageSize]);

  // when filters change, reset to first page. Do not clear serverTickets here to avoid
  // overwriting a valid server page while the new request is in-flight.
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, clienteFilter, unidadeFilter, allTickets]);

  // If server reports a total but returned an empty page (e.g. user was on a later page),
  // reset to the first page so data is fetched again and user sees rows.
  useEffect(() => {
    if (serverTotal > 0 && Array.isArray(serverTickets) && serverTickets.length === 0 && page > 1) {
      clientLog({ event: 'serverPagination.resetPage', serverTotal, page });
      setPage(1);
    }
  }, [serverTotal, serverTickets, page]);

  useEffect(() => {
    try {
      const list = filtered || [];
      const listForMetrics = applyExclusions(list);
      const exclReqKey = (excludedRequerentes && excludedRequerentes.length) ? (excludedRequerentes.slice().map((p) => String(p)).sort().join(',')) : '';
      const exclCatKey = (excludedCategorias && excludedCategorias.length) ? (excludedCategorias.slice().map((p) => String(p)).sort().join(',')) : '';
      const key = `${list.length}:${list.slice(0,5).map(t => t.id).join(',')}:${exclReqKey}:${exclCatKey}`;
      if (lastChartKeyRef.current === key) {
        return;
      }
      lastChartKeyRef.current = key;
      try {
        clientLog({ event: 'renderCharts.start', length: list.length });
      } catch (e) {}
      try {
        renderChartLinha(list);
      } catch (err) {
        console.error('[V5Report] renderChartLinha error', err);
        try { clientLog({ event: 'renderChartLinha.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
      }
      try {
        // render category chart using full list so slices remain visible (we only fade excluded categories)
        renderChartCategoria(list);
      } catch (err) {
        console.error('[V5Report] renderChartCategoria error', err);
        try { clientLog({ event: 'renderChartCategoria.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
      }
      try {
        renderChartUnidade(listForMetrics);
      } catch (err) {
        console.error('[V5Report] renderChartUnidade error', err);
        try { clientLog({ event: 'renderChartUnidade.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
      }
      try {
        // keep usuario chart showing all bars (visual fade only)
        renderChartUsuario(list);
      } catch (err) {
        console.error('[V5Report] renderChartUsuario error', err);
        try { clientLog({ event: 'renderChartUsuario.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
      }
      try {
        // render NPS using only tickets that are closed AND have a recorded satisfaction (notaNps)
        const encerradosForCharts = (listForMetrics || []).filter((t) => isClosedStatus(t.status));
        const npsResponses = (encerradosForCharts || []).filter((t) => typeof t.notaNps === 'number' && !isNaN(t.notaNps));
        renderChartNPS(npsResponses);
      } catch (err) {
        console.error('[V5Report] renderChartNPS error', err);
        try { clientLog({ event: 'renderChartNPS.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
      }
      
    } catch (err) {
      console.error('[V5Report] error rendering charts:', err);
      try { clientLog({ event: 'renderCharts.error', message: String(err.message || err), stack: err && err.stack ? err.stack : null }); } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, excludedRequerentes, excludedCategorias]);

  function ensureChart(ref, id, config) {
    if (!ref) return;
    if (ref.current && ref.current.destroy) {
      try { ref.current.destroy(); } catch (e) {}
    }
    const ctx = document.getElementById(id);
    if (!ctx) return;
    ref.current = new Chart(ctx, config);
  }

  function renderChartLinha(tickets) {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 90);
    const counts = {};
    tickets.forEach((t) => {
      const d = parseDate(t.dataRegistro);
      if (!within(d, past, today)) return;
      const key = d.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts).sort();
    const data = labels.map((l) => counts[l]);
    ensureChart(chartLinhaRef, 'chartLinha', {
      type: 'line',
      data: { labels, datasets: [{ label: 'Chamados por dia', data, tension: 0.35, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.25)', fill: true, pointRadius: 3, pointBackgroundColor: '#fed7aa' }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } }, y: { beginAtZero: true, ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderChartCategoria(tickets) {
    // ensure we use category name if available, otherwise resolve via categoria_id using `categorias` state
    const normalized = (tickets || []).map((t) => {
      // prefer resolving by categoria_id when we have the categories list
      if (t && t.categoria_id && categorias && categorias.length) {
        const found = categorias.find((c) => String(c.id) === String(t.categoria_id));
        if (found) return { ...t, categoria: found.name };
      }
      // fallback to textual category if present
      if (t && t.categoria) {
        return { ...t, categoria: t.categoria };
      }
      // final fallback
      return { ...t, categoria: t && (t.categoria || 'Não informado') };
    });
    const pairs = groupCount(normalized, 'categoria');
    // sort by count desc to keep chart deterministic across renders
    pairs.sort((a, b) => b[1] - a[1]);

    // show top N categories explicitly and aggregate the rest into 'Outros'
    const TOP_N = 8;
    const top = pairs.slice(0, TOP_N);
    const rest = pairs.slice(TOP_N);
    const othersCount = rest.reduce((s, p) => s + p[1], 0);

    const labels = top.map((p) => p[0]);
    const data = top.map((p) => p[1]);
    if (othersCount > 0) {
      labels.push('Outros');
      data.push(othersCount);
    }
    // debug suppressed
    try {
      clientLog({ event: 'renderChartCategoria', labelsCount: labels.length, categoriasLoaded: (categorias || []).length, topLabels: labels.slice(0,6) });
    } catch (e) {}
    if (!labels || labels.length === 0) {
      // debug suppressed: rendering placeholder for empty categories
      // render a minimal placeholder so canvas is visible
      ensureChart(chartCategoriaRef, 'chartCategoria', {
        type: 'doughnut',
        data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#94a3b8'], borderColor: '#ffffff00' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '58%' }
      });
      return;
    }
    // build background colors dynamically to cover all categories
    const baseColors = makeColors(labels.length);
    try { chartCategoriaIdsRef.current = labels.slice(); } catch (e) {}
    const FADED_COLOR = '#9ca3b8';
    const bg = labels.map((lab, i) => ((excludedCategorias || []).map((p) => String(p)).indexOf(String(lab)) !== -1) ? FADED_COLOR : baseColors[i]);
    // renderChartCategoria: deterministic ordering applied
      ensureChart(chartCategoriaRef, 'chartCategoria', {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: bg, borderColor: '#ffffff00', borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#475569', padding: 10, font: { size: 11 } } } }, cutout: '58%' }
    });

    // attach click handler to toggle excludedCategorias (visual fade + filter)
    try {
      if (chartCategoriaRef.current) {
        const handleClickEvent = (evt) => {
          try {
            const chartInst = chartCategoriaRef.current;
            if (!chartInst) return;
            const points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            if (points && points.length > 0) {
              const idx = points[0].index;
              const key = labels[idx];
              if (!key) return;
              try { clientLog({ event: 'renderChartCategoria.click', key, excludedCategorias }); } catch (e) {}
              setExcludedCategorias((prev) => {
                const prevNorm = Array.isArray(prev) ? prev.map((p) => String(p)) : [];
                const keyNorm = String(key);
                const found = prevNorm.indexOf(keyNorm) !== -1;
                let next = found ? prevNorm.filter((p) => p !== keyNorm) : prevNorm.concat([keyNorm]);
                next = Array.from(new Set(next.map((p) => String(p)))).sort();
                setPage(1);
                try { clientLog({ event: 'categoria.toggled', key: keyNorm, excluded: !found, prev: prevNorm, next }); } catch (e) {}
                return next;
              });
            }
          } catch (err) {
            try { clientLog({ event: 'renderChartCategoria.click.error', message: String(err && err.message ? err.message : err) }); } catch (e) {}
          }
        };

        const canvas = chartCategoriaRef.current && chartCategoriaRef.current.canvas ? chartCategoriaRef.current.canvas : document.getElementById('chartCategoria');
        if (canvas) {
          if (chartCategoriaRef.current._v5_click_handler) {
            try { canvas.removeEventListener('click', chartCategoriaRef.current._v5_click_handler); } catch (e) {}
          }
          const guardedHandler = (evt) => {
            try {
              const inst = chartCategoriaRef.current;
              const last = inst && inst._v5_last_toggle_ts ? inst._v5_last_toggle_ts : 0;
              const now = Date.now();
              if (now - last < 400) return;
              if (inst) inst._v5_last_toggle_ts = now;
              return handleClickEvent(evt);
            } catch (e) {
              return handleClickEvent(evt);
            }
          };
          canvas.addEventListener('click', guardedHandler);
          chartCategoriaRef.current._v5_click_handler = guardedHandler;
        }
      }
    } catch (e) {}

    // done
    return;
  }

  function renderChartUnidade(tickets) {
    // If a parent client is selected and we have a unidadesList (children),
    // group by child entity id/name so the chart shows counts per filial.
    let labels = [];
    let data = [];
    if (clienteFilter && clienteFilter !== 'all' && unidadesList && unidadesList.length) {
      const idToName = {};
      unidadesList.forEach((u) => { idToName[String(u.id)] = u.name; });
      const counts = {};
      (tickets || []).forEach((t) => {
        const uid = t && (t.unidadeId || t.unidade_id || 0);
        const key = String(uid && uid !== 0 ? uid : (t && (t.unidadeNegocio || 'Sem unidade')));
        counts[key] = (counts[key] || 0) + 1;
      });
      // map numeric ids back to names where possible. If a key equals the selected cliente (parent)
      // and isn't present in unidadesList, resolve the parent name from `empresas` so the chart
      // shows the matriz name instead of the raw id.
      labels = Object.keys(counts).map((k) => {
        if (idToName[k]) return idToName[k];
        if (clienteFilter && String(k) === String(clienteFilter)) {
          const parent = (empresas || []).find((e) => String(e.id) === String(clienteFilter));
          if (parent) return `${parent.name} (Matriz)`;
        }
        return k;
      });
      data = Object.keys(counts).map((k) => counts[k]);
      // sort by count desc while keeping labels/data aligned
      const pairs = labels.map((l, i) => [l, data[i]]).sort((a, b) => b[1] - a[1]);
      labels = pairs.map((p) => p[0]);
      data = pairs.map((p) => p[1]);
      try { clientLog({ event: 'renderChartUnidade.groupByChildren', clienteFilter, countUnits: labels.length }); } catch (e) {}
    } else {
      const pairs = groupCount(tickets, 'unidadeNegocio');
      const sorted = pairs.sort((a, b) => b[1] - a[1]);
      labels = sorted.map((p) => p[0]);
      data = sorted.map((p) => p[1]);
    }
    ensureChart(chartUnidadeRef, 'chartUnidade', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Chamados', data, backgroundColor: '#3b82f6' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } }, y: { ticks: { color: '#475569' }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderChartUsuario(tickets) {
    // group by requerenteId when available; fall back to name
    const countsById = Object.create(null); // id -> count
    const nameById = Object.create(null); // id -> name
    (tickets || []).forEach((t) => {
      const id = (t && (t.requerenteId !== null && t.requerenteId !== undefined)) ? String(t.requerenteId) : null;
      const name = (t && t.requerente) ? t.requerente : 'Não informado';
      const key = id || name; // if no id use name as key
      countsById[key] = (countsById[key] || 0) + 1;
      // prefer storing name under the numeric id when available
      if (id) nameById[key] = name;
    });
    // convert to array [[key, count]] and sort desc
    const pairs = Object.keys(countsById).map((k) => [k, countsById[k]]).sort((a, b) => b[1] - a[1]);
    const top = pairs.slice(0, 7);
    // build arrays: ids (string keys), labels (names), data
    const ids = top.map((p) => p[0]);
    const labels = top.map((p) => (nameById[p[0]] || p[0]));
    const data = top.map((p) => p[1]);
    // store last rendered ids so other effects can update colors later
    try { chartUsuarioIdsRef.current = ids.slice(); } catch (e) {}
    // color bars differently when excluded (compare numeric ids when possible)
    const ACTIVE_COLOR = '#22c55e';
    const FADED_COLOR = '#9ca3b8';
    const bg = ids.map((key) => {
      // key may be numeric string or name fallback
      const numeric = (/^\d+$/.test(String(key))) ? Number(key) : null;
      const keyNorm = numeric !== null ? String(numeric) : String(key);
      return (excludedRequerentes || []).includes(keyNorm) ? FADED_COLOR : ACTIVE_COLOR;
    });
    // debug/log to help trace why colors may not update in some environments
    try {
      try { clientLog({ event: 'renderChartUsuario.debug', ids: ids.slice(0,10), bg: bg.slice(0,10), excludedRequerentes }); } catch (e) {}
    } catch (e) {}
    ensureChart(chartUsuarioRef, 'chartUsuario', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Chamados', data, backgroundColor: bg, borderColor: bg, borderWidth: 1 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } }, y: { ticks: { color: '#475569' }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    // register click handler on the chart instance (more reliable) and also attach
    // a DOM listener as a fallback in case Chart.js onClick isn't triggered in some envs.
    try {
      if (chartUsuarioRef.current) {
        const handleClickEvent = (evt) => {
          try {
            const chartInst = chartUsuarioRef.current;
            if (!chartInst) return;
            const points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            if (points && points.length > 0) {
              const idx = points[0].index;
              const key = ids[idx];
              if (!key) return;
              const numeric = (/^\d+$/.test(String(key))) ? Number(key) : null;
              try { clientLog({ event: 'renderChartUsuario.click', key, numeric, excludedRequerentes }); } catch (e) {}
                setExcludedRequerentes((prev) => {
                const prevNorm = Array.isArray(prev) ? prev.map((p) => String(p)) : [];
                const keyNorm = numeric !== null ? String(numeric) : String(key);
                const found = prevNorm.indexOf(keyNorm) !== -1;
                let next = found ? prevNorm.filter((p) => p !== keyNorm) : prevNorm.concat([keyNorm]);
                  // normalize: unique, stringified, sorted
                  next = Array.from(new Set(next.map((p) => String(p)))).sort();
                  setPage(1);
                  try { clientLog({ event: 'requerente.toggled', id: numeric !== null ? numeric : key, excluded: !found, prev: prevNorm, next }); } catch (e) {}
                return next;
              });
            }
          } catch (err) {
            try { clientLog({ event: 'renderChartUsuario.click.error', message: String(err && err.message ? err.message : err) }); } catch (e) {}
          }
        };

        // Attach only a single DOM listener (Chart.js options.onClick has been unreliable
        // in some environments and attaching both caused duplicate toggles). Also add
        // a short timestamp guard to avoid double-handling rapid duplicate events.
        try {
          const canvas = chartUsuarioRef.current && chartUsuarioRef.current.canvas ? chartUsuarioRef.current.canvas : document.getElementById('chartUsuario');
          if (canvas) {
            // remove previous listener if present
            if (chartUsuarioRef.current._v5_click_handler) {
              try { canvas.removeEventListener('click', chartUsuarioRef.current._v5_click_handler); } catch (e) {}
            }
            // wrapped handler that guards rapid duplicates
            const guardedHandler = (evt) => {
              try {
                const inst = chartUsuarioRef.current;
                const last = inst && inst._v5_last_toggle_ts ? inst._v5_last_toggle_ts : 0;
                const now = Date.now();
                if (now - last < 400) return; // ignore duplicates within 400ms
                if (inst) inst._v5_last_toggle_ts = now;
                return handleClickEvent(evt);
              } catch (e) {
                return handleClickEvent(evt);
              }
            };
            canvas.addEventListener('click', guardedHandler);
            chartUsuarioRef.current._v5_click_handler = guardedHandler;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // React-level click handler attached directly to the canvas element as a fallback
  // This ensures clicks are captured even if Chart.js internals don't invoke handlers.
  const canvasUsuarioClick = (evt) => {
    try {
      const canvas = document.getElementById('chartUsuario');
      const chartInst = (window.Chart && Chart.getChart) ? Chart.getChart(canvas) : (chartUsuarioRef.current || null);
      if (!chartInst) return;
      // Try intersect true first, fall back to intersect false
      let points = [];
      try { points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true) || []; } catch (e) { points = []; }
      if (!points || points.length === 0) {
        try { points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true) || []; } catch (e) { points = []; }
      }
      if (points && points.length > 0) {
        const idx = points[0].index;
        const ids = chartUsuarioIdsRef.current || [];
        const key = ids[idx];
        if (!key) return;
        const numeric = (/^\d+$/.test(String(key))) ? Number(key) : null;
        // update excluded set (normalized)
        setExcludedRequerentes((prev) => {
          const prevNorm = Array.isArray(prev) ? prev.map((p) => String(p)) : [];
          const keyNorm = numeric !== null ? String(numeric) : String(key);
          const found = prevNorm.indexOf(keyNorm) !== -1;
          let next = found ? prevNorm.filter((p) => p !== keyNorm) : prevNorm.concat([keyNorm]);
          next = Array.from(new Set(next.map((p) => String(p)))).sort();
          try { clientLog({ event: 'renderChartUsuario.canvasClick', key, numeric, prev: prevNorm, next }); } catch (e) {}
          setPage(1);
          return next;
        });
      }
    } catch (err) {
      try { clientLog({ event: 'renderChartUsuario.canvasClick.error', message: String(err && err.message ? err.message : err) }); } catch (e) {}
    }
  };

  // React-level click handler for category chart as a fallback
  const canvasCategoriaClick = (evt) => {
    try {
      const canvas = document.getElementById('chartCategoria');
      const chartInst = (window.Chart && Chart.getChart) ? Chart.getChart(canvas) : (chartCategoriaRef.current || null);
      if (!chartInst) return;
      let points = [];
      try { points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true) || []; } catch (e) { points = []; }
      if (!points || points.length === 0) {
        try { points = chartInst.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true) || []; } catch (e) { points = []; }
      }
      if (points && points.length > 0) {
        const idx = points[0].index;
        const ids = chartCategoriaIdsRef.current || [];
        const key = ids[idx];
        if (!key) return;
      const keyNorm = String(key);
      console.debug('[V5Report] canvasCategoriaClick detected:', { key: keyNorm, excludedCategoriasBefore: (excludedCategorias || []).slice() });
      setExcludedCategorias((prev) => {
        const prevNorm = Array.isArray(prev) ? prev.map((p) => String(p)) : [];
        const found = prevNorm.indexOf(keyNorm) !== -1;
        let next = found ? prevNorm.filter((p) => p !== keyNorm) : prevNorm.concat([keyNorm]);
        next = Array.from(new Set(next.map((p) => String(p)))).sort();
        try { clientLog({ event: 'renderChartCategoria.canvasClick', key, prev: prevNorm, next }); } catch (e) {}
        setPage(1);
        console.debug('[V5Report] canvasCategoriaClick setting excludedCategorias:', next);
        return next;
      });
      }
    } catch (err) {
      try { clientLog({ event: 'renderChartCategoria.canvasClick.error', message: String(err && err.message ? err.message : err) }); } catch (e) {}
    }
  };

  // when excludedRequerentes changes, update the existing chart's backgroundColor array
  useEffect(() => {
    try {
      const chart = chartUsuarioRef.current;
      if (!chart) return;
      const ids = chartUsuarioIdsRef.current || [];
      if (!ids || !ids.length) return;
      const ACTIVE_COLOR = '#22c55e';
      const FADED_COLOR = '#9ca3b8';
      const newBg = ids.map((key) => {
        const numeric = (/^\d+$/.test(String(key))) ? Number(key) : null;
        const keyNorm = numeric !== null ? String(numeric) : String(key);
        return (excludedRequerentes || []).includes(keyNorm) ? FADED_COLOR : ACTIVE_COLOR;
      });
      if (chart.data && chart.data.datasets && chart.data.datasets[0]) {
        chart.data.datasets[0].backgroundColor = newBg;
        try { chart.data.datasets[0].borderColor = newBg; } catch (e) {}
        try { chart.update(); } catch (e) { console.error('chartUsuario update failed', e); }
        try { clientLog({ event: 'renderChartUsuario.colorsUpdated', newBgCount: newBg.length, excludedRequerentes }); } catch (e) {}
      }
    } catch (e) {
      console.error('update chartUsuario colors error', e);
    }
  }, [excludedRequerentes]);

  // when excludedCategorias changes, update category chart colors
  useEffect(() => {
    try {
      const chart = chartCategoriaRef.current;
      if (!chart) return;
      const ids = chartCategoriaIdsRef.current || [];
      if (!ids || !ids.length) return;
      const FADED_COLOR = '#9ca3b8';
      const base = makeColors(ids.length);
      const newBg = ids.map((key, i) => ((excludedCategorias || []).map((p) => String(p)).indexOf(String(key)) !== -1) ? FADED_COLOR : base[i]);
      if (chart.data && chart.data.datasets && chart.data.datasets[0]) {
        chart.data.datasets[0].backgroundColor = newBg;
        try { chart.data.datasets[0].borderColor = newBg; } catch (e) {}
        try { chart.update(); } catch (e) { console.error('chartCategoria update failed', e); }
        try { clientLog({ event: 'renderChartCategoria.colorsUpdated', newBgCount: newBg.length, excludedCategorias }); } catch (e) {}
      }
    } catch (e) {
      console.error('update chartCategoria colors error', e);
    }
  }, [excludedCategorias]);

  // expose a small debug hook so the developer can manually toggle an index from console
  // and we log that to the backend. This helps when click events aren't firing in some envs.
  // debug helpers removed to avoid exposing test controls in production

  // also log that we attached handlers and whether canvas/chart/handler exist
  try {
    const canvasPresent = (chartUsuarioRef.current && chartUsuarioRef.current.canvas) || document.getElementById('chartUsuario');
    try { clientLog({ event: 'renderChartUsuario.handlerAttached', hasCanvas: !!canvasPresent, hasChart: !!chartUsuarioRef.current, handlerPresent: !!(chartUsuarioRef.current && chartUsuarioRef.current._v5_click_handler), idsCount: (chartUsuarioIdsRef.current || []).length }); } catch (e) {}
  } catch (e) {}

  function renderChartNPS(encerrados) {
    const responses = encerrados || [];
    const notas = responses.map((t) => t.notaNps).filter((n) => typeof n === 'number' && !isNaN(n));
    try { clientLog({ event: 'renderChartNPS.start', responses: notas.length }); } catch (e) {}
    let prom = 0, neut = 0, det = 0;
    notas.forEach((n) => {
      const tipo = classificaNps(n);
      if (tipo === 'promotor') prom++;
      else if (tipo === 'neutro') neut++;
      else det++;
    });
    // include counts in labels so the chart communicates response base
    const labels = [`Promotores (${prom})`, `Neutros (${neut})`, `Detratores (${det})`];
    const data = [prom, neut, det];
    if ((notas || []).length === 0) {
      try { clientLog({ event: 'renderChartNPS.noResponses' }); } catch (e) {}
      // render a minimal placeholder when there are no satisfaction responses
      ensureChart(chartNPSRef, 'chartNPS', {
        type: 'bar',
        data: { labels: ['Sem respostas'], datasets: [{ data: [1], backgroundColor: ['#94a3b8'] }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#475569' }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } } }, plugins: { legend: { display: false } } }
      });
      return;
    }
    try { clientLog({ event: 'renderChartNPS.done', prom, neut, det, total: notas.length }); } catch (e) {}
    ensureChart(chartNPSRef, 'chartNPS', {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: ['#22c55e', '#eab308', '#ef4444'] }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#475569' }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#475569' }, grid: { color: 'rgba(71,85,105,0.06)' } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderAggregateNps(summary) {
    const total = Number(summary && summary.total_responses) || 0;
    const prom = Number(summary && summary.promotores) || 0;
    const neut = Number(summary && summary.neutros) || 0;
    const det = Number(summary && summary.detratores) || 0;
    if (total === 0) {
      ensureChart(chartNPSRef, 'chartNPS', {
        type: 'bar',
        data: { labels: ['Sem respostas'], datasets: [{ data: [1], backgroundColor: ['#94a3b8'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
      return;
    }
    const labels = [`Promotores (${prom})`, `Neutros (${neut})`, `Detratores (${det})`];
    const data = [prom, neut, det];
    ensureChart(chartNPSRef, 'chartNPS', {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: ['#22c55e', '#eab308', '#ef4444'] }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#cccccc' } }, y: { beginAtZero: true, ticks: { color: '#cccccc' } } }, plugins: { legend: { display: false } } }
    });
  }

  const encerrados = useMemo(() => (displayedTickets || []).filter((t) => isClosedStatus(t.status)), [displayedTickets]);

  // average TME (Tempo Médio de Espera) computed from the filtered set after exclusions
  const avgTmeMinutes = useMemo(() => {
    try {
      const baseForTme = applyExclusions(filtered || []);
      const minutes = avg((baseForTme || []).map((t) => t.tmeMin));
      return Number(minutes || 0);
    } catch (e) {
      return 0;
    }
  }, [filtered, excludedRequerentes, excludedCategorias]);

  // average TMA (Tempo Médio de Atendimento) in minutes — prefer backend summary when available
  const avgTmaMinutes = useMemo(() => {
    try {
      const backendMinutes = tmaSummary && tmaSummary.avg_tma_minutes;
      const fallbackMinutes = avg((filtered || []).map((t) => t.tmaMin));
      return (backendMinutes !== null && backendMinutes !== undefined && !isNaN(backendMinutes)) ? Number(backendMinutes) : Number(fallbackMinutes || 0);
    } catch (e) {
      return 0;
    }
  }, [tmaSummary, filtered, excludedRequerentes, excludedCategorias]);

  // NPS computed from the filtered set (charts) using only tickets that have a satisfaction value
  const npsFromFiltered = useMemo(() => {
    const enc = (filtered || []).filter((t) => isClosedStatus(t.status));
    const responses = enc.filter((t) => typeof t.notaNps === 'number' && !isNaN(t.notaNps));
    return { encCount: enc.length, responses, nps: npsScore(responses.map((t) => t.notaNps)) };
  }, [filtered]);

  // determine NPS value to display and CSS class/label
  const npsDisplay = useMemo(() => {
    const backendNps = (npsSummary && typeof npsSummary.nps === 'number' && !isNaN(npsSummary.nps)) ? Number(npsSummary.nps) : null;
    const clientNps = (npsFromFiltered && typeof npsFromFiltered.nps === 'number') ? Number(npsFromFiltered.nps) : 0;
    const value = backendNps !== null ? backendNps : clientNps;
    let label = 'Neutro';
    let cls = 'mid';
    if (value >= 75) { label = 'Excelente'; cls = 'good'; }
    else if (value >= 30) { label = 'Bom'; cls = 'good'; }
    else if (value >= 0) { label = 'Neutro'; cls = 'mid'; }
    else if (value >= -30) { label = 'Crítico'; cls = 'bad'; }
    else { label = 'Muito crítico'; cls = 'bad'; }
    return { value, label, cls };
  }, [npsSummary, npsFromFiltered]);

  // render aggregated NPS chart when summary changes
  useEffect(() => {
    try {
      renderAggregateNps(npsSummary);
    } catch (e) {
      console.error('renderAggregateNps error', e);
    }
  }, [npsSummary]);

  // pagination for the table (client-side)
  const totalFiltered = (displayedTickets || []).length;
  // use server-side totals for the table when available
  const tableTotal = serverTotal && serverTotal > 0 ? serverTotal : totalFiltered;
  const totalPages = Math.max(1, Math.ceil(tableTotal / pageSize));
  const paginatedFiltered = useMemo(() => {
    // If the server provided a page for the current filters, `displayedTickets`
    // will contain only the server page. In that case return it directly
    // (server-side pagination). Otherwise fall back to client-side slicing.
    try {
      const serverFilters = lastServerResponseFiltersRef.current;
      const normalizeExcl = (arr) => (Array.isArray(arr) ? arr.map((p) => String(p)).sort() : []);
      const currentFiltersKey = { cliente: clienteFilter || 'all', unidade: unidadeFilter || 'all', tecnico: technicianFilter || 'all', includeChildren: !!(clienteFilter && clienteFilter !== 'all'), startDate: startDate || '', endDate: endDate || '', page, pageSize, excludeRequerentes: normalizeExcl(excludedRequerentes), excludeCategorias: normalizeExcl(excludedCategorias) };
      const filtersMatch = serverFilters && serverFilters.cliente === currentFiltersKey.cliente && serverFilters.unidade === currentFiltersKey.unidade && serverFilters.includeChildren === currentFiltersKey.includeChildren && serverFilters.startDate === currentFiltersKey.startDate && serverFilters.endDate === currentFiltersKey.endDate && serverFilters.page === currentFiltersKey.page && serverFilters.pageSize === currentFiltersKey.pageSize && JSON.stringify(normalizeExcl(serverFilters.excludeRequerentes || [])) === JSON.stringify(currentFiltersKey.excludeRequerentes || []) && JSON.stringify(normalizeExcl(serverFilters.excludeCategorias || [])) === JSON.stringify(currentFiltersKey.excludeCategorias || []);
      if (filtersMatch && Array.isArray(serverTickets) && serverTickets.length > 0) {
        // If client-side exclusions are active, apply them to the server page
        if ((excludedRequerentes && excludedRequerentes.length > 0) || (excludedCategorias && excludedCategorias.length > 0)) {
          return applyExclusions(serverTickets.slice());
        }
        return serverTickets.slice();
      }
    } catch (e) {
      // ignore and fallback to client-side slicing
    }
    const start = (page - 1) * pageSize;
    return (displayedTickets || []).slice(start, start + pageSize);
  }, [displayedTickets, serverTickets, page, pageSize, clienteFilter, unidadeFilter, startDate, endDate, excludedRequerentes, excludedCategorias]);

  const scorePillClass = (nota) => (nota >= 9 ? 'good' : nota >= 7 ? 'mid' : 'bad');

  const recomputaFiltro = () => {
    console.debug('[V5Report] recomputaFiltro start', { excludedRequerentes: excludedRequerentes || [], excludedCategorias: excludedCategorias || [] });
    // If server returned a page (server-side pagination), prefer it as the current filtered set
    // but only when the server response was generated for the same filters/page.
    const serverFilters = lastServerResponseFiltersRef.current;
    const normalizeExcl = (arr) => (Array.isArray(arr) ? arr.map((p) => String(p)).sort() : []);
    const currentFiltersKey = { cliente: clienteFilter || 'all', unidade: unidadeFilter || 'all', tecnico: technicianFilter || 'all', includeChildren: !!(clienteFilter && clienteFilter !== 'all'), startDate: startDate || '', endDate: endDate || '', page, pageSize, excludeRequerentes: normalizeExcl(excludedRequerentes), excludeCategorias: normalizeExcl(excludedCategorias) };
    const filtersMatch = serverFilters && serverFilters.cliente === currentFiltersKey.cliente && serverFilters.unidade === currentFiltersKey.unidade && serverFilters.includeChildren === currentFiltersKey.includeChildren && serverFilters.startDate === currentFiltersKey.startDate && serverFilters.endDate === currentFiltersKey.endDate && serverFilters.page === currentFiltersKey.page && serverFilters.pageSize === currentFiltersKey.pageSize && JSON.stringify(normalizeExcl(serverFilters.excludeRequerentes || [])) === JSON.stringify(currentFiltersKey.excludeRequerentes || []) && JSON.stringify(normalizeExcl(serverFilters.excludeCategorias || [])) === JSON.stringify(currentFiltersKey.excludeCategorias || []);
    if (filtersMatch && serverTickets && Array.isArray(serverTickets) && serverTickets.length > 0) {
      clientLog({ event: 'recomputaFiltro', source: 'serverTickets', serverCount: serverTickets.length, filters: currentFiltersKey });
      // apply server page only to the table (displayedTickets). Keep `filtered` for charts
      const copy = serverTickets.slice();
      setDisplayedTickets(copy);
      return;
    }
    const inicio = startDate ? new Date(startDate + 'T00:00:00') : null;
    const fim = endDate ? new Date(endDate + 'T23:59:59') : null;
    // prefer using the `filtered` set (charts full data from server with limit=0)
    // when available for client-side filtering. Fall back to `allTickets`.
    const baseSet = (filtered && Array.isArray(filtered) && filtered.length > 0) ? filtered : allTickets;
    const out = baseSet.filter((t) => {
      const d = parseDate(t.dataRegistro);
      if (!within(d, inicio, fim)) return false;
      // clienteFilter is an entity id when selected; compare by name locally using clienteName
      if (clienteFilter !== 'all') {
        if (clienteName && t.cliente !== clienteName) return false;
      }
      if (unidadeFilter !== 'all') {
        // unidadeFilter may be an entity/location id (string) when unidadesList is populated,
        // or a name when unidadesList is not present. Try id match first, then name.
        const isNumeric = (/^\d+$/.test(String(unidadeFilter)));
        if (isNumeric) {
          const uid = Number(unidadeFilter);
          // if ticket has unidadeId compare by id
          if (typeof t.unidadeId === 'number') {
            if (t.unidadeId !== uid) return false;
          } else {
            // fallback: try match by name using unidadesList
            const sel = (unidadesList || []).find((u) => String(u.id) === String(unidadeFilter));
            if (sel) {
              if ((t.unidadeNegocio || '') !== sel.name) return false;
            } else {
              // no unidadeId on ticket and no unit in unidadesList -> cannot match
              return false;
            }
          }
        } else {
          // non-numeric: compare by unidade name
          if ((t.unidadeNegocio || '') !== unidadeFilter) return false;
        }
      }
      return true;
    });
    // apply exclusions only to the table (displayedTickets). Keep `filtered` (charts dataset) unchanged
    const outTable = out.filter((t) => {
      // if no exclusions at all, keep the row
      if ((!excludedRequerentes || excludedRequerentes.length === 0) && (!excludedCategorias || excludedCategorias.length === 0)) return true;
      // check requerente exclusion
      const idVal = (t && (t.requerenteId !== null && t.requerenteId !== undefined)) ? Number(t.requerenteId) : null;
      const req = t.requerente || 'Não informado';
      const keyReq = (idVal !== null && !isNaN(idVal)) ? String(idVal) : String(req);
      if ((excludedRequerentes || []).map((p) => String(p)).indexOf(String(keyReq)) !== -1) return false;
      // resolve category name (try t.categoria then fallback to categorias by id)
      let keyCat = 'Não informado';
      if (t && t.categoria) keyCat = String(t.categoria);
      else if (t && (t.categoria_id || t.itilcategories_id) && categorias && categorias.length) {
        const cid = t.categoria_id || t.itilcategories_id;
        const found = categorias.find((c) => String(c.id) === String(cid));
        if (found) keyCat = found.name;
      }
      // support 'Outros' slice exclusion: if user toggled 'Outros', exclude tickets whose
      // category is NOT in the top labels currently displayed.
      const topLabels = chartCategoriaIdsRef.current || [];
      if ((excludedCategorias || []).map((p) => String(p)).indexOf('Outros') !== -1) {
        if (topLabels.length && topLabels.indexOf(keyCat) === -1) return false;
      }
      if ((excludedCategorias || []).map((p) => String(p)).indexOf(String(keyCat)) !== -1) return false;
      return true;
    });
    clientLog({ event: 'recomputaFiltro', source: 'allTickets', filteredCount: outTable.length, filters: { clienteFilter, unidadeFilter, startDate, endDate, excludeRequerentes: excludedRequerentes, excludeCategorias: excludedCategorias } });
    // do not overwrite `filtered` — charts should show full baseSet; apply exclusion only to displayedTickets
    const outCopy = outTable.slice();
    setDisplayedTickets(outCopy);
  };

  // Ensure that when a server page arrives for the current filters/page
  // we apply it to displayedTickets so the table shows server-side rows.
  useEffect(() => {
    const serverFilters = lastServerResponseFiltersRef.current;
    const normalizeExcl = (arr) => (Array.isArray(arr) ? arr.map((p) => String(p)).sort() : []);
    const currentFiltersKey = { cliente: clienteFilter || 'all', unidade: unidadeFilter || 'all', tecnico: technicianFilter || 'all', includeChildren: !!(clienteFilter && clienteFilter !== 'all'), startDate: startDate || '', endDate: endDate || '', page, pageSize, excludeRequerentes: normalizeExcl(excludedRequerentes), excludeCategorias: normalizeExcl(excludedCategorias) };
    const filtersMatch = serverFilters && serverFilters.cliente === currentFiltersKey.cliente && serverFilters.unidade === currentFiltersKey.unidade && serverFilters.includeChildren === currentFiltersKey.includeChildren && serverFilters.startDate === currentFiltersKey.startDate && serverFilters.endDate === currentFiltersKey.endDate && serverFilters.page === currentFiltersKey.page && serverFilters.pageSize === currentFiltersKey.pageSize && JSON.stringify(normalizeExcl(serverFilters.excludeRequerentes || [])) === JSON.stringify(currentFiltersKey.excludeRequerentes || []);
    if (filtersMatch && Array.isArray(serverTickets) && serverTickets.length > 0) {
      // apply server page immediately for the table
      clientLog({ event: 'applyServerPage', serverCount: serverTickets.length, page, pageSize });
      const copy = serverTickets.slice();
      // do NOT overwrite `filtered` (charts). Use server page only for the table display.
      setDisplayedTickets(copy);
    }
  }, [serverTickets, clienteFilter, unidadeFilter, page, pageSize, startDate, endDate, excludedRequerentes, excludedCategorias]);

  const populateFiltersBase = () => {
    const cliSet = {};
    const undSet = {};
    allTickets.forEach((t) => {
      if (t.cliente) cliSet[t.cliente] = true;
      if (t.unidadeNegocio) undSet[t.unidadeNegocio] = true;
    });
    return { clientes: Object.keys(cliSet).sort(), unidades: Object.keys(undSet).sort() };
  };

  // debug helper removed (debug panel cleared)

  const filters = populateFiltersBase();

  useEffect(() => {
    window.ingestTickets = (lista) => {
      const arr = Array.isArray(lista) ? lista.slice() : [];
      setAllTickets(arr);
    };
    setAllTickets([]);
    return () => { delete window.ingestTickets; };
  }, []);

  const renderNota = (nota) => {
    if (typeof nota !== 'number' || isNaN(nota)) return '-';
    return <span className={`pill-score ${scorePillClass(nota)}`}>{nota.toFixed(1)}</span>;
  };

  // Modal state for ticket details
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketModalTicket, setTicketModalTicket] = useState(null);
  const [ticketModalLoading, setTicketModalLoading] = useState(false);

  const openTicketModal = async (t) => {
    setTicketModalOpen(true);
    setTicketModalLoading(true);
    setTicketModalTicket(null);
    try {
      // try to fetch enriched details from backend
      const url = `${BACKEND}/api/db/tickets/details?id=${encodeURIComponent(t.id)}`;
      const res = await axios.get(url, { timeout: 10000 });
      if (res && res.data && res.data.success) {
        const ticketRow = res.data.ticket || null;
        const followups = Array.isArray(res.data.followups) ? res.data.followups : [];
        // merge base ticket t with fetched ticketRow for fields like descricao
        const merged = Object.assign({}, t, ticketRow || {});
        merged.followups = followups;
        setTicketModalTicket(merged);
      } else {
        // fallback to shallow ticket object
        setTicketModalTicket(t);
      }
    } catch (err) {
      console.error('Failed to fetch ticket details', err);
      setTicketModalTicket(t);
    } finally {
      setTicketModalLoading(false);
    }
  };

  const closeTicketModal = () => {
    setTicketModalOpen(false);
    setTicketModalTicket(null);
  };

  // close modal on ESC
  useEffect(() => {
    if (!ticketModalOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeTicketModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ticketModalOpen]);

  // compute modal ticket status (used to render the small icon next to ID)
  const modalStatus = ticketModalTicket ? ticketStatusClass(ticketModalTicket) : 'pause';

  return (
    <div className="v5-bg">
      <div className="layout v5-react-inner">
      <header className="header-bar">
        <div className="brand">
          <div className="logo-circle"><img src={logoImg} alt="DRSUPORTI - Help Central" /></div>
          <div className="brand-text">
            <span>DRSUPORTI · HELP CENTRAL</span>
            <span>Relatório de Chamados (V5)</span>
          </div>
        </div>
        <div className="header-right">
          <div className="filters">
            <div className="filter">
              <span>Período</span>
              <input ref={dateRangeRef} className="date-range-input" type="text" id="dateRange" placeholder="Selecionar período" />
            </div>
            <div className="filter">
              <span>Cliente</span>
              <select value={clienteFilter} onChange={(e) => {
                  const v = String(e.target.value);
                  setClienteFilter(v);
                  setUnidadeFilter('all');
                  const found = (empresas || []).find((x) => String(x.id) === v);
                  setClienteName(found ? found.name : 'all');
                }}>
                <option value="all">Todos</option>
                {empresas && empresas.length > 0 ? (
                  // show only parent entities (no parent_id or parent_id === 0)
                  empresas.filter((emp) => !emp.parent_id || Number(emp.parent_id) === 0).map((emp) => (
                    <option key={emp.id} value={String(emp.id)}>{emp.name}</option>
                  ))
                ) : (
                  filters.clientes.map((c) => <option key={c} value={c}>{c}</option>)
                )}
              </select>
            </div>
            <div className="filter">
              <span>Unidade</span>
              <select value={unidadeFilter} onChange={(e) => { setUnidadeFilter(e.target.value); }}>
                <option value="all">Todas</option>
                {unidadesList && unidadesList.length > 0 ? (
                  unidadesList.map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)
                ) : (
                  filters.unidades.map((u) => <option key={u} value={u}>{u}</option>)
                )}
              </select>
            </div>
            <div className="filter">
              <span>Técnico</span>
              <select value={technicianFilter} onChange={(e) => { setTechnicianFilter(String(e.target.value)); setPage(1); }}>
                <option value="all">Todos</option>
                {technicians && technicians.length > 0 ? (
                  technicians.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)
                ) : null}
              </select>
            </div>
          </div>
          <div className="badge-periodo" id="periodoTexto">
            {startDate || endDate ? `Mostrando chamados entre ${startDate || '...'} e ${endDate || '...'}` : 'Mostrando todos os chamados disponíveis.'}
          </div>
        </div>
      </header>

      

      <section className="kpis">
        <article className={`kpi ${avgTmeMinutes > 15 ? 'bad kpi-glow' : 'ok'}`}>
          <h3>TME – Tempo Médio de Espera</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{formatDurationFromMinutes(avgTmeMinutes)}</span>
            </div>
            <span className="kpi-chip">Base {applyExclusions(filtered || []).length} chamados</span>
          </div>
          <div className="kpi-footer">Média até o início do atendimento.</div>
        </article>

        <article className={`kpi ${avgTmaMinutes > 240 ? 'bad kpi-glow' : 'ok'}`}>
          <h3>TMA – Tempo Médio de Atendimento</h3>
          <div className="kpi-main">
            <div>
              {(() => {
                const backendMinutes = tmaSummary && tmaSummary.avg_tma_minutes;
                const minutes = avgTmaMinutes;
                // if we have backend value use hours display, otherwise show minutes fallback
                if (backendMinutes !== null && backendMinutes !== undefined && !isNaN(backendMinutes)) {
                  const hours = (minutes / 60);
                  // if less than 1 hour, show minutes (rounded), otherwise show hours with 1 decimal
                  if (hours < 1) {
                    const mins = Math.round(minutes);
                    return (<><span className="kpi-value">{mins}</span><span className="kpi-suffix">min</span></>);
                  }
                  return (<><span className="kpi-value">{hours.toFixed(1)}</span><span className="kpi-suffix">h</span></>);
                }
                return (<><span className="kpi-value">{minutes.toFixed(1)}</span><span className="kpi-suffix">min</span></>);
              })()}
            </div>
            <span className="kpi-chip">Base {tmaSummary.solved_count || applyExclusions(filtered || []).length} chamados</span>
          </div>
          <div className="kpi-footer">Tempo médio de resolução.</div>
        </article>

        <article className={`kpi ${npsDisplay.cls} kpi-glow kpi-nps`}>
          <h3>NPS – Satisfação</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{npsDisplay.value}</span>
              <span className="kpi-suffix">pts</span>
            </div>
            <span className="kpi-chip">{(npsSummary && npsSummary.total_responses) ? npsSummary.total_responses : (npsFromFiltered.responses ? npsFromFiltered.responses.length : 0)} respostas</span>
          </div>
          <div className="kpi-footer">{npsDisplay.label} — Baseado apenas em chamados encerrados com avaliação.</div>
        </article>

        <article className="kpi ok">
          <h3>Total de Chamados</h3>
          <div className="kpi-main">
              <div>
                <span className="kpi-value">{tableTotal}</span>
              </div>
              <span className="kpi-chip">–</span>
            </div>
          <div className="kpi-footer">Lista abaixo mostra só os encerrados.</div>
        </article>
      </section>

      {/* Ticket details modal */}
      {ticketModalOpen && ticketModalTicket ? (
        <div className="ticket-modal-overlay" onClick={(e) => { if (e.target.classList && e.target.classList.contains('ticket-modal-overlay')) closeTicketModal(); }}>
          <div className="ticket-modal" role="dialog" aria-modal="true">
            {/* Top meta block (matches the attached image): two lines small muted text + divider */}
            <div className="ticket-modal-meta">
              {(() => {
                const raw = ticketModalTicket.raw || {};
                const createdCandidates = [ticketModalTicket.date_creation, ticketModalTicket.created_at, ticketModalTicket.date, raw.date_creation, raw.date, raw.created_at];
                const updatedCandidates = [ticketModalTicket.date_mod, ticketModalTicket.updated_at, ticketModalTicket.date_modification, raw.date_mod, raw.date_mod, raw.updated_at, ticketModalTicket.solvedate, ticketModalTicket.closedate];
                const created = createdCandidates.find((v) => v) || null;
                const updated = updatedCandidates.find((v) => v) || null;
                return (
                  <div>
                    {created ? (<div className="ticket-modal-meta-line">{`Criado em ${formatDateTime(created)}`}</div>) : null}
                    {updated ? (<div className="ticket-modal-meta-line">{`Última atualização em ${formatDateTime(updated)}`}</div>) : null}
                  </div>
                );
              })()}
            </div>
            <div className="ticket-modal-header">
              <div className="followup-author">
                <div className="followup-meta">
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div className="followup-author-name">
                      <span className={`status-icon status-${modalStatus}`} aria-hidden="true">
                        {modalStatus === 'play' ? (
                          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#ffffff"/></svg>
                        ) : modalStatus === 'pause' ? (
                          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="#ffffff"/><rect x="14" y="5" width="4" height="14" fill="#ffffff"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                        )}
                      </span>
                      <><span className="ticket-id-modal">#{ticketModalTicket.id}</span>{` ${ticketModalTicket.titulo || ''}`}</>
                    </div>
                    {(() => {
                      const rawLabel = ticketModalTicket.statusLabel;
                      let statusLabel = rawLabel;
                      let statusClass = 'tag-open';
                      if (!rawLabel) {
                        // derive from numeric status or fields
                        if (typeof ticketModalTicket.status === 'number') {
                          if (ticketModalTicket.status >= 5) {
                            statusLabel = 'Encerrado';
                            statusClass = 'tag-check';
                          } else {
                            statusLabel = 'Aberto';
                            statusClass = 'tag-open';
                          }
                        } else if (ticketModalTicket.takeintoaccountdate) {
                          statusLabel = 'Em atendimento';
                          statusClass = 'tag-play';
                        } else {
                          statusLabel = 'Aberto';
                          statusClass = 'tag-open';
                        }
                      } else {
                        const ll = String(rawLabel).toLowerCase();
                        if (ll.indexOf('abert') !== -1) statusClass = 'tag-open';
                        else if (ll.indexOf('pend') !== -1) statusClass = 'tag-pause';
                        else if (ll.indexOf('atend') !== -1) statusClass = 'tag-play';
                        else if (ll.indexOf('fech') !== -1 || ll.indexOf('encerr') !== -1 || ll.indexOf('resolvid') !== -1 || ll.indexOf('solucionad') !== -1) statusClass = 'tag-check';
                        else statusClass = 'tag-open';
                      }
                      return (<div className={`tag ${statusClass}`}>{statusLabel}</div>);
                    })()}
                  </div>
                </div>
              </div>
              <button className="ticket-modal-close" onClick={closeTicketModal} aria-label="Fechar">✕</button>
            </div>

            <div className="ticket-modal-body">
              <div className="ticket-message-box">
                  {ticketModalLoading ? (
                    <div style={{color: 'var(--muted)'}}>Carregando detalhes...</div>
                  ) : (
                    (ticketModalTicket && (ticketModalTicket.descricao || (ticketModalTicket.row && ticketModalTicket.row.content))) ? (
                      <div className="followup-card" style={{marginBottom:12}}>
                        <div className="followup-label">Descrição</div>
                        <div className="followup-content">{renderPlainWithBreaks(ticketModalTicket.descricao || (ticketModalTicket.row && ticketModalTicket.row.content) || '')}</div>
                      </div>
                    ) : (
                      <div style={{color:'var(--muted)'}}>Sem descrição disponível.</div>
                    )
                  )}

                  {/* followups list */}
                  {!ticketModalLoading && ticketModalTicket && ticketModalTicket.followups && ticketModalTicket.followups.length > 0 ? (
                    <div style={{marginTop:12}}>
                      <div style={{display:'grid', gap:8}}>
                        {ticketModalTicket.followups.map((f, idx) => {
                          const n = (f && f.normalized) ? f.normalized : (f && f.raw) ? f.raw : f;
                          const author = (n && (n.author || n.user_realname || n.user_login || n.realname || n.name)) ? (n.author || n.user_realname || n.user_login || n.realname || n.name) : 'Usuário';
                          const date = (n && (n.date || n.date_creation || n.date_mod)) ? (n.date || n.date_creation || n.date_mod) : '';
                          const content = (n && (n.content || n.comment || n.description || n.message)) ? (n.content || n.comment || n.description || n.message) : '';
                          const key = (f && f.id) ? String(f.id) : `${f.table || 'f'}-${idx}`;
                          return (
                            <div key={key} className="followup-card">
                              <div className="followup-author">
                                          <div className="followup-avatar">{(author && author[0]) || 'U'}</div>
                                          <div className="followup-meta">
                                            <div className="followup-author-name">{author}</div>
                                            <div className="followup-author-date">{date}</div>
                                          </div>
                                        </div>
                              <div className="followup-content">{renderPlainWithBreaks(content || '')}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
            </div>

          </div>
        </div>
      ) : null}

      <section className="cards-grid-small">
        <article className="card">
          <header className="card-header">
            <div>
              <div className="card-title">Tickets por Categoria</div>
              <div className="card-sub">Principais naturezas de atendimento</div>
            </div>
          </header>
          <div className="card-body">
            <div className="chart-wrapper-sm">
              <canvas id="chartCategoria" onClick={canvasCategoriaClick}></canvas>
            </div>
            
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <div className="card-title">Tickets por Unidade</div>
              <div className="card-sub">Matriz x Filiais</div>
            </div>
          </header>
          <div className="card-body">
            <div className="chart-wrapper-sm">
              <canvas id="chartUnidade"></canvas>
            </div>
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <div className="card-title">Tickets por Requerente</div>
              <div className="card-sub">Usuários que mais abrem chamados</div>
            </div>
          </header>
          <div className="card-body">
            <div className="chart-wrapper-sm">
              <canvas id="chartUsuario" onClick={canvasUsuarioClick}></canvas>
            </div>
            <div style={{marginTop:8, display:'flex', gap:8, alignItems:'center'}} />
          </div>
        </article>

        <article className="card">
          <header className="card-header">
            <div>
              <div className="card-title">Resumo de NPS</div>
              <div className="card-sub">Promotores, neutros, detratores</div>
            </div>
          </header>
          <div className="card-body">
            <div className="chart-wrapper-sm">
              <canvas id="chartNPS"></canvas>
            </div>
          </div>
        </article>
      </section>

      <section style={{marginTop:20}}>
        <article className="card">
          <header className="card-header">
            <div>
              <div className="card-title">Volume de Chamados</div>
              <div className="card-sub">Evolução diária (últimos 90 dias)</div>
            </div>
            <div className="legend">
              <span><span className="legend-dot" style={{background:'#f97316'}}></span>Mês atual</span>
              <span><span className="legend-dot" style={{background:'#3b82f6'}}></span>Mês anterior</span>
              <span><span className="legend-dot" style={{background:'#22c55e'}}></span>Há 2 meses</span>
            </div>
          </header>
          <div className="card-body">
            <div className="chart-wrapper">
              <canvas id="chartLinha"></canvas>
            </div>
          </div>
        </article>
      </section>

      <section className="card tickets-card">
        <header className="card-header">
          <div>
            <div className="card-title">Chamados Encerrados – Detalhamento</div>
            <div className="card-sub">Clique para abrir no HELP CENTRAL</div>
          </div>
          <div className="tag" id="tagQtdEncerrados">{encerrados.length} chamados encerrados</div>
        </header>
        <div className="card-body">
          {serverTotal > 0 && Array.isArray(serverTickets) && serverTickets.length === 0 ? (
            <div style={{padding:12, background:'#fff3f2', color:'#7f1d1d', borderRadius:6, marginBottom:12}}>Alerta: o servidor reporta <strong>{serverTotal}</strong> registros, mas a página atual não retornou linhas — veja o painel de debug acima e clique em "Re-run debug".</div>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th># Chamado</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Requerente</th>
                  <th>Título</th>
                  <th>TME (min)</th>
                      <th>TMA (min)</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody id="tbodyTickets">
                {paginatedFiltered.slice().sort((a,b)=>new Date(b.dataRegistro)-new Date(a.dataRegistro)).map((t) => (
                  <tr key={t.id} onClick={() => openTicketModal(t)}>
                    <td className="ticket-id">{t.id}</td>
                    <td>{formatDate(t.dataRegistro)}</td>
                    <td>{t.cliente || '-'}</td>
                    <td>{t.requerente || '-'}</td>
                    <td className="ticket-title">{t.titulo || '-'}</td>
                    <td>{formatDurationTmeFromTicket(t)}</td>
                        <td>{formatDurationFromTicket(t)}</td>
                    <td>{renderNota(t.notaNps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="pagination-controls">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p-1))}>Anterior</button>
              <span> Página {page} de {totalPages} </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p+1))}>Próxima</button>
              <label style={{marginLeft:12}}>Mostrar</label>
              <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value,10)); setPage(1); }} style={{marginLeft:6}}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{marginLeft:12}}>{tableTotal} registros</span>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
