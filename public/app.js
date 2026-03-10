// ════════════════════════════════════════════════════════════════════
//  HotelOS — app.js v4 — COMPLETO
// ════════════════════════════════════════════════════════════════════
const API   = window.location.origin;
let TOKEN   = sessionStorage.getItem('hotelos_token');
let USUARIO = JSON.parse(sessionStorage.getItem('hotelos_usuario') || 'null');
let HOTEL   = JSON.parse(sessionStorage.getItem('hotelos_hotel')   || 'null');

if (!TOKEN || !USUARIO || !HOTEL) window.location.href = 'index.html';

async function api(method, path, body = null) {
  try {
    const opts = { method, headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${TOKEN}` } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 401) { logout(); return null; }
    return await res.json();
  } catch { showToast('Error de conexión.','error'); return null; }
}

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

let state = { habitaciones: [], checkins: [], turnoActivo: null };
let checkoutTimer = null;

// ── INIT ──────────────────────────────────────────────────────────────────────
function checkSetup() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  startApp();
}

async function startApp() {
  applyHotelBrand();
  updateTopbarDate();
  setInterval(updateTopbarDate, 60000);
  await Promise.all([loadHabitaciones(), loadCheckins(), loadTurno()]);
  renderDashboard();
  renderHabitaciones();
  startCheckoutAlerts();
}

function applyHotelBrand() {
  setText('nav-hotel-name', HOTEL.nombre);
  setText('nav-hotel-rooms', `${HOTEL.totalHabitaciones} hab.`);
  const labelEl = document.getElementById('splash-hotel-label');
  if (labelEl) { labelEl.textContent = HOTEL.nombre; labelEl.classList.remove('hidden'); }
  if (HOTEL.logo) {
    const logoEl = document.getElementById('nav-logo');
    if (logoEl) logoEl.innerHTML = `<img src="${HOTEL.logo}" style="width:36px;height:36px;border-radius:8px;object-fit:cover"/>`;
  }
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = new Date().toLocaleDateString('es-CO',{weekday:'short',day:'2-digit',month:'short'});
}

// ── CARGA ─────────────────────────────────────────────────────────────────────
async function loadHabitaciones() {
  const d = await api('GET','/api/hotel/habitaciones');
  if (d?.ok) state.habitaciones = d.data;
}
async function loadCheckins() {
  const d = await api('GET','/api/hotel/checkins/activos');
  if (d?.ok) state.checkins = d.data;
}
async function loadTurno() {
  const d = await api('GET','/api/hotel/turno/activo');
  if (d?.ok) state.turnoActivo = d.data;
  renderTurnoStatus();
}

// ── ALERTAS CHECKOUT ──────────────────────────────────────────────────────────
function startCheckoutAlerts() {
  if (checkoutTimer) clearInterval(checkoutTimer);
  checkoutTimer = setInterval(checkCheckoutTimes, 60000);
  checkCheckoutTimes();
}

function checkCheckoutTimes() {
  const hora = HOTEL.checkoutHora || '13:00';
  const [hh, mm] = hora.split(':').map(Number);
  const ahora = new Date();
  state.checkins.forEach(ci => {
    if (!ci.fechaOutEst) return;
    const salida = new Date(ci.fechaOutEst);
    salida.setHours(hh, mm, 0, 0);
    const diff = salida - ahora;
    if (diff > 0 && diff < 30 * 60 * 1000) {
      showToast(`⏰ Hab ${ci.habitacionNum} — ${ci.clienteNombre} sale en ${Math.round(diff/60000)} min`,'warning');
    }
  });
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────────
function showView(name, linkEl) {
  document.querySelectorAll('.view').forEach(v => {
    const match = v.id === `view-${name}`;
    v.classList.toggle('hidden', !match);
    v.classList.toggle('active', match);
  });
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view===name));
  const titles = {dashboard:'Dashboard',habitaciones:'Habitaciones',checkin:'Check-in',checkout:'Check-out',clientes:'Clientes',turno:'Turno',reportes:'Reportes',config:'Configuración'};
  setText('view-title', titles[name]||name);
  if (name==='dashboard')    renderDashboard();
  if (name==='habitaciones') renderHabitaciones();
  if (name==='checkin')      renderCheckinSelects();
  if (name==='checkout')     { setValue('co-buscar',''); document.getElementById('checkout-results').innerHTML=''; }
  if (name==='clientes')     loadClientes();
  if (name==='turno')        renderTurnoView();
  if (name==='reportes')     { const n=new Date(); setValue('rep-mes',n.getMonth()); setValue('rep-anio',n.getFullYear()); }
  if (name==='config')       renderConfig();
  document.getElementById('sidebar')?.classList.remove('open');
  return false;
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const total       = state.habitaciones.length || HOTEL.totalHabitaciones;
  const disponibles = state.habitaciones.filter(h=>h.estado==='disponible').length;
  const ocupadas    = state.habitaciones.filter(h=>h.estado==='ocupada').length;
  const arreglar    = state.habitaciones.filter(h=>h.estado==='arreglar').length;
  setText('stat-disponibles', disponibles);
  setText('stat-ocupadas', ocupadas);
  setText('stat-arreglar', arreglar);
  setStyle('bar-disponibles','width', total?`${disponibles/total*100}%`:'0%');
  setStyle('bar-ocupadas',   'width', total?`${ocupadas/total*100}%`:'0%');
  setStyle('bar-arreglar',   'width', total?`${arreglar/total*100}%`:'0%');
  if (state.turnoActivo) {
    setText('stat-ingreso', formatMoney(state.turnoActivo.recaudado||0));
    setText('stat-ingreso-sub', `Turno: ${state.turnoActivo.empleado}`);
  } else {
    setText('stat-ingreso', formatMoney(0));
    setText('stat-ingreso-sub', 'Sin turno activo');
  }
  renderMiniGrid();
  renderActivity();
}

function renderMiniGrid() {
  const container = document.getElementById('mini-room-grid');
  if (!container) return;
  const byFloor = {};
  state.habitaciones.forEach(h => { if(!byFloor[h.piso]) byFloor[h.piso]=[]; byFloor[h.piso].push(h); });
  container.innerHTML = Object.keys(byFloor).sort((a,b)=>a-b).map(p=>`
    <div class="piso-row">
      <span class="piso-label">P${p}</span>
      <div class="piso-rooms">${byFloor[p].map(h=>`<div class="mini-room ${h.estado}" title="Hab ${h.numero} — ${h.estado}" onclick="openRoomModal('${h.numero}')"></div>`).join('')}</div>
    </div>`).join('');
}

function renderActivity() {
  const el = document.getElementById('activity-list');
  if (!el) return;
  const movs = (state.turnoActivo?.movimientos||[]).slice(-8).reverse();
  if (!movs.length) { el.innerHTML='<p class="empty-state">Sin actividad en este turno</p>'; return; }
  el.innerHTML = movs.map(m=>`
    <div class="activity-item">
      <div class="activity-icon ${m.tipo}">${m.tipo==='checkin'?'↓':m.tipo==='checkout'?'↑':m.tipo==='tienda'?'🛒':m.tipo==='lavanderia'?'👕':'−'}</div>
      <div><strong>${m.tipo}</strong>${m.hab?' · Hab '+m.hab:''}${m.descripcion?' · '+m.descripcion:''}${m.cliente?'<br><small>'+m.cliente+'</small>':''}${m.monto?'<span class="money-tag">+'+formatMoney(m.monto)+'</span>':''}</div>
      <div class="activity-time">${formatTime(m.hora)}</div>
    </div>`).join('');
}

// ── HABITACIONES ──────────────────────────────────────────────────────────────
let roomFilter='todas', roomViewMode='grid';

function renderHabitaciones() {
  const container = document.getElementById('rooms-container');
  if (!container) return;
  const habs = roomFilter==='todas' ? state.habitaciones : state.habitaciones.filter(h=>h.estado===roomFilter);
  if (!habs.length) { container.innerHTML='<p class="empty-state">No hay habitaciones.</p>'; return; }
  container.innerHTML = roomViewMode==='grid'
    ? `<div class="rooms-grid">${habs.map(roomCard).join('')}</div>`
    : `<div class="rooms-list-view">${habs.map(roomRow).join('')}</div>`;
}

function roomCard(h) {
  const ci  = state.checkins.find(c=>c.habitacionNum===h.numero);
  const obs = Array.isArray(h.observaciones) ? h.observaciones : [];
  return `<div class="room-card ${h.estado}" onclick="openRoomModal('${h.numero}')">
    <div class="room-number">${h.numero}</div>
    <div class="room-tipo">${h.tipo||'Estándar'} · ${h.bano||'Privado'}</div>
    <div class="room-estado-badge ${h.estado}">${estadoLabel(h.estado)}</div>
    ${ci?`<div class="room-guest"><small>👤 ${ci.clienteNombre}</small></div>`:''}
    ${obs.length?`<div style="margin-top:4px;font-size:10px;color:#e0a800">⚠️ ${obs.length} obs.</div>`:''}
  </div>`;
}

function roomRow(h) {
  const ci = state.checkins.find(c=>c.habitacionNum===h.numero);
  const obs = Array.isArray(h.observaciones) ? h.observaciones : [];
  return `<div class="room-row" onclick="openRoomModal('${h.numero}')">
    <strong>Hab ${h.numero}</strong>
    <span>${h.tipo||'Estándar'} · ${h.bano||'Privado'}</span>
    <span class="room-estado-badge ${h.estado}">${estadoLabel(h.estado)}</span>
    <span>${ci?ci.clienteNombre:'—'}${obs.length?' ⚠️':''}</span>
    <span>—</span>
  </div>`;
}

function filterRooms(f,el) {
  roomFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderHabitaciones();
}

function setRoomView(v) {
  roomViewMode=v;
  document.getElementById('btn-grid')?.classList.toggle('active',v==='grid');
  document.getElementById('btn-list')?.classList.toggle('active',v==='list');
  renderHabitaciones();
}

async function openRoomModal(numero) {
  const h  = state.habitaciones.find(r=>r.numero===numero);
  if (!h) return;
  const ci  = state.checkins.find(c=>c.habitacionNum===numero);
  const obs = Array.isArray(h.observaciones) ? h.observaciones : [];
  const estados = ['disponible','ocupada','arreglar','mantenimiento'];

  // Calcular estado checkout si hay checkin activo
  let alertaHora = '';
  if (ci?.fechaOutEst) {
    const hora = HOTEL.checkoutHora||'13:00';
    const [hh,mm] = hora.split(':').map(Number);
    const salida = new Date(ci.fechaOutEst);
    salida.setHours(hh,mm,0,0);
    const ahora = new Date();
    if (salida < ahora) {
      const extra = ahora - salida;
      const horas = Math.floor(extra/3600000);
      alertaHora = `<div style="background:#fef2f2;border:1px solid #d64242;border-radius:8px;padding:10px;margin:12px 0;font-size:13px">
        ⏰ <strong>Check-out vencido hace ${horas}h ${Math.floor((extra%3600000)/60000)}min</strong> (checkout: ${hora})
        <br><small>¿Cargo adicional por horas extra?</small>
      </div>`;
    } else {
      alertaHora = `<div style="background:#e8f5ee;border:1px solid #2da562;border-radius:8px;padding:8px 10px;margin:12px 0;font-size:12px">
        ✓ Checkout: ${hora} · ${formatDate(ci.fechaOutEst)}
      </div>`;
    }
  }

  document.getElementById('modal-content').innerHTML = `
    <h3 style="font-size:18px;font-weight:800;margin-bottom:12px">Habitación ${numero} · ${h.tipo||'Estándar'}</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:4px">${h.bano||'Privado'}</p>
    ${ci?`<hr style="margin:10px 0"><p><strong>👤 ${ci.clienteNombre}</strong></p><p style="font-size:12px;color:var(--muted)">Check-in: ${formatDate(ci.fechaIn)} · Doc: ${ci.clienteDoc}</p>${alertaHora}`:''}
    <hr style="margin:12px 0">
    <label style="font-weight:600;font-size:12px;letter-spacing:.5px;text-transform:uppercase">Estado</label>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px">
      ${estados.map(e=>`<button class="btn-estado ${e}${h.estado===e?' sel':''}" onclick="cambiarEstado('${numero}','${e}')">${estadoLabel(e)}</button>`).join('')}
    </div>
    <hr style="margin:12px 0">
    <label style="font-weight:600;font-size:12px;letter-spacing:.5px;text-transform:uppercase">Observaciones</label>
    <div style="margin:8px 0">
      ${obs.map(o=>`
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px;background:#fafaf8;border-radius:8px;margin-bottom:6px;font-size:12px">
          <div style="flex:1"><strong>${o.usuario||''}</strong> <span style="color:var(--muted)">${formatTime(o.hora)}</span><br>${o.texto}</div>
          <button onclick="eliminarObservacion('${numero}',${o.id})" style="background:none;border:none;cursor:pointer;color:#d64242;font-size:16px;line-height:1">×</button>
        </div>`).join('')||'<p style="color:var(--muted);font-size:12px">Sin observaciones</p>'}
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" id="obs-nueva" placeholder="Agregar observación..." style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit"/>
      <button onclick="agregarObservacion('${numero}')" class="btn-primary" style="width:auto;padding:8px 14px">+</button>
    </div>`;
  document.getElementById('modal').classList.remove('hidden');
}

async function cambiarEstado(numero, estado) {
  const d = await api('PUT',`/api/hotel/habitaciones/${numero}/estado`,{estado});
  if (d?.ok) {
    const idx = state.habitaciones.findIndex(h=>h.numero===numero);
    if (idx>=0) state.habitaciones[idx].estado = estado;
    closeModal(); renderHabitaciones(); renderDashboard();
    showToast(`Hab ${numero} → ${estadoLabel(estado)}`);
  }
}

async function agregarObservacion(numero) {
  const texto = document.getElementById('obs-nueva')?.value.trim();
  if (!texto) return;
  const d = await api('POST',`/api/hotel/habitaciones/${numero}/observacion`,{texto});
  if (d?.ok) {
    const idx = state.habitaciones.findIndex(h=>h.numero===numero);
    if (idx>=0) state.habitaciones[idx].observaciones = d.data;
    openRoomModal(numero);
    showToast('Observación agregada.');
  }
}

async function eliminarObservacion(numero, obsId) {
  const d = await api('DELETE',`/api/hotel/habitaciones/${numero}/observacion/${obsId}`);
  if (d?.ok) {
    const idx = state.habitaciones.findIndex(h=>h.numero===numero);
    if (idx>=0) state.habitaciones[idx].observaciones = d.data;
    openRoomModal(numero);
    showToast('Observación eliminada.');
  }
}

// ── CHECK-IN ──────────────────────────────────────────────────────────────────
function renderCheckinSelects() {
  const sel = document.getElementById('ci-hab');
  if (!sel) return;
  const disponibles = state.habitaciones.filter(h=>h.estado==='disponible');
  sel.innerHTML = '<option value="">— Seleccionar —</option>' +
    disponibles.map(h=>`<option value="${h.numero}">Hab ${h.numero} — ${h.tipo||'Estándar'} · ${h.bano||'Privado'}</option>`).join('');
  setValue('ci-fecha-in', new Date().toISOString().split('T')[0]);
  // Fecha salida = mañana por defecto
  const manana = new Date(); manana.setDate(manana.getDate()+1);
  setValue('ci-fecha-out', manana.toISOString().split('T')[0]);
}

async function buscarClientePorDoc() {
  const doc = document.getElementById('ci-doc')?.value.trim();
  if (!doc || doc.length < 3) return;
  const d = await api('GET',`/api/hotel/clientes/doc/${doc}`);
  if (d?.ok && d.data) {
    const c = d.data;
    setValue('ci-nombre', c.nombre); setValue('ci-tel', c.telefono||'');
    setValue('ci-email', c.email||''); setValue('ci-ciudad', c.ciudad||'');
    const badge = document.getElementById('ci-cliente-badge');
    if (badge) { badge.innerHTML=`<div class="badge-recurrente">⭐ Cliente recurrente · ${c.visitas} visita(s)</div>`; badge.classList.remove('hidden'); }
  } else {
    document.getElementById('ci-cliente-badge')?.classList.add('hidden');
  }
}

function ocultarSugerencias() { document.getElementById('ci-sugerencias')?.classList.add('hidden'); }

async function realizarCheckin() {
  const payload = {
    habitacionNum: document.getElementById('ci-hab')?.value,
    tipoDoc:       document.getElementById('ci-tipo-doc')?.value,
    clienteDoc:    document.getElementById('ci-doc')?.value.trim(),
    clienteNombre: document.getElementById('ci-nombre')?.value.trim(),
    clienteTel:    document.getElementById('ci-tel')?.value.trim(),
    clienteEmail:  document.getElementById('ci-email')?.value.trim(),
    clienteCiudad: document.getElementById('ci-ciudad')?.value.trim(),
    huespedes:     parseInt(document.getElementById('ci-huespedes')?.value)||1,
    fechaIn:       document.getElementById('ci-fecha-in')?.value,
    fechaOutEst:   document.getElementById('ci-fecha-out')?.value,
    tarifaNoche:   parseFloat(document.getElementById('ci-tarifa')?.value),
    metodoPago:    document.getElementById('ci-pago')?.value,
    observaciones: document.getElementById('ci-obs')?.value
  };
  if (!payload.habitacionNum||!payload.clienteDoc||!payload.clienteNombre||!payload.tarifaNoche) {
    showToast('Completa los campos requeridos (*).','error'); return;
  }
  const d = await api('POST','/api/hotel/checkin',payload);
  if (d?.ok) {
    showToast(`✓ Check-in Hab ${payload.habitacionNum} — ${payload.clienteNombre}`);
    limpiarCheckin();
    await Promise.all([loadHabitaciones(), loadCheckins()]);
    renderDashboard();
  } else showToast(d?.mensaje||'Error al hacer check-in.','error');
}

function limpiarCheckin() {
  ['ci-doc','ci-nombre','ci-tel','ci-email','ci-ciudad','ci-obs','ci-tarifa'].forEach(id=>setValue(id,''));
  setValue('ci-hab',''); setValue('ci-huespedes','1');
  document.getElementById('ci-cliente-badge')?.classList.add('hidden');
  renderCheckinSelects();
}

// ── CHECK-OUT ─────────────────────────────────────────────────────────────────
async function buscarCheckout() {
  const q = document.getElementById('co-buscar')?.value.trim();
  const container = document.getElementById('checkout-results');
  if (!q||!container) { if(container) container.innerHTML=''; return; }
  const d = await api('GET',`/api/hotel/checkins/buscar?q=${encodeURIComponent(q)}`);
  if (!d?.ok||!d.data.length) { container.innerHTML='<p class="empty-state">No se encontraron huéspedes activos.</p>'; return; }
  const horaCheckout = HOTEL.checkoutHora||'13:00';
  const [hh,mm] = horaCheckout.split(':').map(Number);

  container.innerHTML = d.data.map(ci => {
    const entrada  = new Date(ci.fechaIn);
    const ahora    = new Date();
    const salidaEst = ci.fechaOutEst ? new Date(ci.fechaOutEst) : null;
    if (salidaEst) salidaEst.setHours(hh,mm,0,0);

    const noches = Math.max(1, Math.ceil((ahora - entrada)/(1000*60*60*24)));
    const totalBase = noches * ci.tarifaNoche;

    // Calcular horas extra
    let horasExtra = 0, cargoSugerido = 0;
    if (salidaEst && ahora > salidaEst) {
      horasExtra = (ahora - salidaEst) / (1000*60*60);
      // Si pasó 5h del checkout = noche completa
      if (horasExtra >= 5) cargoSugerido = ci.tarifaNoche;
    }

    const alertaExtra = horasExtra > 0 ? `
      <div style="background:#fef2f2;border-radius:6px;padding:8px;font-size:12px;margin:8px 0">
        ⏰ <strong>${Math.floor(horasExtra)}h ${Math.floor((horasExtra%1)*60)}min de retraso</strong> (checkout: ${horaCheckout})
        ${cargoSugerido>0?`<br>⚠️ Pasó 5h — se sugiere cobrar noche completa: ${formatMoney(cargoSugerido)}`:''}
        <br>Cargo extra: <input type="number" id="extra-${ci.id}" value="${cargoSugerido}" style="width:110px;padding:4px 6px;border:1px solid #ddd;border-radius:4px;font-size:12px" onchange="recalcularTotal(${ci.id},${totalBase})"/>
      </div>` : '';

    return `<div class="checkout-card" id="co-card-${ci.id}">
      <div class="checkout-info">
        <h3>Hab ${ci.habitacionNum} · ${ci.clienteNombre}</h3>
        <p>Doc: ${ci.clienteDoc} · Entrada: ${formatDate(ci.fechaIn)} · Tarifa: ${formatMoney(ci.tarifaNoche)}/noche</p>
        <p><strong>${noches} noche(s) = ${formatMoney(totalBase)}</strong></p>
        ${alertaExtra}
      </div>
      <div class="checkout-actions">
        <div>
          <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px">TOTAL A COBRAR</label>
          <input type="number" id="pago-${ci.id}" value="${totalBase+cargoSugerido}" style="width:150px;padding:10px;border:2px solid #3b5bdb;border-radius:8px;font-size:16px;font-weight:700"/>
        </div>
        <button class="btn-primary" style="width:auto;padding:12px 24px" onclick="doCheckout(${ci.id},'${ci.habitacionNum}')">Check-out ↑</button>
      </div>
    </div>`;
  }).join('');
}

function recalcularTotal(id, base) {
  const extra = parseFloat(document.getElementById(`extra-${id}`)?.value)||0;
  const pagoEl = document.getElementById(`pago-${id}`);
  if (pagoEl) pagoEl.value = base + extra;
}

async function doCheckout(checkinId, hab) {
  const totalPagado = parseFloat(document.getElementById(`pago-${checkinId}`)?.value)||0;
  const d = await api('POST',`/api/hotel/checkout/${checkinId}`,{totalPagado});
  if (d?.ok) {
    showToast(`✓ Check-out Hab ${hab} · ${formatMoney(totalPagado)}`);
    setValue('co-buscar','');
    document.getElementById('checkout-results').innerHTML='';
    await Promise.all([loadHabitaciones(), loadCheckins(), loadTurno()]);
    renderDashboard();
  } else showToast(d?.mensaje||'Error.','error');
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
async function loadClientes(q='') {
  const d = await api('GET', q?`/api/hotel/clientes?q=${encodeURIComponent(q)}`:'/api/hotel/clientes');
  const container = document.getElementById('clientes-table-container');
  if (!container) return;
  if (!d?.ok||!d.data.length) { container.innerHTML='<p class="empty-state">No hay clientes registrados.</p>'; return; }
  container.innerHTML = `<table class="data-table"><thead><tr><th>Documento</th><th>Nombre</th><th>Teléfono</th><th>Ciudad</th><th>Visitas</th><th></th></tr></thead><tbody>
    ${d.data.map(c=>`<tr>
      <td>${c.tipoDoc||''} ${c.documento}</td><td>${c.nombre}</td><td>${c.telefono||'—'}</td>
      <td>${c.ciudad||'—'}</td><td><span class="badge-visitas">${c.visitas}</span></td>
      <td><button class="btn-sm" onclick="verHistorialCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')">Historial</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function buscarClientes() { loadClientes(document.getElementById('cliente-search')?.value||''); }

async function verHistorialCliente(id, nombre) {
  const d = await api('GET',`/api/hotel/clientes/${id}/historial`);
  if (!d?.ok) return;
  const { checkins, pedidosTienda, pedidosLav } = d.data;
  const totalGastado = checkins.filter(c=>c.estado==='checkout').reduce((s,c)=>s+(c.totalPagado||0),0)
    + pedidosTienda.filter(p=>p.pagado).reduce((s,p)=>s+p.total,0)
    + pedidosLav.filter(p=>p.pagado).reduce((s,p)=>s+p.total,0);
  const pendienteTienda = pedidosTienda.filter(p=>!p.pagado).reduce((s,p)=>s+p.total,0);
  const pendienteLav    = pedidosLav.filter(p=>!p.pagado).reduce((s,p)=>s+p.total,0);

  document.getElementById('modal-content').innerHTML = `
    <h3 style="font-size:17px;font-weight:800;margin-bottom:4px">👤 ${nombre}</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:16px">Total gastado: <strong style="color:var(--green)">${formatMoney(totalGastado)}</strong>
    ${pendienteTienda+pendienteLav>0?` · <strong style="color:var(--red)">Pendiente: ${formatMoney(pendienteTienda+pendienteLav)}</strong>`:''}</p>

    <h4 style="font-size:13px;font-weight:700;margin-bottom:8px">🏨 Estadías</h4>
    ${checkins.length?`<table class="data-table" style="font-size:12px"><thead><tr><th>Hab</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${checkins.map(c=>`<tr><td>Hab ${c.habitacion?.numero||'—'}</td><td>${formatDate(c.fechaIn)}</td><td>${c.fechaOutReal?formatDate(c.fechaOutReal):'Activo'}</td><td>${formatMoney(c.totalPagado||0)}</td><td><span class="room-estado-badge ${c.estado==='checkout'?'disponible':'ocupada'}">${c.estado}</span></td></tr>`).join('')}
    </tbody></table>` : '<p style="color:var(--muted);font-size:12px">Sin estadías</p>'}

    ${pedidosTienda.length?`<h4 style="font-size:13px;font-weight:700;margin:14px 0 8px">🛒 Tienda</h4>
    <table class="data-table" style="font-size:12px"><thead><tr><th>Producto</th><th>Cant</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${pedidosTienda.map(p=>`<tr><td>${p.item?.nombre||'—'}</td><td>${p.cantidad}</td><td>${formatMoney(p.total)}</td><td><span class="room-estado-badge ${p.pagado?'disponible':'rojo'}">${p.pagado?'Pagado':'Pendiente'}</span></td></tr>`).join('')}
    </tbody></table>`:''}

    ${pedidosLav.length?`<h4 style="font-size:13px;font-weight:700;margin:14px 0 8px">👕 Lavandería</h4>
    <table class="data-table" style="font-size:12px"><thead><tr><th>Prenda</th><th>Cant</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${pedidosLav.map(p=>`<tr><td>${p.item?.nombre||'—'}</td><td>${p.cantidad}</td><td>${formatMoney(p.total)}</td><td><span class="room-estado-badge ${p.entregado?'disponible':p.pagado?'amarillo':'rojo'}">${p.entregado?'Entregado':p.pagado?'Pagado':'Pendiente'}</span></td></tr>`).join('')}
    </tbody></table>`:''}`;
  document.getElementById('modal').classList.remove('hidden');
}

// ── TURNO ─────────────────────────────────────────────────────────────────────
function renderTurnoStatus() {
  const dot  = document.getElementById('turno-dot');
  const name = document.getElementById('turno-empleado-name');
  if (state.turnoActivo) { if(dot) dot.style.background='#2da562'; if(name) name.textContent=state.turnoActivo.empleado; }
  else { if(dot) dot.style.background='#ccc'; if(name) name.textContent='Sin turno activo'; }
}

function renderTurnoView() {
  const ini = document.getElementById('turno-inicio-panel');
  const act = document.getElementById('turno-activo-panel');
  if (!ini||!act) return;
  if (state.turnoActivo) {
    ini.classList.add('hidden'); act.classList.remove('hidden');
    const t = state.turnoActivo;
    setText('t-nombre-display',    t.empleado);
    setText('t-hora-display',      `Desde ${formatTime(t.horaIn)}`);
    setText('t-base-display',      formatMoney(t.baseCaja||0));
    setText('t-recaudado-display', formatMoney(t.recaudado||0));
    setText('t-gastos-display',    formatMoney(t.totalGastos||0));
    setText('t-total-display',     formatMoney((t.baseCaja||0)+(t.recaudado||0)-(t.totalGastos||0)));
    renderGastosList(); renderMovimientos();
  } else {
    ini.classList.remove('hidden'); act.classList.add('hidden');
    const now = new Date();
    setValue('t-hora-in', `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
  }
}

async function iniciarTurno() {
  const empleado = document.getElementById('t-empleado')?.value.trim();
  const baseCaja = parseFloat(document.getElementById('t-base')?.value)||0;
  const observIn = document.getElementById('t-obs-in')?.value||'';
  if (!empleado) { showToast('Ingresa el nombre del empleado.','error'); return; }
  const d = await api('POST','/api/hotel/turno/iniciar',{empleado,baseCaja,observIn});
  if (d?.ok) { state.turnoActivo=d.data; renderTurnoStatus(); renderTurnoView(); renderDashboard(); showToast(`Turno iniciado · ${empleado}`); }
  else showToast(d?.mensaje||'Error.','error');
}

async function agregarGasto() {
  const descripcion = document.getElementById('gasto-desc')?.value.trim();
  const monto       = parseFloat(document.getElementById('gasto-monto')?.value)||0;
  if (!descripcion||!monto) { showToast('Completa descripción y monto.','error'); return; }
  const d = await api('POST','/api/hotel/turno/gasto',{descripcion,monto});
  if (d?.ok) { state.turnoActivo=d.data; setValue('gasto-desc',''); setValue('gasto-monto',''); renderTurnoView(); showToast(`Gasto: ${formatMoney(monto)}`); }
}

function renderGastosList() {
  const el = document.getElementById('gastos-list');
  if (!el) return;
  const gastos = state.turnoActivo?.gastos||[];
  el.innerHTML = gastos.length ? gastos.map(g=>`<div class="gasto-item"><span>${g.descripcion}</span><span>${formatMoney(g.monto)}</span></div>`).join('') : '<p style="color:var(--muted);font-size:12px;padding:8px">Sin gastos</p>';
}

function renderMovimientos() {
  const el = document.getElementById('turno-movimientos');
  if (!el) return;
  const movs = (state.turnoActivo?.movimientos||[]).slice().reverse();
  el.innerHTML = movs.length ? movs.map(m=>`
    <div class="activity-item">
      <div class="activity-icon ${m.tipo}">${m.tipo==='checkin'?'↓':m.tipo==='checkout'?'↑':m.tipo==='tienda'?'🛒':m.tipo==='lavanderia'?'👕':'−'}</div>
      <div><strong>${m.tipo}</strong>${m.hab?' · Hab '+m.hab:''}${m.descripcion?' · '+m.descripcion:''}${m.cliente?' · '+m.cliente:''}${m.monto?' · '+formatMoney(m.monto):''}</div>
      <div class="activity-time">${formatTime(m.hora)}</div>
    </div>`).join('') : '<p class="empty-state">Sin movimientos</p>';
}

async function cerrarTurno() {
  const recibeNombre = document.getElementById('t-recibe')?.value.trim()||'';
  const observOut    = document.getElementById('t-obs-out')?.value||'';
  if (!confirm('¿Cerrar el turno y generar informe?')) return;
  const d = await api('POST','/api/hotel/turno/cerrar',{recibeNombre,observOut});
  if (d?.ok) {
    const t = d.data;
    state.turnoActivo = null;
    renderTurnoStatus(); renderTurnoView(); renderDashboard();
    showToast('Turno cerrado.');
    // Imprimir informe de entrega
    const r = d.data.resumenHabs || {};
    const w = window.open('','_blank');
    if (w) {
      w.document.write(`<pre style="font-family:monospace;padding:24px;font-size:13px;max-width:600px;margin:auto">
ENTREGA DE TURNO — ${HOTEL.nombre}
════════════════════════════════════════
Empleado  : ${t.empleado}
Inicio    : ${formatDate(t.horaIn)} ${formatTime(t.horaIn)}
Cierre    : ${formatDate(t.horaOut)} ${formatTime(t.horaOut)}
Recibe    : ${t.recibeNombre||'—'}

─── RESUMEN DE CAJA ─────────────────────
Base Caja  : ${formatMoney(t.baseCaja||0)}
Recaudado  : ${formatMoney(t.recaudado||0)}
Gastos     : ${formatMoney(t.totalGastos||0)}
═══════════════════════════════════════
TOTAL CAJA : ${formatMoney((t.baseCaja||0)+(t.recaudado||0)-(t.totalGastos||0))}

─── ESTADO HABITACIONES ─────────────────
Disponibles   : ${r.disponibles||0}
Ocupadas      : ${r.ocupadas||0}
Por Arreglar  : ${r.arreglar||0}
Mantenimiento : ${r.mantenimiento||0}

${r.detalle?.length?'Detalle:\n'+r.detalle.map(h=>`  Hab ${h.num}: ${h.estado}`).join('\n'):''}

─── GASTOS ───────────────────────────────
${(Array.isArray(t.gastos)?t.gastos:[]).map(g=>`  · ${g.descripcion}: ${formatMoney(g.monto)}`).join('\n')||'  Ninguno'}

NOVEDADES: ${t.observOut||'—'}
════════════════════════════════════════
HotelOS · ${new Date().toLocaleString('es-CO')}
</pre>`);
      w.print();
    }
  }
}

// ── REPORTES ──────────────────────────────────────────────────────────────────
async function generarReporte() {
  const mes  = document.getElementById('rep-mes')?.value;
  const anio = document.getElementById('rep-anio')?.value;
  const d    = await api('GET',`/api/hotel/reporte?mes=${mes}&anio=${anio}`);
  const el   = document.getElementById('reporte-output');
  if (!el||!d?.ok) { if(el) el.innerHTML='<p class="empty-state">Error al generar reporte.</p>'; return; }
  const r = d.data;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  el.innerHTML = `
    <div class="stats-grid" style="margin-top:20px">
      <div class="stat-card verde"><div class="stat-label">Check-ins</div><div class="stat-number">${r.totalCheckins}</div></div>
      <div class="stat-card rojo"><div class="stat-label">Check-outs</div><div class="stat-number">${r.totalCheckouts}</div></div>
      <div class="stat-card accent"><div class="stat-label">Ingresos Hospedaje</div><div class="stat-number money">${formatMoney(r.ingresos)}</div></div>
      <div class="stat-card amarillo"><div class="stat-label">Gastos Turnos</div><div class="stat-number money">${formatMoney(r.gastosTurnos)}</div></div>
      <div class="stat-card verde"><div class="stat-label">Tienda</div><div class="stat-number money">${formatMoney(r.ingresosTienda||0)}</div></div>
      <div class="stat-card verde"><div class="stat-label">Lavandería</div><div class="stat-number money">${formatMoney(r.ingresosLav||0)}</div></div>
      <div class="stat-card accent" style="border-top-color:#2da562"><div class="stat-label">Utilidad Total</div><div class="stat-number money">${formatMoney(r.utilidad||0)}</div></div>
    </div>
    <div class="panel" style="margin-top:20px">
      <div class="panel-header"><h3>Detalle ${meses[r.periodo?.mes||0]} ${r.periodo?.anio||anio}</h3></div>
      <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Hab</th><th>Huésped</th><th>Entrada</th><th>Salida</th><th>Noches</th><th>Total</th><th>Estado</th></tr></thead>
      <tbody>${(r.checkins||[]).map(c=>{
        const noches = c.fechaOutReal ? Math.max(1,Math.ceil((new Date(c.fechaOutReal)-new Date(c.fechaIn))/(1000*60*60*24))) : '—';
        return `<tr>
          <td>Hab ${c.habitacionNum}</td><td>${c.clienteNombre}</td>
          <td>${formatDate(c.fechaIn)}</td><td>${c.fechaOutReal?formatDate(c.fechaOutReal):'Activo'}</td>
          <td>${noches}</td><td>${formatMoney(c.totalPagado||0)}</td>
          <td><span class="room-estado-badge ${c.estado==='checkout'?'disponible':'ocupada'}">${c.estado}</span></td>
        </tr>`;
      }).join('')||'<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">Sin movimientos</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
function renderConfig() {
  setValue('cfg-nombre',       HOTEL.nombre||'');
  setValue('cfg-total',        HOTEL.totalHabitaciones||'');
  setValue('cfg-pisos',        HOTEL.pisos||'');
  setValue('cfg-tarifa',       HOTEL.tarifaBase||'');
  setValue('cfg-checkout-hora', HOTEL.checkoutHora||'13:00');
  const monedaEl = document.getElementById('cfg-moneda');
  if (monedaEl) monedaEl.value = HOTEL.moneda||'COP';
  if (HOTEL.logo) {
    const thumb = document.getElementById('logo-config-thumb');
    const ph    = document.getElementById('logo-placeholder');
    if (thumb) { thumb.src=HOTEL.logo; thumb.style.display='block'; }
    if (ph) ph.style.display='none';
  }
  renderConfigRooms();
  if (USUARIO.rol==='admin') renderRecepcionistas();
}

async function guardarConfig() {
  const nombre       = document.getElementById('cfg-nombre')?.value.trim();
  const tarifa       = parseFloat(document.getElementById('cfg-tarifa')?.value);
  const moneda       = document.getElementById('cfg-moneda')?.value;
  const checkoutHora = document.getElementById('cfg-checkout-hora')?.value||'13:00';
  const d = await api('PUT','/api/hotel/config',{nombre,tarifaBase:tarifa,moneda,checkoutHora});
  if (d?.ok) {
    HOTEL = { ...HOTEL, nombre, tarifaBase: tarifa, moneda, checkoutHora };
    sessionStorage.setItem('hotelos_hotel', JSON.stringify(HOTEL));
    applyHotelBrand(); showToast('Configuración guardada.');
  }
}

function renderConfigRooms() {
  const el = document.getElementById('config-rooms-list');
  if (!el) return;
  const tipos = ['Estándar','Sencilla','Doble','Triple','Suite','Junior Suite','Familiar','Ejecutiva'];
  const banos = ['Privado','Compartido','Sin baño'];
  el.innerHTML = state.habitaciones.map(h=>`
    <div class="config-room-item">
      <strong>Hab ${h.numero}</strong>
      <select onchange="updateRoomConfig('${h.numero}','tipo',this.value)">
        ${tipos.map(t=>`<option${h.tipo===t?' selected':''}>${t}</option>`).join('')}
      </select>
      <select onchange="updateRoomConfig('${h.numero}','bano',this.value)">
        ${banos.map(b=>`<option${(h.bano||'Privado')===b?' selected':''}>${b}</option>`).join('')}
      </select>
    </div>`).join('');
}

async function updateRoomConfig(numero, campo, valor) {
  const h = state.habitaciones.find(r=>r.numero===numero);
  if (!h) return;
  if (campo==='tipo') h.tipo=valor;
  if (campo==='bano') h.bano=valor;
  await api('PUT',`/api/hotel/habitaciones/${numero}/config`,{tipo:h.tipo,bano:h.bano});
}

async function renderRecepcionistas() {
  document.getElementById('panel-recepcionistas')?.remove();
  const d = await api('GET','/api/recepcionistas');
  const lista = d?.data||[];
  const configGrid = document.querySelector('.config-grid');
  if (!configGrid) return;
  const panel = document.createElement('div');
  panel.id='panel-recepcionistas'; panel.className='form-panel'; panel.style.cssText='grid-column:1/-1';

  // Agregar campo checkoutHora en config si no existe
  if (!document.getElementById('cfg-checkout-hora')) {
    const datosPanel = configGrid.querySelectorAll('.form-panel')[1];
    if (datosPanel) {
      const row = document.createElement('div');
      row.className='form-group';
      row.innerHTML='<label>Hora de Check-out</label><input type="time" id="cfg-checkout-hora" value="'+(HOTEL.checkoutHora||'13:00')+'"/>';
      datosPanel.querySelector('.btn-primary')?.before(row);
    }
  }

  panel.innerHTML = `
    <h2 class="form-title">👥 Equipo — Recepcionistas</h2>
    <p class="hint" style="margin-bottom:16px">Código del hotel: <strong style="letter-spacing:2px;color:#3b5bdb;font-size:16px">${HOTEL.codigo}</strong></p>
    <div class="form-row">
      <div class="form-group"><label>Nombre completo</label><input type="text" id="new-rec-nombre" placeholder="María López"/></div>
      <div class="form-group"><label>Usuario</label><input type="text" id="new-rec-user" placeholder="maria.lopez"/></div>
      <div class="form-group"><label>Contraseña</label><input type="password" id="new-rec-pass" placeholder="mínimo 6 caracteres"/></div>
    </div>
    <button class="btn-primary" style="width:auto;padding:10px 24px;margin-bottom:20px" onclick="crearRecepcionista()">+ Agregar</button>
    ${lista.length?`<table class="data-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map(r=>`<tr><td>${r.nombre}</td><td><code>${r.usuario}</code></td>
        <td><span class="room-estado-badge ${r.activo?'disponible':'arreglar'}">${r.activo?'Activo':'Inactivo'}</span></td>
        <td><button class="btn-sm" onclick="toggleRecepcionista(${r.id},${!r.activo})">${r.activo?'Desactivar':'Activar'}</button></td>
      </tr>`).join('')}
    </tbody></table>`:'<p class="empty-state">No hay recepcionistas aún.</p>'}`;
  configGrid.appendChild(panel);
}

async function crearRecepcionista() {
  const nombre=document.getElementById('new-rec-nombre')?.value.trim();
  const usuario=document.getElementById('new-rec-user')?.value.trim();
  const password=document.getElementById('new-rec-pass')?.value;
  if (!nombre||!usuario||!password) { showToast('Completa todos los campos.','error'); return; }
  const d = await api('POST','/api/recepcionistas',{nombre,usuario,password});
  if (d?.ok) { showToast(`✓ "${nombre}" creado.`); setValue('new-rec-nombre',''); setValue('new-rec-user',''); setValue('new-rec-pass',''); renderRecepcionistas(); }
  else showToast(d?.mensaje||'Error.','error');
}

async function toggleRecepcionista(id, activo) {
  const d = await api('PUT',`/api/recepcionistas/${id}`,{activo});
  if (d?.ok) { renderRecepcionistas(); showToast(activo?'Activado.':'Desactivado.'); }
}

function cargarLogoConfig(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    const d = await api('PUT','/api/hotel/config',{logo:base64});
    if (d?.ok) {
      HOTEL.logo=base64; sessionStorage.setItem('hotelos_hotel',JSON.stringify(HOTEL));
      applyHotelBrand(); showToast('Logo actualizado.');
      const thumb=document.getElementById('logo-config-thumb');
      if (thumb) { thumb.src=base64; thumb.style.display='block'; }
      document.getElementById('logo-placeholder')?.style.setProperty('display','none');
    }
  };
  reader.readAsDataURL(file);
}

function cargarLogoSetup() {}
function completarSetup() {}
function exportarDatos() {
  const blob=new Blob([JSON.stringify({hotel:HOTEL,usuario:USUARIO,exportado:new Date()},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`hotelos_${HOTEL.codigo}_${new Date().toISOString().split('T')[0]}.json`; a.click();
}
function resetearSistema() { if (!confirm('¿Cerrar sesión?')) return; logout(); }

// ── MODAL / TOAST ─────────────────────────────────────────────────────────────
function closeModal() { document.getElementById('modal')?.classList.add('hidden'); }

function showToast(msg, type='success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent=msg; el.className=`toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'), 3500);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatMoney(n) { return new Intl.NumberFormat('es-CO',{style:'currency',currency:HOTEL?.moneda||'COP',maximumFractionDigits:0}).format(n||0); }
function formatDate(d)  { if(!d) return '—'; return new Date(d).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}); }
function formatTime(d)  { if(!d) return ''; return new Date(d).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }
function estadoLabel(e) { return {disponible:'Disponible',ocupada:'Ocupada',arreglar:'Por Arreglar',mantenimiento:'Mantenimiento'}[e]||e; }
function setText(id,val)        { const el=document.getElementById(id); if(el) el.textContent=val; }
function setValue(id,val)       { const el=document.getElementById(id); if(el) el.value=val; }
function setStyle(id,prop,val)  { const el=document.getElementById(id); if(el) el.style[prop]=val; }

// ── ARRANCAR ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splash')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');
  startApp();
});
