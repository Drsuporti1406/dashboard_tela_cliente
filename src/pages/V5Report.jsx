import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Chart from 'chart.js/auto';
import '../pages/V5Report.css';

export default function V5Report() {
  const [allTickets, setAllTickets] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clienteFilter, setClienteFilter] = useState('all');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [empresas, setEmpresas] = useState([]);

  const chartLinhaRef = useRef(null);
  const chartCategoriaRef = useRef(null);
  const chartUnidadeRef = useRef(null);
  const chartUsuarioRef = useRef(null);
  const chartNPSRef = useRef(null);

  const parseDate = (str) => (str ? new Date(str) : null);
  const formatDate = (d) => {
    if (!d) return '-';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('pt-BR');
  };
  const avg = (arr) => {
    const nums = arr.filter((n) => typeof n === 'number' && !isNaN(n));
    if (!nums.length) return 0;
    return nums.reduce((s, v) => s + v, 0) / nums.length;
  };
  const within = (date, start, end) => {
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  };
  const classificaNps = (nota) => (nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator');
  const npsScore = (notas) => {
    const arr = notas.filter((n) => typeof n === 'number' && !isNaN(n));
    if (!arr.length) return 0;
    let prom = 0,
      det = 0;
    arr.forEach((n) => {
      const t = classificaNps(n);
      if (t === 'promotor') prom++;
      else if (t === 'detrator') det++;
    });
    return Math.round(((prom / arr.length) - (det / arr.length)) * 100);
  };

  const groupCount = (tickets, key) => {
    const map = {};
    tickets.forEach((t) => {
      const k = t[key] || 'Não informado';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([k, v]) => [k, v]);
  };

  const diasAtras = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const ticketsMock = [
    { id: 'HC-1023', dataRegistro: diasAtras(5), cliente: 'Clínica Bem Viver', unidadeNegocio: 'Matriz', requerente: 'Ana Paula', titulo: 'Erro no prontuário eletrônico', categoria: 'Sistema Clínico', tmeMin: 8, tmaMin: 32, notaNps: 10, status: 'Encerrado' },
    { id: 'HC-1024', dataRegistro: diasAtras(15), cliente: 'Clínica Bem Viver', unidadeNegocio: 'Filial 01', requerente: 'Carlos Lima', titulo: 'Lentidão na internet', categoria: 'Rede/Conectividade', tmeMin: 15, tmaMin: 55, notaNps: 6, status: 'Encerrado' },
    { id: 'HC-1025', dataRegistro: diasAtras(35), cliente: 'Hospital Cantinho Doce', unidadeNegocio: 'Matriz', requerente: 'Fernanda Souza', titulo: 'Impressora não imprime', categoria: 'Periféricos', tmeMin: 12, tmaMin: 40, notaNps: 8, status: 'Encerrado' },
    { id: 'HC-1026', dataRegistro: diasAtras(65), cliente: 'Hospital Cantinho Doce', unidadeNegocio: 'UTI', requerente: 'Dr. João', titulo: 'Acesso remoto indisponível', categoria: 'Acesso Remoto', tmeMin: 5, tmaMin: 25, notaNps: 9, status: 'Encerrado' },
    { id: 'HC-1027', dataRegistro: diasAtras(10), cliente: 'Rede Bem Família', unidadeNegocio: 'Filial São Luís', requerente: 'Patrícia', titulo: 'Atualização de antivírus falhou', categoria: 'Segurança/Antivírus', tmeMin: 20, tmaMin: 60, notaNps: 4, status: 'Encerrado' },
    { id: 'HC-1028', dataRegistro: diasAtras(2), cliente: 'Rede Bem Família', unidadeNegocio: 'Filial São José', requerente: 'Mariana', titulo: 'Sem acesso ao e-mail', categoria: 'Microsoft 365', tmeMin: 6, tmaMin: 18, notaNps: 9, status: 'Em andamento' },
    { id: 'HC-1029', dataRegistro: diasAtras(80), cliente: 'Fecomércio-MA', unidadeNegocio: 'TI', requerente: 'Henrique', titulo: 'VPN intermitente', categoria: 'Rede/Conectividade', tmeMin: 18, tmaMin: 70, notaNps: 7, status: 'Encerrado' }
  ];

  useEffect(() => {
    window.ingestTickets = (lista) => {
      const arr = Array.isArray(lista) ? lista.slice() : [];
      setAllTickets(arr);
    };
    setAllTickets(ticketsMock);

    const fetchEmpresas = async () => {
      try {
        const res = await axios.get('/api/entities');
        if (res.data && res.data.data) setEmpresas(res.data.data);
      } catch (err) {
        console.error('Erro ao buscar entidades:', err?.message || err);
      }
    };
    fetchEmpresas();
    return () => { delete window.ingestTickets; };
  }, []);

  useEffect(() => {
    recomputaFiltro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTickets, startDate, endDate, clienteFilter, unidadeFilter]);

  useEffect(() => {
    renderChartLinha(filtered);
    renderChartCategoria(filtered);
    renderChartUnidade(filtered);
    renderChartUsuario(filtered);
    renderChartNPS(filtered.filter((t) => (t.status || '').toLowerCase() === 'encerrado'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

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
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(30,64,175,0.3)' } }, y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(30,64,175,0.25)' } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderChartCategoria(tickets) {
    const pairs = groupCount(tickets, 'categoria');
    const labels = pairs.map((p) => p[0]);
    const data = pairs.map((p) => p[1]);
    ensureChart(chartCategoriaRef, 'chartCategoria', {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: ['#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6'], borderColor: '#ffffff00', borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#cbd5f5', padding: 10, font: { size: 11 } } } }, cutout: '58%' }
    });
  }

  function renderChartUnidade(tickets) {
    const pairs = groupCount(tickets, 'unidadeNegocio');
    const labels = pairs.map((p) => p[0]);
    const data = pairs.map((p) => p[1]);
    ensureChart(chartUnidadeRef, 'chartUnidade', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Chamados', data, backgroundColor: '#3b82f6' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(30,64,175,0.3)' } }, y: { ticks: { color: '#cbd5f5' }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderChartUsuario(tickets) {
    const pairs = groupCount(tickets, 'requerente');
    pairs.sort((a, b) => b[1] - a[1]);
    const top = pairs.slice(0, 7);
    const labels = top.map((p) => p[0]);
    const data = top.map((p) => p[1]);
    ensureChart(chartUsuarioRef, 'chartUsuario', {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Chamados', data, backgroundColor: '#22c55e' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(22,163,74,0.25)' } }, y: { ticks: { color: '#cbd5f5' }, grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
  }

  function renderChartNPS(encerrados) {
    const notas = encerrados.map((t) => t.notaNps).filter((n) => typeof n === 'number' && !isNaN(n));
    let prom = 0,
      neut = 0,
      det = 0;
    notas.forEach((n) => {
      const tipo = classificaNps(n);
      if (tipo === 'promotor') prom++;
      else if (tipo === 'neutro') neut++;
      else det++;
    });
    const labels = ['Promotores', 'Neutros', 'Detratores'];
    const data = [prom, neut, det];
    ensureChart(chartNPSRef, 'chartNPS', {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: ['#22c55e', '#eab308', '#ef4444'] }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#cbd5f5' }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(30,64,175,0.3)' } } }, plugins: { legend: { display: false } } }
    });
  }

  const encerrados = useMemo(() => filtered.filter((t) => (t.status || '').toLowerCase() === 'encerrado'), [filtered]);

  const scorePillClass = (nota) => (nota >= 9 ? 'good' : nota >= 7 ? 'mid' : 'bad');

  const recomputaFiltro = () => {
    const inicio = startDate ? new Date(startDate + 'T00:00:00') : null;
    const fim = endDate ? new Date(endDate + 'T23:59:59') : null;
    const out = allTickets.filter((t) => {
      const d = parseDate(t.dataRegistro);
      if (!within(d, inicio, fim)) return false;
      if (clienteFilter !== 'all' && t.cliente !== clienteFilter) return false;
      if (unidadeFilter !== 'all' && (t.unidadeNegocio || '') !== unidadeFilter) return false;
      return true;
    });
    setFiltered(out);
  };

  const populateFiltersBase = () => {
    const cliSet = {};
    const undSet = {};
    allTickets.forEach((t) => {
      if (t.cliente) cliSet[t.cliente] = true;
      if (t.unidadeNegocio) undSet[t.unidadeNegocio] = true;
    });
    return { clientes: Object.keys(cliSet).sort(), unidades: Object.keys(undSet).sort() };
  };

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

  return (
    <div className="v5-bg">
      <div className="layout v5-react-inner">
      <header className="header-bar">
        <div className="brand">
          <div className="logo-circle">DR</div>
          <div className="brand-text">
            <span>DRSUPORTI · HELP CENTRAL</span>
            <span>Relatório de Chamados (V5)</span>
          </div>
        </div>
        <div className="header-right">
          <div className="filters">
            <div className="filter">
              <span>Período</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span>até</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="filter">
              <span>Cliente</span>
              <select value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)}>
                <option value="all">Todos</option>
                {empresas && empresas.length > 0 ? (
                  empresas.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)
                ) : (
                  filters.clientes.map((c) => <option key={c} value={c}>{c}</option>)
                )}
              </select>
            </div>
            <div className="filter">
              <span>Unidade</span>
              <select value={unidadeFilter} onChange={(e) => setUnidadeFilter(e.target.value)}>
                <option value="all">Todas</option>
                {filters.unidades.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="badge-periodo" id="periodoTexto">
            {startDate || endDate ? `Mostrando chamados entre ${startDate || '...'} e ${endDate || '...'}` : 'Mostrando todos os chamados disponíveis.'}
          </div>
        </div>
      </header>

      <section className="kpis">
        <article className="kpi ok">
          <h3>TME – Tempo Médio de Espera</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{avg(filtered.map((t) => t.tmeMin)).toFixed(1)}</span>
              <span className="kpi-suffix">min</span>
            </div>
            <span className="kpi-chip">Base {filtered.length} chamados</span>
          </div>
          <div className="kpi-footer">Média até o início do atendimento.</div>
        </article>

        <article className="kpi ok">
          <h3>TMA – Tempo Médio de Atendimento</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{avg(filtered.map((t) => t.tmaMin)).toFixed(1)}</span>
              <span className="kpi-suffix">min</span>
            </div>
            <span className="kpi-chip">Base {filtered.length} chamados</span>
          </div>
          <div className="kpi-footer">Tempo médio de resolução.</div>
        </article>

        <article className="kpi mid kpi-glow kpi-nps">
          <h3>NPS – Satisfação</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{npsScore(encerrados.map((t) => t.notaNps))}</span>
              <span className="kpi-suffix">pts</span>
            </div>
            <span className="kpi-chip">{encerrados.length} encerrados</span>
          </div>
          <div className="kpi-footer">Baseado apenas em chamados encerrados.</div>
        </article>

        <article className="kpi ok">
          <h3>Total de Chamados</h3>
          <div className="kpi-main">
            <div>
              <span className="kpi-value">{filtered.length}</span>
            </div>
            <span className="kpi-chip">–</span>
          </div>
          <div className="kpi-footer">Lista abaixo mostra só os encerrados.</div>
        </article>
      </section>

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
              <canvas id="chartCategoria"></canvas>
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
              <canvas id="chartUsuario"></canvas>
            </div>
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
                {encerrados.slice().sort((a,b)=>new Date(b.dataRegistro)-new Date(a.dataRegistro)).map((t) => (
                  <tr key={t.id} onClick={() => window.open(`#ticket-${t.id}`, '_blank')}>
                    <td className="ticket-id">{t.id}</td>
                    <td>{formatDate(t.dataRegistro)}</td>
                    <td>{t.cliente || '-'}</td>
                    <td>{t.requerente || '-'}</td>
                    <td className="ticket-title">{t.titulo || '-'}</td>
                    <td>{typeof t.tmeMin === 'number' ? t.tmeMin.toFixed(1) : (t.tmeMin||'-')}</td>
                    <td>{typeof t.tmaMin === 'number' ? t.tmaMin.toFixed(1) : (t.tmaMin||'-')}</td>
                    <td>{renderNota(t.notaNps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scroll-hint">Role para ver mais registros.</div>
        </div>
      </section>
      </div>
    </div>
  );
}
