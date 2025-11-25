import React, { useEffect, useState, useRef } from 'react';
import Chart from 'chart.js/auto';
import './Inventory.css';

const PADRAO = {
  ramMin: 8,
  cpuMinGeracaoIntel: 11,
  aceitaSSD: true,
  osAceitos: ["Windows 10 Pro", "Windows 11 Pro", "Windows 11", "Windows 10"]
};

export default function Inventory() {
  const [state, setState] = useState({
    raw: [],
    computers: [],
    infra: [],
    enriched: [],
    filtros: { sev: 'all', empresa: 'all', setor: 'all', busca: '' },
    entities: [],
    empresasList: [],
    setoresList: [],
    totalComputers: 0
  });

  // fetch total computers count (global or per-entity) whenever empresa filter changes
  useEffect(() => {
    const empresa = state.filtros && state.filtros.empresa;
    const id = (empresa && empresa !== 'all') ? Number(empresa) : null;
    const url = (id && !isNaN(id) && id > 0) ? `/api/db/computers/count?entityId=${id}` : `/api/db/computers/count`;
    (async () => {
      try {
        const resp = await fetch(url);
        const json = await resp.json();
        if (json && json.success) {
          setState(prev => ({ ...prev, totalComputers: Number(json.count || 0) }));
        }
      } catch (e) {
        console.error('failed to fetch computers count', e);
      }
    })();
  }, [state.filtros.empresa]);


  const chartSevRef = useRef(null);
  const chartRamRef = useRef(null);
  const chartM365Ref = useRef(null);
  const chartAVRef = useRef(null);

  const chartSevInstance = useRef(null);
  const chartRamInstance = useRef(null);
  const chartM365Instance = useRef(null);
  const chartAVInstance = useRef(null);

  useEffect(() => {
    // Mock de dados
    const mockData = [
      {
        tipo: 'Desktop',
        hostname: 'FIN-PC-01',
        setor: 'Financeiro',
        empresa: 'ACME Ltda',
        usuario: 'Maria',
        cpu: { modelo: 'Intel Core i3-7100', geracao: 7 },
        ram_gb: 4,
        disco: { tipo: 'HDD', tamanho_gb: 500 },
        os: { nome: 'Windows', versao: '10 Home' },
        m365: { licensed: false },
        antivirus: { vendor: 'Defender', status: 'Ativo' },
        ultimo_login: '2025-10-20'
      },
      {
        tipo: 'Notebook',
        hostname: 'ADM-NB-02',
        setor: 'Administrativo',
        empresa: 'ACME Ltda',
        usuario: 'João',
        cpu: { modelo: 'Intel Core i5-10210U', geracao: 10 },
        ram_gb: 8,
        disco: { tipo: 'HDD', tamanho_gb: 1000 },
        os: { nome: 'Windows', versao: '11 Pro' },
        m365: { licensed: true, sku: 'M365 Business Basic' },
        antivirus: { vendor: 'Defender', status: 'Ativo' },
        ultimo_login: '2025-10-21'
      },
      {
        tipo: 'Desktop',
        hostname: 'SUP-PC-03',
        setor: 'Suporte',
        empresa: 'DrSuporti',
        usuario: 'Ana',
        cpu: { modelo: 'Intel Core i3-12100', geracao: 12 },
        ram_gb: 16,
        disco: { tipo: 'SSD', tamanho_gb: 512 },
        os: { nome: 'Windows', versao: '11 Pro' },
        m365: { licensed: true, sku: 'M365 Business Standard' },
        antivirus: { vendor: 'Defender', status: 'Ativo' },
        ultimo_login: '2025-10-25'
      },
      {
        tipo: 'Notebook',
        hostname: 'DIR-NB-01',
        setor: 'Diretoria',
        empresa: 'DrSuporti',
        usuario: 'Josimar',
        cpu: { modelo: 'Intel Core i7-8750H', geracao: 8 },
        ram_gb: 16,
        disco: { tipo: 'SSD', tamanho_gb: 512 },
        os: { nome: 'Windows', versao: '10 Pro' },
        m365: { licensed: true, sku: 'M365 Business Premium' },
        antivirus: { vendor: 'Kaspersky', status: 'Expirado' },
        ultimo_login: '2025-10-24'
      },
      {
        tipo: 'Desktop',
        hostname: 'VEN-PC-04',
        setor: 'Vendas',
        empresa: 'ACME Ltda',
        usuario: 'Luiz',
        cpu: { modelo: 'Intel Core i3-10100', geracao: 10 },
        ram_gb: 4,
        disco: { tipo: 'SSD', tamanho_gb: 240 },
        os: { nome: 'Windows', versao: '10 Pro' },
        m365: { licensed: false },
        antivirus: { vendor: '-', status: 'Sem proteção' },
        ultimo_login: '2025-10-26'
      },
      {
        tipo: 'Switch',
        hostname: 'SW-CORE-01',
        setor: 'Data Center',
        empresa: 'InfraCorp',
        modelo: 'Cisco SG350-28',
        ip: '10.0.0.1',
        obs: 'Core da rede'
      },
      {
        tipo: 'Access Point',
        hostname: 'AP-RECEP-01',
        setor: 'Recepção',
        empresa: 'InfraCorp',
        modelo: 'Ubiquiti UAP-AC-LR',
        ip: '10.0.10.21',
        obs: 'Wi-Fi área de recepção'
      },
      {
        tipo: 'Impressora',
        hostname: 'PRINT-FIN-01',
        setor: 'Financeiro',
        empresa: 'ACME Ltda',
        modelo: 'HP LaserJet 400',
        ip: '10.0.20.15',
        obs: 'Uso compartilhado equipe financeira'
      },
      {
        tipo: 'Monitor',
        hostname: 'MON-DIR-01',
        setor: 'Diretoria',
        empresa: 'DrSuporti',
        modelo: 'Dell 27" IPS',
        obs: 'Monitor secundário'
      },
      {
        tipo: 'Nobreak',
        hostname: 'UPS-DATACENTER-01',
        setor: 'Data Center',
        empresa: 'InfraCorp',
        modelo: 'APC 3000VA',
        obs: 'Protege servidores principais'
      }
    ];

    ingestComputers(mockData);
    // fetch GLPI entities to populate empresas/setores selects
    (async () => {
      try {
        const resp = await fetch('/api/db/entities');
        const json = await resp.json();
        if (json && json.success && Array.isArray(json.data)) {
          const all = json.data;
          // top-level companies: parent_id === 0 or null
          const tops = all.filter(e => !e.parent_id || Number(e.parent_id) === 0).map(e => ({ id: e.id, name: e.name }));
          setState(prev => ({ ...prev, entities: all, empresasList: tops }));
        }
      } catch (e) {
        // ignore fetch errors for now
        console.error('failed to fetch entities', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (state.enriched.length > 0) {
      renderCharts();
    }
    return () => {
      // Cleanup charts
      if (chartSevInstance.current) chartSevInstance.current.destroy();
      if (chartRamInstance.current) chartRamInstance.current.destroy();
      if (chartM365Instance.current) chartM365Instance.current.destroy();
      if (chartAVInstance.current) chartAVInstance.current.destroy();
    };
  }, [state.enriched, state.filtros]);

  // when empresa (entity id) changes, fetch child entities (setores)
  useEffect(() => {
    const empresa = state.filtros && state.filtros.empresa;
    if (!empresa || empresa === 'all') {
      setState(prev => ({ ...prev, setoresList: [] }));
      return;
    }
    // empresa may be numeric id or string; ensure numeric
    const id = Number(empresa);
    if (isNaN(id) || id <= 0) {
      setState(prev => ({ ...prev, setoresList: [] }));
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`/api/db/entities/children/${id}`);
        const json = await resp.json();
        if (json && json.success && Array.isArray(json.data)) {
          const kids = json.data.map(e => ({ id: e.id, name: e.name }));
          setState(prev => ({ ...prev, setoresList: kids }));
        }
      } catch (e) {
        console.error('failed to fetch children entities', e);
        setState(prev => ({ ...prev, setoresList: [] }));
      }
    })();

    // also fetch actual computers for this entity and ingest into UI
    (async () => {
      try {
        const resp = await fetch(`/api/db/entities/${id}/computers`);
        const json = await resp.json();
        if (json && json.success && Array.isArray(json.data)) {
          // map DB rows to frontend asset shape (best-effort). Detect Microsoft 365 licenses from aggregated licensed_software.
            const mapped = json.data.map(r => {
            const licStr = r.licensed_software || '';
            const licenseTypeInfo = String(r.license_type_info || '');
            // parse license_type_info entries like "parentId|typeId|typeName||parentId|typeId|typeName"
            const labels = [];
            if (licenseTypeInfo) {
              const entries = licenseTypeInfo.split('||').map(s => s.trim()).filter(Boolean);
              for (const en of entries) {
                const parts = en.split('|');
                // parts: [parentId, typeId, typeName]
                const parentId = parts[0] || '';
                const typeId = parts[1] || '';
                const typeName = (parts[2] || '').trim();
                // if parent is 4 -> this is a license category we should show
                if (parentId === '4' || Number(parentId) === 4) {
                  if (typeName) labels.push(typeName);
                }
              }
            }
            const hasLicense = labels.length > 0;
            // debug problematic host
            try {
              if ((r.name || '').toUpperCase() === 'FCMMA01DT001') {
                // eslint-disable-next-line no-console
                console.debug('DBG_COMPUTER_RAW', r.name, {
                  license_states: r.license_states,
                  license_states_parent4: r.license_states_parent4,
                  license_type_info: r.license_type_info,
                  licensed_software: r.licensed_software,
                  labels,
                  hasLicense
                });
              }
            } catch (e) {}
            return {
              tipo: 'Desktop',
              hostname: r.name || r.hostname || (`id-${r.id}`),
              setor: '',
              empresa: (state.entities.find(e => Number(e.id) === Number(r.entities_id)) || {}).name || '',
              usuario: '',
              cpu: {},
              ram_gb: 0,
              disco: {},
              os: {},
              // include both the global license_states and the filtered states for parentId=4 (M365)
              m365: { licensed: hasLicense, details: labels.join(', '), license_ids: r.license_ids || '', license_states: r.license_states || '', license_states_parent4: r.license_states_parent4 || '' },
              antivirus: {},
              ultimo_login: r.last_boot || r.last_inventory_update || r.date_creation || '' ,
              entities_id: r.entities_id,
              id: r.id,
              comment: r.comment || ''
            };
          });
          ingestComputers(mapped);
        }
      } catch (e) {
        console.error('failed to fetch computers for entity', e);
      }
    })();
  }, [state.filtros.empresa]);

  // Recompute canvas sizes on window resize (debounced)
  useEffect(() => {
    let t = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        // re-render charts to resize canvases and realign interactions
        try { renderCharts(); } catch (e) {}
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (t) clearTimeout(t);
    };
  }, [state.enriched, state.filtros]);

  const isComputer = (asset) => {
    const tipo = (asset.tipo || '').toLowerCase();
    if (!tipo) return true;
    return (
      tipo.includes('desktop') ||
      tipo.includes('notebook') ||
      tipo.includes('laptop') ||
      tipo.includes('all-in-one') ||
      tipo.includes('workstation') ||
      tipo.includes('thin')
    );
  };

  const normalizaCpuGeracao = (cpu) => {
    if (cpu && typeof cpu.geracao === 'number') return cpu.geracao;
    if (cpu && cpu.modelo) {
      const m = cpu.modelo.match(/\b(\d{2})\d{2}\b/);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  };

  const avaliaHost = (h) => {
    const flags = [];
    let score = 100;

    const ram = Number(h.ram_gb || 0);
    const disco = h.disco || {};
    const tipoDisco = (disco.tipo || "DESCONHECIDO").toUpperCase();
    const cpuGen = normalizaCpuGeracao(h.cpu || {});

    if (cpuGen && cpuGen < PADRAO.cpuMinGeracaoIntel) {
      flags.push("CPU < " + PADRAO.cpuMinGeracaoIntel + "ª");
      score -= 35;
    } else if (!cpuGen) {
      flags.push("CPU desconhecida");
      score -= 10;
    }

    if (ram < PADRAO.ramMin) {
      flags.push("RAM < " + PADRAO.ramMin + "GB");
      score -= 35;
    }

    if (PADRAO.aceitaSSD && tipoDisco !== 'SSD') {
      flags.push("Sem SSD");
      score -= 40;
    }

    const osInfo = h.os || {};
    const osNome = (osInfo.nome || "") + " " + (osInfo.versao || "");
    const okOs = PADRAO.osAceitos.some(v => osNome.toLowerCase().indexOf(v.toLowerCase()) !== -1);
    if (!okOs) {
      flags.push("OS fora do padrão");
      score -= 15;
    }

    const m365 = h.m365 || {};
    if (m365 && m365.licensed === false) {
      flags.push("Sem licença Microsoft 365");
      score -= 5;
    }

    const av = h.antivirus || {};
    const statusAv = (av.status || "").toLowerCase();
    if (statusAv && statusAv !== "ativo") {
      flags.push("Antivírus não protegido");
      score -= 10;
    }

    let sev = 'ok';
    if (score < 50 || (flags.indexOf("Sem SSD") !== -1 && ram < 8)) {
      sev = 'crit';
    } else if (score < 75) {
      sev = 'warn';
    }

    let acao = 'Conforme';
    if (sev === 'crit') {
      acao = 'Substituir equipamento';
    } else if (sev === 'warn') {
      const ups = [];
      if (ram < 8) ups.push('Adicionar RAM para 8GB+');
      if (tipoDisco !== 'SSD') ups.push('Trocar por SSD');
      if (!okOs) ups.push('Atualizar para Windows Pro');
      if (m365 && m365.licensed === false) ups.push('Habilitar licença Microsoft 365');
      if (statusAv && statusAv !== "ativo") ups.push('Regularizar antivírus');
      acao = ups.join(' · ') || 'Ajustes menores';
    }

    return { sev, score, flags, acao };
  };

  const sevRank = (s) => {
    if (s === 'crit') return 0;
    if (s === 'warn') return 1;
    if (s === 'ok') return 2;
    return 3;
  };

  const ingestComputers = (raw) => {
    const rawData = Array.isArray(raw) ? raw : [];
    const computers = rawData.filter(isComputer);
    const infra = rawData.filter(x => !isComputer(x));

    const enriched = computers.map(r => ({
      ...r,
      eval: avaliaHost(r)
    })).sort((a, b) => {
      if (a.eval.sev === b.eval.sev) {
        return a.eval.score - b.eval.score;
      }
      return sevRank(a.eval.sev) - sevRank(b.eval.sev);
    });

    setState(prev => ({
      ...prev,
      raw: rawData,
      computers,
      infra,
      enriched
    }));
  };

  const filtrar = (arr) => {
    const { sev, empresa, setor, busca } = state.filtros;
    return arr.filter(x => {
      if (sev !== 'all' && x.eval.sev !== sev) return false;
      if (empresa && empresa !== 'all') {
        // empresa can be an entity id (number/string) or a company name (legacy/mock)
        const id = Number(empresa);
        if (!isNaN(id) && id > 0) {
          // match by entity id fields if present on assets
          if ((x.entities_id && Number(x.entities_id) === id) || (x.entity_id && Number(x.entity_id) === id)) {
            // ok
          } else {
            // fallback: compare by name using entities list
            const ent = state.entities.find(e => Number(e.id) === id);
            const name = ent ? ent.name : null;
            if (name) {
              if ((x.empresa || '').toLowerCase() !== name.toLowerCase()) return false;
            } else return false;
          }
        } else {
          // empresa is a name string (legacy/mock)
          if ((x.empresa || '').toLowerCase() !== String(empresa).toLowerCase()) return false;
        }
      }
      if (setor !== 'all' && (x.setor || '') !== setor) return false;
      if (busca) {
        const cpu = (x.cpu && x.cpu.modelo) ? x.cpu.modelo : '';
        const osInfo = x.os || {};
        const osNome = (osInfo.nome || '') + ' ' + (osInfo.versao || '');
        const str = [
          x.hostname || '',
          x.usuario || '',
          x.setor || '',
          cpu,
          osNome
        ].join(' ').toLowerCase();
        if (str.indexOf(busca.toLowerCase()) === -1) return false;
      }
      return true;
    });
  };

  const getSetores = () => {
    // prefer setoresList populated from backend when available
    if (Array.isArray(state.setoresList) && state.setoresList.length > 0) return state.setoresList.map(s => s.name);
    const set = {};
    const empresaFilter = state.filtros && state.filtros.empresa && state.filtros.empresa !== 'all' ? state.filtros.empresa : null;
    state.computers.forEach(x => {
      if (empresaFilter) {
        const id = Number(empresaFilter);
        if (!isNaN(id) && id > 0) {
          const ent = state.entities.find(e => Number(e.id) === id);
          if (ent && (x.empresa || '').toLowerCase() !== ent.name.toLowerCase()) return;
        } else if ((x.empresa || '').toLowerCase() !== String(empresaFilter).toLowerCase()) return;
      }
      if (x.setor) set[x.setor] = true;
    });
    return Object.keys(set).sort();
  };

  const getEmpresas = () => {
    // prefer backend empresasList if available
    if (Array.isArray(state.empresasList) && state.empresasList.length > 0) return state.empresasList;
    const set = {};
    state.computers.forEach(x => {
      if (x.empresa) set[x.empresa] = true;
    });
    return Object.keys(set).sort().map(n => ({ id: n, name: n }));
  };

  const getResumoAtivos = () => {
    const total = state.raw.length;
    let computadores = 0, switches = 0, aps = 0, impressoras = 0, monitores = 0, nobreaks = 0;

    state.raw.forEach(a => {
      const tipo = (a.tipo || '').toLowerCase();
      if (isComputer(a)) computadores++;
      else if (tipo.includes('switch')) switches++;
      else if (tipo.includes('ap') || tipo.includes('access point')) aps++;
      else if (tipo.includes('impress') || tipo.includes('printer')) impressoras++;
      else if (tipo.includes('monitor')) monitores++;
      else if (tipo.includes('nobreak') || tipo.includes('no-break') || tipo.includes('ups')) nobreaks++;
    });

    return { total, computadores, switches, aps, impressoras, monitores, nobreaks };
  };

  const getKpis = (arr) => {
    const total = (state.totalComputers && Number(state.totalComputers) > 0) ? Number(state.totalComputers) : state.computers.length;
    let crit = 0, warn = 0, ok = 0;
    arr.forEach(x => {
      if (x.eval.sev === 'crit') crit++;
      else if (x.eval.sev === 'warn') warn++;
      else if (x.eval.sev === 'ok') ok++;
    });
    const percOk = total ? Math.round((ok / total) * 100) : 0;
    return { total, crit, warn, ok, percOk };
  };

  const getLicencas = () => {
    const total = (state.totalComputers && Number(state.totalComputers) > 0) ? Number(state.totalComputers) : (state.computers.length || 1);
    let comM365 = 0, comAv = 0;
    state.enriched.forEach(x => {
      const m365 = x.m365 || {};
      if (m365.licensed !== false) comM365++;
      const av = x.antivirus || {};
      if ((av.status || '').toLowerCase() === 'ativo') comAv++;
    });
    const semM365 = total - comM365;
    const semAv = total - comAv;
    const pM365 = Math.round((comM365 / total) * 100);
    const pAv = Math.round((comAv / total) * 100);
    const pM365Off = 100 - pM365;
    const pAvOff = 100 - pAv;

    return { comM365, comAv, semM365, semAv, pM365, pAv, pM365Off, pAvOff };
  };

  const getMeters = () => {
    const total = (state.totalComputers && Number(state.totalComputers) > 0) ? Number(state.totalComputers) : (state.computers.length || 1);
    let okRam = 0, okSsd = 0, okCpu = 0, okOs = 0;

    state.enriched.forEach(x => {
      const ram = Number(x.ram_gb || 0);
      if (ram >= PADRAO.ramMin) okRam++;

      const disco = x.disco || {};
      const tipo = (disco.tipo || '').toUpperCase();
      if (tipo === 'SSD') okSsd++;

      const cpuGen = normalizaCpuGeracao(x.cpu || {});
      if (cpuGen >= PADRAO.cpuMinGeracaoIntel) okCpu++;

      const osInfo = x.os || {};
      const osNome = (osInfo.nome || '') + ' ' + (osInfo.versao || '');
      const matchOs = PADRAO.osAceitos.some(v => osNome.toLowerCase().indexOf(v.toLowerCase()) !== -1);
      if (matchOs) okOs++;
    });

    const pRam = Math.round((okRam / total) * 100);
    const pSsd = Math.round((okSsd / total) * 100);
    const pCpu = Math.round((okCpu / total) * 100);
    const pOs = Math.round((okOs / total) * 100);

    return { pRam, pSsd, pCpu, pOs };
  };

  const renderCharts = () => {
    const filtered = filtrar(state.enriched);
    const total = (state.totalComputers && Number(state.totalComputers) > 0) ? Number(state.totalComputers) : (state.computers.length || 1);

    // Severidade
    let crit = 0, warn = 0, ok = 0;
    filtered.forEach(x => {
      if (x.eval.sev === 'crit') crit++;
      else if (x.eval.sev === 'warn') warn++;
      else if (x.eval.sev === 'ok') ok++;
    });

    // Ensure canvas are sized for HiDPI displays to avoid blurry/streched text
    const setupCanvas = (cnv) => {
      if (!cnv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cnv.getBoundingClientRect();
      // set CSS size (logical pixels)
      cnv.style.width = rect.width + 'px';
      cnv.style.height = rect.height + 'px';
      // set actual pixel size for drawing buffer
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (cnv.width !== w || cnv.height !== h) {
        cnv.width = w;
        cnv.height = h;
      }
      // ensure drawing context is scaled so drawing and event coordinates align
      try {
        const ctx = cnv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } catch (e) {
        // ignore if context not available
      }
    };

    if (chartSevRef.current) {
      if (chartSevInstance.current) chartSevInstance.current.destroy();
      chartSevInstance.current = new Chart(chartSevRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Crítico', 'Atenção', 'OK'],
          datasets: [{
            data: [crit, warn, ok],
            backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text'), font: { size: 11 } }
            }
          },
          cutout: '60%',
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
      // ensure proper sizing
      try { chartSevInstance.current.resize(); } catch (e) {}
    }

    // RAM
    let faixas = { low: 0, mid: 0, high: 0 };
    state.computers.forEach(x => {
      const ram = Number(x.ram_gb || 0);
      if (ram < 4) faixas.low++;
      else if (ram < 8) faixas.mid++;
      else faixas.high++;
    });

    if (chartRamRef.current) {
      if (chartRamInstance.current) chartRamInstance.current.destroy();
      chartRamInstance.current = new Chart(chartRamRef.current, {
        type: 'bar',
        data: {
          labels: ['< 4GB', '4–7GB', '≥ 8GB'],
          datasets: [{
            label: 'Qtd',
            data: [faixas.low, faixas.mid, faixas.high],
            backgroundColor: ['#ef4444', '#f59e0b', '#22c55e']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text'), font: { size: 12 } } },
            y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text'), font: { size: 12 } }, beginAtZero: true }
          },
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
      try { chartRamInstance.current.resize(); } catch (e) {}
    }

    // M365
    let comM365 = 0;
    state.enriched.forEach(x => {
      const m365 = x.m365 || {};
      if (m365.licensed !== false) comM365++;
    });
    const semM365 = total - comM365;

    if (chartM365Ref.current) {
      if (chartM365Instance.current) chartM365Instance.current.destroy();
      chartM365Instance.current = new Chart(chartM365Ref.current, {
        type: 'doughnut',
        data: {
          labels: ['Com licença', 'Sem licença'],
          datasets: [{
            data: [comM365, semM365],
            backgroundColor: ['#38bdf8', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text'), font: { size: 11 } }
            }
          },
          cutout: '58%',
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
      try { chartM365Instance.current.resize(); } catch (e) {}
    }

    // Antivírus
    let avOk = 0, avVenc = 0, avNo = 0;
    state.enriched.forEach(x => {
      const av = x.antivirus || {};
      const st = (av.status || '').toLowerCase();
      if (st === 'ativo') avOk++;
      else if (st === 'expirado' || st === 'vencido') avVenc++;
      else avNo++;
    });

    if (chartAVRef.current) {
      if (chartAVInstance.current) chartAVInstance.current.destroy();
      chartAVInstance.current = new Chart(chartAVRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Protegido', 'Licença vencida', 'Sem proteção'],
          datasets: [{
            data: [avOk, avVenc, avNo],
            backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text'), font: { size: 11 } }
            }
          },
          cutout: '58%',
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
      try { chartAVInstance.current.resize(); } catch (e) {}
    }
  };

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const novo = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    localStorage.setItem('dashboardTheme', novo);
  };

  const resumo = getResumoAtivos();
  const filtered = filtrar(state.enriched);
  const kpis = getKpis(filtered);
  const licencas = getLicencas();
  const meters = getMeters();
  const empresas = getEmpresas();
  const setores = getSetores();

  

  return (
    <div className="inv-layout">
      {/* HEADER */}
      <div className="inv-header-bar">
        <div className="inv-header-left">
          <div className="inv-header-title">
            <h1>Saúde do Parque de Computadores</h1>
            <span className="inv-std-chip">Padrão: Win10/11 Pro · RAM ≥ 8GB · SSD · CPU ≥ i3 11ª</span>
          </div>
          <div className="inv-header-sub">
            Visão executiva para decidir rapidamente o que <strong>substituir</strong>, o que <strong>atualizar</strong> e o que já está <strong>em conformidade</strong>.
          </div>
        </div>
        <div className="inv-header-right">
          <div className="inv-filters">
            <div className="inv-filter">
              <span>Severidade</span>
              <select value={state.filtros.sev} onChange={(e) => setState(prev => ({ ...prev, filtros: { ...prev.filtros, sev: e.target.value } }))}>
                <option value="all">Todos</option>
                <option value="crit">Crítico (Substituir)</option>
                <option value="warn">Atenção (Upgrade)</option>
                <option value="ok">OK (Conforme)</option>
              </select>
            </div>
            <div className="inv-filter">
              <span>Empresa</span>
              <select value={state.filtros.empresa} onChange={(e) => setState(prev => ({ ...prev, filtros: { ...prev.filtros, empresa: e.target.value, setor: 'all' } }))}>
                <option value="all">Todas</option>
                {empresas.map(s => (
                  typeof s === 'string' ?
                    <option key={s} value={s}>{s}</option>
                  :
                    <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="inv-filter">
              <span>Setor</span>
              <select value={state.filtros.setor} onChange={(e) => setState(prev => ({ ...prev, filtros: { ...prev.filtros, setor: e.target.value } }))}>
                <option value="all">Todos</option>
                {setores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="inv-filter">
              <span>Busca</span>
              <input
                placeholder="Hostname, usuário, CPU..."
                value={state.filtros.busca}
                onChange={(e) => setState(prev => ({ ...prev, filtros: { ...prev.filtros, busca: e.target.value } }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* RESUMO DE ATIVOS */}
      <section className="inv-summary-card">
        <div className="inv-summary-title">Resumo do inventário</div>
        <div className="inv-summary-grid">
          <div className="inv-summary-item">Total de ativos:<strong>{resumo.total}</strong></div>
          <div className="inv-summary-item">Computadores:<strong>{resumo.computadores}</strong></div>
          <div className="inv-summary-item">Switches:<strong>{resumo.switches}</strong></div>
          <div className="inv-summary-item">Access Points:<strong>{resumo.aps}</strong></div>
          <div className="inv-summary-item">Impressoras:<strong>{resumo.impressoras}</strong></div>
          <div className="inv-summary-item">Monitores:<strong>{resumo.monitores}</strong></div>
          <div className="inv-summary-item">Nobreaks:<strong>{resumo.nobreaks}</strong></div>
        </div>
      </section>

      {/* KPIs HARDWARE */}
      <section className="inv-kpis">
        <div className="inv-kpi inv-crit">
          <h3>Substituir agora</h3>
          <div className="inv-value">{kpis.crit}</div>
          <div className="inv-trend">HDD, RAM baixa, CPU antiga</div>
        </div>
        <div className="inv-kpi inv-warn">
          <h3>Precisa de upgrade</h3>
          <div className="inv-value">{kpis.warn}</div>
          <div className="inv-trend">RAM, SSD ou OS fora do ideal</div>
        </div>
        <div className="inv-kpi inv-ok">
          <h3>Conformes</h3>
          <div className="inv-value">{kpis.ok}</div>
          <div className="inv-trend">Equipamentos no padrão</div>
        </div>
        <div className="inv-kpi">
          <h3>Total de computadores</h3>
          <div className="inv-value">{kpis.total}</div>
          <div className="inv-trend">{kpis.percOk}% em conformidade</div>
        </div>
      </section>

      {/* KPIs LICENÇAS / SEGURANÇA */}
      <section className="inv-kpis">
        <div className="inv-kpi">
          <h3>Licenças Microsoft 365 em uso</h3>
          <div className="inv-value">{licencas.comM365}</div>
          <div className="inv-trend">{licencas.pM365}% dos computadores com licença vinculada</div>
        </div>
        <div className="inv-kpi">
          <h3>Dispositivos protegidos com antivírus</h3>
          <div className="inv-value">{licencas.comAv}</div>
          <div className="inv-trend">{licencas.pAv}% dos computadores protegidos</div>
        </div>
        <div className="inv-kpi">
          <h3>Sem licença Microsoft 365</h3>
          <div className="inv-value">{licencas.semM365}</div>
          <div className="inv-trend">{licencas.pM365Off}% sem licença Microsoft 365</div>
        </div>
        <div className="inv-kpi">
          <h3>Sem proteção ativa</h3>
          <div className="inv-value">{licencas.semAv}</div>
          <div className="inv-trend">{licencas.pAvOff}% sem proteção ativa</div>
        </div>
      </section>

      {/* GRÁFICOS */}
      <section className="inv-charts-grid">
        <div className="inv-chart-card">
          <h4>Status dos dispositivos</h4>
          <div className="inv-chart-caption">Distribuição entre Substituir, Upgrade e OK</div>
          <div className="inv-chart-wrapper">
            <canvas ref={chartSevRef}></canvas>
          </div>
        </div>
        <div className="inv-chart-card">
          <h4>Memória RAM por faixa</h4>
          <div className="inv-chart-caption">Identificação rápida de falta de memória</div>
          <div className="inv-chart-wrapper">
            <canvas ref={chartRamRef}></canvas>
          </div>
        </div>
        <div className="inv-chart-card">
          <h4>Licenciamento Microsoft 365</h4>
          <div className="inv-chart-caption">Dispositivos com e sem licença vinculada</div>
          <div className="inv-chart-wrapper">
            <canvas ref={chartM365Ref}></canvas>
          </div>
        </div>
        <div className="inv-chart-card">
          <h4>Estado do Antivírus</h4>
          <div className="inv-chart-caption">Protegido × Vencido × Sem proteção</div>
          <div className="inv-chart-wrapper">
            <canvas ref={chartAVRef}></canvas>
          </div>
        </div>
      </section>

      {/* PAINEL DETALHES */}
      <section className="inv-panel">
        <div className="inv-card">
          <div className="inv-card-header">
            <div className="inv-card-title">Prioridades (do pior para o melhor)</div>
            <div className="inv-legend">
              <span><i className="inv-dot inv-crit"></i>Crítico</span>
              <span><i className="inv-dot inv-warn"></i>Atenção</span>
              <span><i className="inv-dot inv-ok"></i>OK</span>
            </div>
          </div>
          <div className="inv-priority-list">
            {filtered.map((x, idx) => (
              <div key={idx} className={`inv-row inv-flag-${x.eval.sev}`}>
                <div>
                  <span className={`inv-sev inv-${x.eval.sev}`}>
                    {x.eval.sev === 'crit' ? 'Crítico' : x.eval.sev === 'warn' ? 'Atenção' : 'OK'}
                  </span>
                </div>
                <div><strong>{x.hostname || '-'}</strong></div>
                <div className="inv-chips">
                  {x.eval.flags.length > 0 ? x.eval.flags.map((f, i) => (
                    <span key={i} className="inv-chip">{f}</span>
                  )) : <span className="inv-chip">Sem flags</span>}
                </div>
                <div>{x.setor || '-'}</div>
                <div className="inv-action">
                  <button className="inv-btn">Detalhes</button>
                  <button className="inv-btn inv-primary">
                    {x.eval.sev === 'crit' ? 'Substituir' : 'Propor Upgrade'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="inv-card">
          <div className="inv-card-header">
            <div className="inv-card-title">Pontos de ajuste por dimensão</div>
          </div>
          <div className="inv-mini inv-stack">
            <div>
              <div className="inv-metric"><span>Memória RAM conforme</span><span>{meters.pRam}%</span></div>
              <div className={`inv-meter ${meters.pRam >= 80 ? 'inv-ok' : meters.pRam >= 50 ? 'inv-warn' : 'inv-crit'}`}>
                <div style={{ width: meters.pRam + '%' }}></div>
              </div>
            </div>
            <div>
              <div className="inv-metric"><span>Armazenamento SSD</span><span>{meters.pSsd}%</span></div>
              <div className={`inv-meter ${meters.pSsd >= 80 ? 'inv-ok' : meters.pSsd >= 50 ? 'inv-warn' : 'inv-crit'}`}>
                <div style={{ width: meters.pSsd + '%' }}></div>
              </div>
            </div>
            <div>
              <div className="inv-metric"><span>CPU em padrão</span><span>{meters.pCpu}%</span></div>
              <div className={`inv-meter ${meters.pCpu >= 80 ? 'inv-ok' : meters.pCpu >= 50 ? 'inv-warn' : 'inv-crit'}`}>
                <div style={{ width: meters.pCpu + '%' }}></div>
              </div>
            </div>
            <div>
              <div className="inv-metric"><span>Sistema Operacional Pro</span><span>{meters.pOs}%</span></div>
              <div className={`inv-meter ${meters.pOs >= 80 ? 'inv-ok' : meters.pOs >= 50 ? 'inv-warn' : 'inv-crit'}`}>
                <div style={{ width: meters.pOs + '%' }}></div>
              </div>
            </div>
          </div>

          <div className="inv-table-wrap inv-mini">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Flags</th>
                  <th>Ação sugerida</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 8).map((x, idx) => (
                  <tr key={idx}>
                    <td>{x.hostname || '-'}</td>
                    <td>
                      {x.eval.flags.map((f, i) => <span key={i} className="inv-chip">{f}</span>)}
                    </td>
                    <td>{x.eval.acao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* INVENTÁRIO DE COMPUTADORES */}
      <div className="inv-card inv-inventory-card">
        <div className="inv-card-header">
          <div className="inv-card-title">Inventário de computadores</div>
        </div>
        <div className="inv-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Hostname</th>
                <th>Setor</th>
                <th>Usuário</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Disco</th>
                <th>OS</th>
                <th>Microsoft 365</th>
                <th>Antivírus</th>
                <th>Últ. login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x, idx) => {
                const cpu = x.cpu || {};
                const disco = x.disco || {};
                const osInfo = x.os || {};
                const m365 = x.m365 || {};
                const av = x.antivirus || {};
                const statusAv = (av.status || '').toLowerCase();
                
                return (
                  <tr key={idx} className={`inv-flag-${x.eval.sev}`}>
                    <td>{x.tipo || '-'}</td>
                    <td><strong>{x.hostname || '-'}</strong></td>
                    <td>{x.setor || '-'}</td>
                    <td>{x.usuario || '-'}</td>
                    <td>{cpu.modelo || '-'}</td>
                    <td>{x.ram_gb || 0} GB</td>
                    <td>{disco.tipo || '-'} {disco.tamanho_gb ? `(${disco.tamanho_gb} GB)` : ''}</td>
                    <td>{osInfo.nome || '-'} {osInfo.versao || ''}</td>
                    <td>
                      {!m365 ? (
                        <span className="inv-pill-off">Sem info</span>
                      ) : (() => {
                        // prefer the states aggregated for parentId=4 (M365) if provided by backend
                        const statesStr = String(m365.license_states_parent4 || m365.license_states || '');
                        let status = null; // 'licensed' | 'unlicensed' | null
                        if (statesStr) {
                          const parts = statesStr.split(',').map(s => s.trim()).filter(Boolean);
                          // treat presence of state '4' (not licensed) as authoritative
                          if (parts.indexOf('4') !== -1) status = 'unlicensed';
                          else if (parts.indexOf('3') !== -1) status = 'licensed';
                        }
                        // label content (category name or SKU) if available
                        const label = (m365.details && m365.details.length > 0) ? m365.details : (m365.sku || '');
                        // If we have a label, show it; coloring depends on explicit states or detection
                        if (label) {
                          if (status === 'unlicensed') {
                            // show the license name but marked as not licensed
                            return <span className="inv-pill-off" title={label}>{label}</span>;
                          }
                          if (status === 'licensed' || m365.licensed === true) {
                            return <span className="inv-pill-ok" title={label}>{label}</span>;
                          }
                          // no explicit state but we have a label -> treat as licensed
                          return <span className="inv-pill-ok" title={label}>{label}</span>;
                        }
                        // No label available: always show red 'Sem licença'
                        return <span className="inv-pill-off" title="Sem licença">Sem licença</span>;
                      })()
                    }
                    </td>
                    <td>
                      {!av ? <span className="inv-pill-off">Sem info</span> :
                        statusAv === 'ativo' ? <span className="inv-pill-ok">{av.vendor || 'Protegido'}</span> :
                          statusAv === 'expirado' || statusAv === 'vencido' ? <span className="inv-pill-alert">Licença vencida</span> :
                            <span className="inv-pill-off">Não protegido</span>}
                    </td>
                    <td>{x.ultimo_login || '-'}</td>
                    <td className="inv-flag-cell">
                      {x.eval.sev === 'crit' ? 'Substituir' : x.eval.sev === 'warn' ? 'Upgrade' : 'OK'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* INVENTÁRIO DE OUTROS ATIVOS */}
      <div className="inv-card inv-inventory-card">
        <div className="inv-card-header">
          <div className="inv-card-title">Outros ativos de infraestrutura</div>
        </div>
        <div className="inv-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Identificação</th>
                <th>Setor / Local</th>
                <th>Modelo</th>
                <th>IP / Endereço</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              {state.infra.map((x, idx) => {
                const modelo = x.modelo || (x.cpu && x.cpu.modelo) || '-';
                const ip = x.ip || x.endereco_ip || x.management_ip || '-';
                const obs = x.obs || x.observacoes || '';
                return (
                  <tr key={idx}>
                    <td>{x.tipo || '-'}</td>
                    <td><strong>{x.hostname || x.nome || '-'}</strong></td>
                    <td>{x.setor || x.local || '-'}</td>
                    <td>{modelo}</td>
                    <td>{ip}</td>
                    <td>{obs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
