// ════════════════════════════════════════════════════════════════════
//  HotelOS — app.js v5
// ════════════════════════════════════════════════════════════════════
const API  = window.location.origin;
let TOKEN  = sessionStorage.getItem('hotelos_token');
let USUARIO= JSON.parse(sessionStorage.getItem('hotelos_usuario')||'null');
let HOTEL  = JSON.parse(sessionStorage.getItem('hotelos_hotel')||'null');

if (!TOKEN||!USUARIO||!HOTEL) window.location.href='index.html';

async function api(method,path,body=null){
  try{
    const opts={method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`}};
    if(body) opts.body=JSON.stringify(body);
    const res=await fetch(`${API}${path}`,opts);
    if(res.status===401){logout();return null;}
    return await res.json();
  }catch{showToast('Error de conexión.','error');return null;}
}

function logout(){sessionStorage.clear();window.location.href='index.html';}

let state={habitaciones:[],checkins:[],turnoActivo:null};
let tiendaItemSel=null, lavItemSel=null;
let checkoutTimer=null;

// ── INIT ──────────────────────────────────────────────────────────────────────
function checkSetup(){
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  startApp();
}

async function startApp(){
  applyHotelBrand();
  updateTopbarDate();
  setInterval(updateTopbarDate,60000);
  await Promise.all([loadHabitaciones(),loadCheckins(),loadTurno()]);
  renderDashboard();
  renderHabitaciones();
  startCheckoutAlerts();
}

function applyHotelBrand(){
  setText('nav-hotel-name',HOTEL.nombre);
  setText('nav-hotel-rooms',`${HOTEL.totalHabitaciones} hab.`);
  const lbl=document.getElementById('splash-hotel-label');
  if(lbl){lbl.textContent=HOTEL.nombre;lbl.classList.remove('hidden');}
  const logoSrc=HOTEL.logo||generarLogoAutomatico(HOTEL.nombre);
  const lo=document.getElementById('nav-logo');
  if(lo) lo.innerHTML=`<img src="${logoSrc}" style="width:36px;height:36px;border-radius:8px;object-fit:cover"/>`;
}

function updateTopbarDate(){
  const el=document.getElementById('topbar-date');
  if(el) el.textContent=new Date().toLocaleDateString('es-CO',{weekday:'short',day:'2-digit',month:'short'});
}

// ── CARGA ─────────────────────────────────────────────────────────────────────
async function loadHabitaciones(){const d=await api('GET','/api/hotel/habitaciones');if(d?.ok)state.habitaciones=d.data;}
async function loadCheckins(){const d=await api('GET','/api/hotel/checkins/activos');if(d?.ok)state.checkins=d.data;}
async function loadTurno(){const d=await api('GET','/api/hotel/turno/activo');if(d?.ok)state.turnoActivo=d.data;renderTurnoStatus();}

// ── ALERTAS ───────────────────────────────────────────────────────────────────
function startCheckoutAlerts(){
  if(checkoutTimer) clearInterval(checkoutTimer);
  checkoutTimer=setInterval(checkCheckoutTimes,60000);
}

function checkCheckoutTimes(){
  const hora=HOTEL.checkoutHora||'13:00';
  const [hh,mm]=hora.split(':').map(Number);
  const ahora=new Date();
  state.checkins.forEach(ci=>{
    if(!ci.fechaOutEst) return;
    const sal=new Date(ci.fechaOutEst); sal.setHours(hh,mm,0,0);
    const diff=sal-ahora;
    if(diff>0&&diff<30*60*1000) showToast(`⏰ Hab ${ci.habitacionNum} — ${ci.clienteNombre} sale en ${Math.round(diff/60000)}min`,'warning');
  });
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────────
function showView(name,linkEl){
  document.querySelectorAll('.view').forEach(v=>{
    const m=v.id===`view-${name}`;
    v.classList.toggle('hidden',!m);
    v.classList.toggle('active',m);
  });
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.toggle('active',a.dataset.view===name));
  const titles={dashboard:'Dashboard',habitaciones:'Habitaciones',checkin:'Check-in',checkout:'Check-out',
    clientes:'Clientes',tienda:'Tienda',lavanderia:'Lavandería',turno:'Turno',reportes:'Reportes',config:'Configuración'};
  setText('view-title',titles[name]||name);
  if(name==='dashboard')    renderDashboard();
  if(name==='habitaciones') renderHabitaciones();
  if(name==='checkin')      initCheckin();
  if(name==='checkout')     renderCheckout();
  if(name==='clientes')     loadClientes();
  if(name==='tienda')       initTienda();
  if(name==='lavanderia')   initLavanderia();
  if(name==='turno')        renderTurnoView();
  if(name==='reportes')     {const n=new Date();setValue('rep-mes',n.getMonth());setValue('rep-anio',n.getFullYear());cargarReporteHoy();}
  if(name==='config')       renderConfig();
  document.getElementById('sidebar')?.classList.remove('open');
  return false;
}

function toggleMontoPagado(val){
  const row=document.getElementById('ci-pago-monto-row');
  if(row) row.style.display=(val==='parcial'||val==='pagado')?'block':'none';
}

// Genera logo automático con las iniciales del hotel si no hay logo
function generarLogoAutomatico(nombre){
  const canvas=document.createElement('canvas');
  canvas.width=120; canvas.height=120;
  const ctx=canvas.getContext('2d');
  // Fondo degradado
  const grad=ctx.createLinearGradient(0,0,120,120);
  grad.addColorStop(0,'#3b5bdb');
  grad.addColorStop(1,'#1e3a8a');
  ctx.fillStyle=grad;
  ctx.beginPath();
  ctx.roundRect(0,0,120,120,24);
  ctx.fill();
  // Iniciales
  const palabras=(nombre||'H').trim().split(/\s+/);
  const iniciales=palabras.length>=2
    ? (palabras[0][0]+palabras[1][0]).toUpperCase()
    : nombre.substring(0,2).toUpperCase();
  ctx.fillStyle='#fff';
  ctx.font='bold 48px sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(iniciales,60,62);
  return canvas.toDataURL('image/png');
}



// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDashboard(){
  const total=state.habitaciones.length||HOTEL.totalHabitaciones;
  const disp=state.habitaciones.filter(h=>h.estado==='disponible').length;
  const ocup=state.habitaciones.filter(h=>h.estado==='ocupada').length;
  const arr=state.habitaciones.filter(h=>h.estado==='arreglar').length;
  setText('stat-disponibles',disp); setText('stat-ocupadas',ocup); setText('stat-arreglar',arr);
  setStyle('bar-disponibles','width',total?`${disp/total*100}%`:'0%');
  setStyle('bar-ocupadas','width',total?`${ocup/total*100}%`:'0%');
  setStyle('bar-arreglar','width',total?`${arr/total*100}%`:'0%');
  if(state.turnoActivo){
    setText('stat-ingreso',formatMoney(state.turnoActivo.recaudado||0));
    setText('stat-ingreso-sub',`Turno: ${state.turnoActivo.empleado}`);
  } else {
    setText('stat-ingreso',formatMoney(0));
    setText('stat-ingreso-sub','Sin turno activo');
  }
  renderMiniGrid(); renderActivity();
}

function renderMiniGrid(){
  const c=document.getElementById('mini-room-grid'); if(!c) return;
  const byFloor={};
  state.habitaciones.forEach(h=>{if(!byFloor[h.piso])byFloor[h.piso]=[];byFloor[h.piso].push(h);});
  c.innerHTML=Object.keys(byFloor).sort((a,b)=>a-b).map(p=>`
    <div class="piso-row"><span class="piso-label">P${p}</span>
    <div class="piso-rooms">${byFloor[p].map(h=>`<div class="mini-room ${h.estado}" title="Hab ${h.numero} · ${h.estado}" onclick="openRoomModal('${h.numero}')"></div>`).join('')}</div></div>`).join('');
}

function renderActivity(){
  const el=document.getElementById('activity-list'); if(!el) return;
  const movs=(state.turnoActivo?.movimientos||[]).slice(-8).reverse();
  if(!movs.length){el.innerHTML='<p class="empty-state">Sin actividad en este turno</p>';return;}
  el.innerHTML=movs.map(m=>`
    <div class="activity-item">
      <div class="activity-icon ${m.tipo}">${m.tipo==='checkin'?'↓':m.tipo==='checkout'?'↑':m.tipo==='tienda'?'🛒':m.tipo==='lavanderia'?'👕':'−'}</div>
      <div style="flex:1"><strong>${m.tipo}</strong>${m.hab?' · Hab '+m.hab:''}${m.descripcion?' · '+m.descripcion:''}${m.cliente?`<br><small style="color:var(--muted)">${m.cliente}</small>`:''}${m.monto?`<span style="float:right;font-size:11px;font-weight:700;color:#2da562">+${formatMoney(m.monto)}</span>`:''}</div>
      <div class="activity-time">${formatTime(m.hora)}</div>
    </div>`).join('');
}

// ── HABITACIONES ──────────────────────────────────────────────────────────────
let roomFilter='todas',roomViewMode='grid';

function renderHabitaciones(){
  const c=document.getElementById('rooms-container'); if(!c) return;
  const habs=roomFilter==='todas'?state.habitaciones:state.habitaciones.filter(h=>h.estado===roomFilter);
  if(!habs.length){c.innerHTML='<p class="empty-state">No hay habitaciones.</p>';return;}
  c.innerHTML=roomViewMode==='grid'
    ?`<div class="rooms-grid">${habs.map(roomCard).join('')}</div>`
    :`<div class="rooms-list-view">${habs.map(roomRow).join('')}</div>`;
}

function roomCard(h){
  const ci=state.checkins.find(c=>c.habitacionNum===h.numero);
  const obs=Array.isArray(h.observaciones)?h.observaciones:[];
  return `<div class="room-card ${h.estado}" onclick="openRoomModal('${h.numero}')">
    <div class="room-number">${h.numero}</div>
    <div class="room-tipo">${h.tipo||'Estándar'} · ${h.bano||'Privado'}</div>
    <div class="room-estado-badge ${h.estado}">${estadoLabel(h.estado)}</div>
    ${ci?`<div style="margin-top:6px;font-size:11px;font-weight:600;color:#333">👤 ${ci.clienteNombre}</div>`:''}
    ${obs.length?`<div style="margin-top:4px;font-size:10px;color:#e0a800">⚠️ ${obs.length} obs.</div>`:''}
  </div>`;
}

function roomRow(h){
  const ci=state.checkins.find(c=>c.habitacionNum===h.numero);
  const obs=Array.isArray(h.observaciones)?h.observaciones:[];
  return `<div class="room-row" onclick="openRoomModal('${h.numero}')">
    <strong>Hab ${h.numero}</strong>
    <span>${h.tipo||'Estándar'} · ${h.bano||'Privado'}</span>
    <span class="room-estado-badge ${h.estado}">${estadoLabel(h.estado)}</span>
    <span>${ci?ci.clienteNombre:'—'}${obs.length?' ⚠️':''}</span>
  </div>`;
}

function filterRooms(f,el){
  roomFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderHabitaciones();
}

function setRoomView(v){
  roomViewMode=v;
  document.getElementById('btn-grid')?.classList.toggle('active',v==='grid');
  document.getElementById('btn-list')?.classList.toggle('active',v==='list');
  renderHabitaciones();
}

async function openRoomModal(numero){
  const h=state.habitaciones.find(r=>r.numero===numero); if(!h) return;
  const ci=state.checkins.find(c=>c.habitacionNum===numero);
  const obs=Array.isArray(h.observaciones)?h.observaciones:[];
  const estados=['disponible','ocupada','arreglar','mantenimiento'];

  let alertaHora='';
  if(ci?.fechaOutEst){
    const hora=HOTEL.checkoutHora||'13:00';
    const [hh,mm]=hora.split(':').map(Number);
    const sal=new Date(ci.fechaOutEst); sal.setHours(hh,mm,0,0);
    const ahora=new Date();
    const horasDesdeIngreso=(ahora-new Date(ci.fechaIn))/3600000;
    // Solo mostrar alerta si ya pasó la hora de checkout Y llevó al menos 12h en el hotel
    if(sal<ahora && horasDesdeIngreso>12){
      const extra=ahora-sal;
      const hs=Math.floor(extra/3600000);
      alertaHora=`<div style="background:#fef2f2;border:1px solid #d64242;border-radius:8px;padding:10px;margin:10px 0;font-size:12px">⏰ <strong>Check-out vencido hace ${hs}h ${Math.floor((extra%3600000)/60000)}min</strong></div>`;
    } else if(sal>ahora){
      alertaHora=`<div style="background:#e8f5ee;border:1px solid #2da562;border-radius:8px;padding:8px 10px;margin:10px 0;font-size:12px">✓ Sale: ${formatDate(sal)} a las ${hora}</div>`;
    }
  }

  // Pedidos tienda/lavandería del checkin activo
  let pedidosHtml='';
  if(ci){
    const [pt,pl]=await Promise.all([
      api('GET',`/api/hotel/tienda/pedidos?pendientes=0`),
      api('GET',`/api/hotel/lavanderia/pedidos?pendientes=0`)
    ]);
    const pedT=(pt?.data||[]).filter(p=>p.habitacion===numero);
    const pedL=(pl?.data||[]).filter(p=>p.habitacion===numero);
    if(pedT.length||pedL.length){
      pedidosHtml=`<div class="modal-section">
        <h4>🛒 Tienda / 👕 Lavandería</h4>
        ${pedT.map(p=>`<div class="order-card ${p.pagado?'pagado':'pendiente'}">
          <div class="order-card-top"><strong>${p.item?.nombre}</strong><span class="order-tag ${p.pagado?'tag-ok':'tag-pend'}">${p.pagado?'Pagado':'Pendiente'}</span></div>
          <span style="font-size:11px;color:var(--muted)">Cant: ${p.cantidad} · ${formatMoney(p.total)}</span>
          ${!p.pagado?`<button class="btn-sm" style="margin-top:6px" onclick="pagarTiendaDesdeModal(${p.id},'${numero}')">Cobrar ${formatMoney(p.total)}</button>`:''}
        </div>`).join('')}
        ${pedL.map(p=>`<div class="order-card ${p.entregado?'pagado':p.pagado?'pagado':'pendiente'}">
          <div class="order-card-top"><strong>👕 ${p.item?.nombre}</strong><span class="order-tag ${p.entregado?'tag-entregado':p.pagado?'tag-ok':'tag-pend'}">${p.entregado?'Entregado':p.pagado?'Pagado':'Pendiente'}</span></div>
          <span style="font-size:11px;color:var(--muted)">Cant: ${p.cantidad} · ${formatMoney(p.total)}</span>
          <div style="display:flex;gap:6px;margin-top:6px">
            ${!p.pagado?`<button class="btn-sm" onclick="pagarLavDesdeModal(${p.id},'${numero}')">Cobrar</button>`:''}
            ${p.pagado&&!p.entregado?`<button class="btn-sm" onclick="entregarLavDesdeModal(${p.id},'${numero}')">Entregado</button>`:''}
          </div>
        </div>`).join('')}
      </div>`;
    }
  }

  document.getElementById('modal-content').innerHTML=`
    <h3 style="font-size:19px;font-weight:800;margin-bottom:2px">Habitación ${numero}</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:12px">${h.tipo||'Estándar'} · ${h.bano||'Privado'}</p>
    ${ci?`<div class="modal-section"><h4>Huésped Actual</h4>
      <p style="font-size:14px;font-weight:700">👤 ${ci.clienteNombre}</p>
      <p style="font-size:12px;color:var(--muted)">Doc: ${ci.clienteDoc} · Entrada: ${formatDate(ci.fechaIn)} · Tarifa: ${formatMoney(ci.tarifaNoche)}/noche</p>
      ${alertaHora}
    </div>`:''}
    ${pedidosHtml}
    <div class="modal-section">
      <h4>Estado de la Habitación</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${estados.map(e=>`<button class="btn-estado ${e}${h.estado===e?' sel':''}" onclick="cambiarEstado('${numero}','${e}')">${estadoLabel(e)}</button>`).join('')}
      </div>
    </div>
    <div class="modal-section">
      <h4>Observaciones</h4>
      ${obs.map(o=>`<div style="display:flex;gap:8px;align-items:flex-start;padding:8px;background:#fafaf8;border-radius:8px;margin-bottom:6px;font-size:12px">
        <div style="flex:1"><strong>${o.usuario||''}</strong> <span style="color:var(--muted)">${formatTime(o.hora)}</span><br>${o.texto}</div>
        <button onclick="eliminarObservacion('${numero}',${o.id})" style="background:none;border:none;cursor:pointer;color:#d64242;font-size:18px;line-height:1">×</button>
      </div>`).join('')||'<p style="color:var(--muted);font-size:12px">Sin observaciones</p>'}
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" id="obs-nueva" placeholder="Agregar observación..." style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit"/>
        <button onclick="agregarObservacion('${numero}')" class="btn-primary" style="width:auto;padding:8px 14px">+</button>
      </div>
    </div>`;
  document.getElementById('modal').classList.remove('hidden');
}

async function pagarTiendaDesdeModal(id,hab){
  await api('PUT',`/api/hotel/tienda/pedidos/${id}/pagar`);
  showToast('Cobrado.'); await loadTurno(); openRoomModal(hab);
}
async function pagarLavDesdeModal(id,hab){
  await api('PUT',`/api/hotel/lavanderia/pedidos/${id}`,{pagado:true});
  showToast('Cobrado.'); await loadTurno(); openRoomModal(hab);
}
async function entregarLavDesdeModal(id,hab){
  await api('PUT',`/api/hotel/lavanderia/pedidos/${id}`,{entregado:true});
  showToast('Marcado como entregado.'); openRoomModal(hab);
}

async function cambiarEstado(numero,estado){
  const d=await api('PUT',`/api/hotel/habitaciones/${numero}/estado`,{estado});
  if(d?.ok){
    const idx=state.habitaciones.findIndex(h=>h.numero===numero);
    if(idx>=0) state.habitaciones[idx].estado=estado;
    closeModal(); renderHabitaciones(); renderDashboard();
    showToast(`Hab ${numero} → ${estadoLabel(estado)}`);
  }
}

async function agregarObservacion(numero){
  const texto=document.getElementById('obs-nueva')?.value.trim(); if(!texto) return;
  const d=await api('POST',`/api/hotel/habitaciones/${numero}/observacion`,{texto});
  if(d?.ok){
    const idx=state.habitaciones.findIndex(h=>h.numero===numero);
    if(idx>=0) state.habitaciones[idx].observaciones=d.data;
    openRoomModal(numero); showToast('Observación agregada.');
  }
}

async function eliminarObservacion(numero,obsId){
  const d=await api('DELETE',`/api/hotel/habitaciones/${numero}/observacion/${obsId}`);
  if(d?.ok){
    const idx=state.habitaciones.findIndex(h=>h.numero===numero);
    if(idx>=0) state.habitaciones[idx].observaciones=d.data;
    openRoomModal(numero); showToast('Observación eliminada.');
  }
}

// ── CHECK-IN ──────────────────────────────────────────────────────────────────
function initCheckin(){
  const sel=document.getElementById('ci-room-selector'); if(!sel) return;
  const disponibles=state.habitaciones.filter(h=>h.estado==='disponible');
  if(!disponibles.length){
    sel.innerHTML='<p class="empty-state" style="font-size:12px">No hay habitaciones disponibles.</p>';
    return;
  }
  sel.innerHTML=disponibles.map(h=>`
    <button class="ci-room-btn" onclick="selectRoom('${h.numero}',this)">
      <span class="rs-num">${h.numero}</span>
      <span class="rs-tipo">${h.tipo||'Estándar'}</span>
      <span class="rs-bano">${h.bano||'Privado'}</span>
    </button>`).join('');
  setValue('ci-hab','');
  document.getElementById('ci-selected-info')?.classList.add('hidden');
  const today=new Date().toISOString().split('T')[0];
  const tom=new Date(); tom.setDate(tom.getDate()+1);
  setValue('ci-fecha-in',today);
  setValue('ci-fecha-out',tom.toISOString().split('T')[0]);
}

function selectRoom(numero,btn){
  setValue('ci-hab',numero);
  document.querySelectorAll('.ci-room-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  const h=state.habitaciones.find(r=>r.numero===numero);
  const info=document.getElementById('ci-selected-info');
  if(info){info.textContent=`✓ Habitación ${numero} seleccionada — ${h?.tipo||'Estándar'} · ${h?.bano||'Privado'}`;info.classList.remove('hidden');}
}

async function buscarClientePorDoc(){
  const doc=document.getElementById('ci-doc')?.value.trim();
  if(!doc||doc.length<3) return;
  const d=await api('GET',`/api/hotel/clientes/doc/${doc}`);
  if(d?.ok&&d.data){
    const c=d.data;
    setValue('ci-nombre',c.nombre); setValue('ci-tel',c.telefono||'');
    setValue('ci-email',c.email||''); setValue('ci-ciudad',c.ciudad||'');
    const badge=document.getElementById('ci-cliente-badge');
    if(badge){badge.textContent=`⭐ Cliente recurrente · ${c.visitas} visita(s) anteriores`;badge.classList.remove('hidden');}
  } else {
    document.getElementById('ci-cliente-badge')?.classList.add('hidden');
  }
}

function calcularResumenCi(){
  const tarifa=parseFloat(document.getElementById('ci-tarifa')?.value)||0;
  const fechaIn=document.getElementById('ci-fecha-in')?.value;
  const fechaOut=document.getElementById('ci-fecha-out')?.value;
  const resEl=document.getElementById('ci-resumen');
  if(!tarifa||!fechaIn||!fechaOut||!resEl){if(resEl)resEl.style.display='none';return;}
  const noches=Math.max(1,Math.ceil((new Date(fechaOut)-new Date(fechaIn))/(1000*60*60*24)));
  resEl.style.display='block';
  setText('ci-resumen-noches',noches);
  setText('ci-resumen-total',formatMoney(noches*tarifa));
}

async function realizarCheckin(){
  const hab=document.getElementById('ci-hab')?.value;
  const doc=document.getElementById('ci-doc')?.value.trim();
  const nombre=document.getElementById('ci-nombre')?.value.trim();
  const tarifa=parseFloat(document.getElementById('ci-tarifa')?.value);
  if(!hab){showToast('Selecciona una habitación.','error');return;}
  if(!doc||!nombre){showToast('Completa documento y nombre.','error');return;}
  if(!tarifa){showToast('Ingresa la tarifa por noche.','error');return;}
  const payload={
    habitacionNum:hab,
    tipoDoc:document.getElementById('ci-tipo-doc')?.value,
    clienteDoc:doc,clienteNombre:nombre,
    clienteTel:document.getElementById('ci-tel')?.value.trim(),
    clienteEmail:'',
    clienteCiudad:document.getElementById('ci-ciudad')?.value.trim(),
    huespedes:parseInt(document.getElementById('ci-huespedes')?.value)||1,
    fechaIn:document.getElementById('ci-fecha-in')?.value,
    fechaOutEst:document.getElementById('ci-fecha-out')?.value,
    tarifaNoche:tarifa,
    metodoPago:document.getElementById('ci-pago')?.value,
    estadoPago:document.getElementById('ci-estado-pago')?.value||'pendiente',
    montoPagado:parseFloat(document.getElementById('ci-monto-pagado')?.value)||0,
    observaciones:document.getElementById('ci-obs')?.value
  };
  const d=await api('POST','/api/hotel/checkin',payload);
  if(d?.ok){
    showToast(`✓ Check-in Hab ${hab} — ${nombre}`);
    limpiarCheckin();
    await Promise.all([loadHabitaciones(),loadCheckins()]);
    renderDashboard(); initCheckin();
  } else showToast(d?.mensaje||'Error al hacer check-in.','error');
}

function limpiarCheckin(){
  ['ci-doc','ci-nombre','ci-tel','ci-ciudad','ci-obs','ci-tarifa','ci-monto-pagado'].forEach(id=>setValue(id,''));
  setValue('ci-hab',''); setValue('ci-huespedes','1'); setValue('ci-estado-pago','pendiente');
  document.getElementById('ci-cliente-badge')?.classList.add('hidden');
  document.getElementById('ci-selected-info')?.classList.add('hidden');
  document.getElementById('ci-resumen').style.display='none';
  document.getElementById('ci-pago-monto-row').style.display='none';
  document.querySelectorAll('.ci-room-btn').forEach(b=>b.classList.remove('selected'));
}

// ── CHECK-OUT ─────────────────────────────────────────────────────────────────
function renderCheckout(){
  const grid=document.getElementById('occ-grid'); if(!grid) return;
  document.getElementById('checkout-detail').innerHTML='';
  if(!state.checkins.length){
    grid.innerHTML='<p class="empty-state">No hay habitaciones ocupadas.</p>';
    return;
  }
  const hora=HOTEL.checkoutHora||'13:00';
  const [hh,mm]=hora.split(':').map(Number);
  const ahora=new Date();
  grid.innerHTML=state.checkins.map(ci=>{
    const sal=ci.fechaOutEst?new Date(ci.fechaOutEst):null;
    if(sal) sal.setHours(hh,mm,0,0);
    const horasDesdeIngreso=(ahora-new Date(ci.fechaIn))/3600000;
    const vencido=sal&&ahora>sal&&horasDesdeIngreso>12;
    const noches=Math.max(1,Math.ceil((ahora-new Date(ci.fechaIn))/(1000*60*60*24)));
    const estadoPago=ci.estadoPago||'pendiente';
    const badgePago=estadoPago==='pagado'?'<span class="occ-badge ok">✅ Pagado</span>':estadoPago==='parcial'?'<span class="occ-badge warn">⚡ Pago parcial</span>':'<span class="occ-badge warn">💳 Paga al salir</span>';
    return `<div class="occ-card ${vencido?'vencido':''}" onclick="abrirCheckoutDetalle(${ci.id})">
      <div class="occ-num">Hab ${ci.habitacionNum}</div>
      <div class="occ-name">👤 ${ci.clienteNombre}</div>
      <div class="occ-info">Entrada: ${formatDate(ci.fechaIn)}<br>${noches} noche(s) · ${formatMoney(ci.tarifaNoche)}/n<br>Total: <strong>${formatMoney(noches*ci.tarifaNoche)}</strong></div>
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
        ${badgePago}
        ${vencido?`<span class="occ-badge warn">⏰ Vencido</span>`:sal?`<span class="occ-badge ok">Sale ${formatDate(sal)}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

function abrirCheckoutDetalle(checkinId){
  const ci=state.checkins.find(c=>c.id===checkinId); if(!ci) return;
  const hora=HOTEL.checkoutHora||'13:00';
  const [hh,mm]=hora.split(':').map(Number);
  const ahora=new Date();
  const sal=ci.fechaOutEst?new Date(ci.fechaOutEst):null;
  if(sal) sal.setHours(hh,mm,0,0);
  const noches=Math.max(1,Math.ceil((ahora-new Date(ci.fechaIn))/(1000*60*60*24)));
  const totalBase=noches*ci.tarifaNoche;
  let horasExtra=0,cargoSug=0;
  if(sal&&ahora>sal){
    horasExtra=(ahora-sal)/3600000;
    if(horasExtra>=5) cargoSug=ci.tarifaNoche;
  }
  const alertaExtra=horasExtra>0?`
    <div class="co-alerta-extra">
      ⏰ <strong>${Math.floor(horasExtra)}h ${Math.floor((horasExtra%1)*60)}min de retraso</strong> (checkout: ${hora})
      ${cargoSug>0?`<br>⚠️ Superó 5h — sugerencia: cobrar noche adicional <strong>${formatMoney(cargoSug)}</strong>`:''}
      <br>Cargo extra manual: <input type="number" id="extra-${ci.id}" value="${cargoSug}" min="0"
        style="width:120px;padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:12px;margin-top:4px"
        oninput="recalcTotal(${ci.id},${totalBase})"/>
    </div>`:''  ;
  const det=document.getElementById('checkout-detail');
  det.innerHTML=`
    <div class="checkout-detail-card">
      <h3>Hab ${ci.habitacionNum} · ${ci.clienteNombre}</h3>
      <p style="font-size:12px;color:var(--muted)">Doc: ${ci.clienteDoc} · Entrada: ${formatDate(ci.fechaIn)} · ${noches} noche(s) × ${formatMoney(ci.tarifaNoche)} = ${formatMoney(totalBase)}</p>
      ${alertaExtra}
      <div class="co-precio-row">
        <div class="co-precio-box">
          <label>Total a cobrar</label>
          <input type="number" id="pago-${ci.id}" value="${totalBase+cargoSug}"/>
        </div>
        <div>
          <button class="co-btn-confirm" onclick="doCheckout(${ci.id},'${ci.habitacionNum}')">Confirmar Check-out ↑</button>
        </div>
      </div>
    </div>`;
  det.scrollIntoView({behavior:'smooth'});
}

function recalcTotal(id,base){
  const extra=parseFloat(document.getElementById(`extra-${id}`)?.value)||0;
  const el=document.getElementById(`pago-${id}`);
  if(el) el.value=(base+extra).toFixed(0);
}

async function doCheckout(checkinId,hab){
  const total=parseFloat(document.getElementById(`pago-${checkinId}`)?.value)||0;
  const d=await api('POST',`/api/hotel/checkout/${checkinId}`,{totalPagado:total});
  if(d?.ok){
    showToast(`✓ Check-out Hab ${hab} · ${formatMoney(total)}`);
    await Promise.all([loadHabitaciones(),loadCheckins(),loadTurno()]);
    renderDashboard(); renderCheckout();
  } else showToast(d?.mensaje||'Error.','error');
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
async function loadClientes(q=''){
  const d=await api('GET',q?`/api/hotel/clientes?q=${encodeURIComponent(q)}`:'/api/hotel/clientes');
  const c=document.getElementById('clientes-table-container'); if(!c) return;
  if(!d?.ok||!d.data.length){c.innerHTML='<p class="empty-state">No hay clientes registrados.</p>';return;}
  c.innerHTML=`
    <div class="cliente-row header"><span>Documento</span><span>Nombre</span><span>Teléfono</span><span>Ciudad</span><span>Visitas</span><span></span></div>
    ${d.data.map(cl=>`<div class="cliente-row">
      <span style="font-size:11px;color:var(--muted)">${cl.tipoDoc||''} ${cl.documento}</span>
      <span style="font-weight:600">${cl.nombre}</span>
      <span style="font-size:12px">${cl.telefono||'—'}</span>
      <span style="font-size:12px">${cl.ciudad||'—'}</span>
      <span><span class="badge-visitas">${cl.visitas}</span></span>
      <span><button class="btn-sm" onclick="verHistorialCliente(${cl.id},'${cl.nombre.replace(/'/g,"\\'")}')">Historial</button></span>
    </div>`).join('')}`;
}

function buscarClientes(){loadClientes(document.getElementById('cliente-search')?.value||'');}

async function verHistorialCliente(id,nombre){
  const d=await api('GET',`/api/hotel/clientes/${id}/historial`); if(!d?.ok) return;
  const {checkins,pedidosTienda,pedidosLav}=d.data;
  const totalG=checkins.filter(c=>c.estado==='checkout').reduce((s,c)=>s+(c.totalPagado||0),0)
    +pedidosTienda.filter(p=>p.pagado).reduce((s,p)=>s+p.total,0)
    +pedidosLav.filter(p=>p.pagado).reduce((s,p)=>s+p.total,0);
  const pend=pedidosTienda.filter(p=>!p.pagado).reduce((s,p)=>s+p.total,0)
    +pedidosLav.filter(p=>!p.pagado).reduce((s,p)=>s+p.total,0);
  document.getElementById('modal-content').innerHTML=`
    <h3 style="font-size:17px;font-weight:800;margin-bottom:2px">👤 ${nombre}</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px">Total gastado: <strong style="color:#2da562">${formatMoney(totalG)}</strong>${pend>0?` · Pendiente: <strong style="color:#d64242">${formatMoney(pend)}</strong>`:''}</p>
    <div class="modal-section"><h4>🏨 Estadías (${checkins.length})</h4>
    ${checkins.length?`<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>Hab</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${checkins.map(c=>`<tr><td>Hab ${c.habitacion?.numero||'—'}</td><td>${formatDate(c.fechaIn)}</td><td>${c.fechaOutReal?formatDate(c.fechaOutReal):'Activo'}</td><td>${formatMoney(c.totalPagado||0)}</td><td><span class="room-estado-badge ${c.estado==='checkout'?'disponible':'ocupada'}">${c.estado}</span></td></tr>`).join('')}
    </tbody></table></div>`:'<p style="font-size:12px;color:var(--muted)">Sin estadías</p>'}
    </div>
    ${pedidosTienda.length?`<div class="modal-section"><h4>🛒 Tienda (${pedidosTienda.length})</h4>
    <div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>Producto</th><th>Hab</th><th>Cant</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${pedidosTienda.map(p=>`<tr><td>${p.item?.nombre||'—'}</td><td>${p.habitacion}</td><td>${p.cantidad}</td><td>${formatMoney(p.total)}</td><td><span class="order-tag ${p.pagado?'tag-ok':'tag-pend'}">${p.pagado?'Pagado':'Pendiente'}</span></td></tr>`).join('')}
    </tbody></table></div></div>`:''}
    ${pedidosLav.length?`<div class="modal-section"><h4>👕 Lavandería (${pedidosLav.length})</h4>
    <div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>Prenda</th><th>Hab</th><th>Cant</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${pedidosLav.map(p=>`<tr><td>${p.item?.nombre||'—'}</td><td>${p.habitacion}</td><td>${p.cantidad}</td><td>${formatMoney(p.total)}</td><td><span class="order-tag ${p.entregado?'tag-entregado':p.pagado?'tag-ok':'tag-pend'}">${p.entregado?'Entregado':p.pagado?'Pagado':'Pendiente'}</span></td></tr>`).join('')}
    </tbody></table></div></div>`:''}`;
  document.getElementById('modal').classList.remove('hidden');
}

// ── TIENDA ────────────────────────────────────────────────────────────────────
let tiendaItems=[],tiendaFiltro='pendiente';

async function initTienda(){
  const d=await api('GET','/api/hotel/tienda/items');
  tiendaItems=d?.data||[];
  tiendaItemSel=null;
  document.getElementById('tienda-item-sel').textContent='— Selecciona un producto —';
  const cat=document.getElementById('tienda-catalogo');
  if(!cat) return;
  cat.innerHTML=tiendaItems.map(it=>`
    <button class="store-item-btn" onclick="selTiendaItem(${it.id},'${it.nombre.replace(/'/g,"\\'")}',${it.precio},this)">
      <span class="item-name">${it.nombre}</span>
      <span class="item-price">${formatMoney(it.precio)}</span>
    </button>`).join('')||'<p style="font-size:12px;color:var(--muted)">Sin productos</p>';
  if(USUARIO.rol==='admin'||true) document.getElementById('tienda-admin-section').style.display='block';
  cargarPedidosTienda();
}

function selTiendaItem(id,nombre,precio,btn){
  tiendaItemSel={id,nombre,precio};
  document.querySelectorAll('#tienda-catalogo .store-item-btn').forEach(b=>b.style.borderColor='');
  btn.style.borderColor='var(--accent)';
  document.getElementById('tienda-item-sel').innerHTML=`<strong style="color:var(--accent)">${nombre}</strong> · ${formatMoney(precio)}`;
}

async function crearPedidoTienda(){
  if(!tiendaItemSel){showToast('Selecciona un producto.','error');return;}
  const hab=document.getElementById('tienda-hab')?.value.trim();
  if(!hab){showToast('Ingresa el número de habitación.','error');return;}
  const cant=parseInt(document.getElementById('tienda-cant')?.value)||1;
  const d=await api('POST','/api/hotel/tienda/pedidos',{itemId:tiendaItemSel.id,cantidad:cant,habitacion:hab});
  if(d?.ok){showToast(`✓ Pedido registrado: ${tiendaItemSel.nombre} × ${cant}`);cargarPedidosTienda();}
  else showToast('Error.','error');
}

async function agregarItemTienda(){
  const nombre=document.getElementById('ti-nombre')?.value.trim();
  const precio=parseFloat(document.getElementById('ti-precio')?.value);
  if(!nombre){showToast('Escribe el nombre del producto.','error');return;}
  if(!precio||precio<=0){showToast('Ingresa un precio válido.','error');return;}
  const d=await api('POST','/api/hotel/tienda/items',{nombre,precio,stock:0});
  if(d?.ok){showToast(`✓ "${nombre}" agregado al catálogo.`);setValue('ti-nombre','');setValue('ti-precio','');initTienda();}
  else showToast(d?.mensaje||'Error al agregar producto.','error');
}

function filtrarPedidosTienda(f,el){
  tiendaFiltro=f;
  document.querySelectorAll('[id^="tab-t-"]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  cargarPedidosTienda();
}

async function cargarPedidosTienda(){
  const d=await api('GET',tiendaFiltro==='pendiente'?'/api/hotel/tienda/pedidos?pendientes=1':'/api/hotel/tienda/pedidos');
  const el=document.getElementById('tienda-pedidos-list'); if(!el) return;
  const pedidos=d?.data||[];
  if(!pedidos.length){el.innerHTML='<p class="empty-state">Sin pedidos.</p>';return;}
  el.innerHTML=pedidos.map(p=>`
    <div class="order-card ${p.pagado?'pagado':'pendiente'}">
      <div class="order-card-top">
        <strong>${p.item?.nombre||'—'} <span style="font-weight:400;color:var(--muted)">× ${p.cantidad}</span></strong>
        <span class="order-tag ${p.pagado?'tag-ok':'tag-pend'}">${p.pagado?'Pagado':'Pendiente'}</span>
      </div>
      <span style="font-size:12px;color:var(--muted)">Hab ${p.habitacion} · ${formatDate(p.creadoEn)} · <strong>${formatMoney(p.total)}</strong></span>
      ${p.nota?`<p style="font-size:11px;color:var(--muted);margin-top:4px">${p.nota}</p>`:''}
      ${!p.pagado?`<button class="btn-sm" style="margin-top:8px" onclick="pagarPedidoTienda(${p.id})">Cobrar ${formatMoney(p.total)}</button>`:''}
    </div>`).join('');
}

async function pagarPedidoTienda(id){
  await api('PUT',`/api/hotel/tienda/pedidos/${id}/pagar`);
  showToast('Cobrado ✓'); await loadTurno(); cargarPedidosTienda();
}

// ── LAVANDERÍA ────────────────────────────────────────────────────────────────
let lavItems=[],lavFiltro='pendiente';

async function initLavanderia(){
  const d=await api('GET','/api/hotel/lavanderia/items');
  lavItems=d?.data||[];
  lavItemSel=null;
  document.getElementById('lav-item-sel').textContent='— Selecciona un servicio —';
  const cat=document.getElementById('lav-catalogo'); if(!cat) return;
  cat.innerHTML=lavItems.map(it=>`
    <button class="store-item-btn" onclick="selLavItem(${it.id},'${it.nombre.replace(/'/g,"\\'")}',${it.precio},this)">
      <span class="item-name">${it.nombre}</span>
      <span class="item-price">${formatMoney(it.precio)}/prenda</span>
    </button>`).join('')||'<p style="font-size:12px;color:var(--muted)">Sin servicios</p>';
  if(USUARIO.rol==='admin'||true) document.getElementById('lav-admin-section').style.display='block';
  cargarPedidosLav();
}

function selLavItem(id,nombre,precio,btn){
  lavItemSel={id,nombre,precio};
  document.querySelectorAll('#lav-catalogo .store-item-btn').forEach(b=>b.style.borderColor='');
  btn.style.borderColor='var(--accent)';
  document.getElementById('lav-item-sel').innerHTML=`<strong style="color:var(--accent)">${nombre}</strong> · ${formatMoney(precio)}`;
}

async function crearPedidoLav(){
  if(!lavItemSel){showToast('Selecciona un servicio.','error');return;}
  const hab=document.getElementById('lav-hab')?.value.trim();
  if(!hab){showToast('Ingresa el número de habitación.','error');return;}
  const cant=parseInt(document.getElementById('lav-cant')?.value)||1;
  const d=await api('POST','/api/hotel/lavanderia/pedidos',{itemId:lavItemSel.id,cantidad:cant,habitacion:hab});
  if(d?.ok){showToast(`✓ Pedido lavandería: ${lavItemSel.nombre} × ${cant}`);cargarPedidosLav();}
  else showToast('Error.','error');
}

async function agregarItemLav(){
  const nombre=document.getElementById('lav-nombre')?.value.trim();
  const precio=parseFloat(document.getElementById('lav-precio')?.value);
  if(!nombre){showToast('Escribe el nombre del servicio.','error');return;}
  if(!precio||precio<=0){showToast('Ingresa un precio válido.','error');return;}
  const d=await api('POST','/api/hotel/lavanderia/items',{nombre,precio});
  if(d?.ok){showToast(`✓ "${nombre}" agregado al catálogo.`);setValue('lav-nombre','');setValue('lav-precio','');initLavanderia();}
  else showToast(d?.mensaje||'Error al agregar servicio.','error');
}

function filtrarPedidosLav(f,el){
  lavFiltro=f;
  document.querySelectorAll('[id^="tab-l-"]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  cargarPedidosLav();
}

async function cargarPedidosLav(){
  const d=await api('GET',lavFiltro==='pendiente'?'/api/hotel/lavanderia/pedidos?pendientes=1':'/api/hotel/lavanderia/pedidos');
  const el=document.getElementById('lav-pedidos-list'); if(!el) return;
  const pedidos=d?.data||[];
  if(!pedidos.length){el.innerHTML='<p class="empty-state">Sin pedidos.</p>';return;}
  el.innerHTML=pedidos.map(p=>`
    <div class="order-card ${p.entregado?'pagado':p.pagado?'pagado':'pendiente'}">
      <div class="order-card-top">
        <strong>${p.item?.nombre||'—'} <span style="font-weight:400;color:var(--muted)">× ${p.cantidad}</span></strong>
        <span class="order-tag ${p.entregado?'tag-entregado':p.pagado?'tag-ok':'tag-pend'}">${p.entregado?'Entregado':p.pagado?'Pagado':'Pendiente'}</span>
      </div>
      <span style="font-size:12px;color:var(--muted)">Hab ${p.habitacion} · ${formatDate(p.creadoEn)} · <strong>${formatMoney(p.total)}</strong></span>
      ${p.nota?`<p style="font-size:11px;color:var(--muted);margin-top:4px">${p.nota}</p>`:''}
      <div style="display:flex;gap:6px;margin-top:8px">
        ${!p.pagado?`<button class="btn-sm" onclick="pagarPedidoLav(${p.id})">Cobrar ${formatMoney(p.total)}</button>`:''}
        ${p.pagado&&!p.entregado?`<button class="btn-sm" onclick="entregarPedidoLav(${p.id})">Marcar Entregado</button>`:''}
      </div>
    </div>`).join('');
}

async function pagarPedidoLav(id){
  await api('PUT',`/api/hotel/lavanderia/pedidos/${id}`,{pagado:true});
  showToast('Cobrado ✓'); await loadTurno(); cargarPedidosLav();
}
async function entregarPedidoLav(id){
  await api('PUT',`/api/hotel/lavanderia/pedidos/${id}`,{entregado:true});
  showToast('Entregado ✓'); cargarPedidosLav();
}

// ── TURNO ─────────────────────────────────────────────────────────────────────
function renderTurnoStatus(){
  const dot=document.getElementById('turno-dot');
  const name=document.getElementById('turno-empleado-name');
  if(state.turnoActivo){if(dot) dot.style.background='#2da562';if(name) name.textContent=state.turnoActivo.empleado;}
  else{if(dot) dot.style.background='#ccc';if(name) name.textContent='Sin turno activo';}
}

function renderTurnoView(){
  const ini=document.getElementById('turno-inicio-panel');
  const act=document.getElementById('turno-activo-panel');
  if(!ini||!act) return;
  if(state.turnoActivo){
    ini.classList.add('hidden'); act.classList.remove('hidden');
    const t=state.turnoActivo;
    setText('t-nombre-display',t.empleado);
    setText('t-hora-display',`Turno desde las ${formatTime(t.horaIn)}`);
    setText('t-base-display',formatMoney(t.baseCaja||0));
    setText('t-recaudado-display',formatMoney(t.recaudado||0));
    setText('t-gastos-display',formatMoney(t.totalGastos||0));
    // Checkins del turno
    const checkinsT=state.checkins.filter(c=>c.turnoId===t.id);
    setText('t-checkins-display',checkinsT.length);
    setText('t-total-display',formatMoney((t.baseCaja||0)+(t.recaudado||0)-(t.totalGastos||0)));
    renderGastosList(); renderMovimientos();
  } else {
    ini.classList.remove('hidden'); act.classList.add('hidden');
    const now=new Date();
    setValue('t-hora-in',`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
  }
}

async function iniciarTurno(){
  const empleado=document.getElementById('t-empleado')?.value.trim();
  const baseCaja=parseFloat(document.getElementById('t-base')?.value)||0;
  const observIn=document.getElementById('t-obs-in')?.value||'';
  if(!empleado){showToast('Ingresa el nombre del empleado.','error');return;}
  const d=await api('POST','/api/hotel/turno/iniciar',{empleado,baseCaja,observIn});
  if(d?.ok){state.turnoActivo=d.data;renderTurnoStatus();renderTurnoView();renderDashboard();showToast(`Turno iniciado · ${empleado}`);}
  else showToast(d?.mensaje||'Error.','error');
}

async function agregarGasto(){
  const descripcion=document.getElementById('gasto-desc')?.value.trim();
  const monto=parseFloat(document.getElementById('gasto-monto')?.value)||0;
  if(!descripcion||!monto){showToast('Completa descripción y monto.','error');return;}
  const d=await api('POST','/api/hotel/turno/gasto',{descripcion,monto});
  if(d?.ok){state.turnoActivo=d.data;setValue('gasto-desc','');setValue('gasto-monto','');renderTurnoView();showToast(`Gasto registrado: ${formatMoney(monto)}`);}
}

function renderGastosList(){
  const el=document.getElementById('gastos-list'); if(!el) return;
  const gastos=state.turnoActivo?.gastos||[];
  el.innerHTML=gastos.length?gastos.map(g=>`<div class="gasto-item"><span>${g.descripcion}</span><span style="color:#d64242;font-weight:600">${formatMoney(g.monto)}</span></div>`).join('')
    :'<p style="color:var(--muted);font-size:12px;padding:6px 0">Sin gastos</p>';
}

function renderMovimientos(){
  const el=document.getElementById('turno-movimientos'); if(!el) return;
  const movs=(state.turnoActivo?.movimientos||[]).slice().reverse();
  el.innerHTML=movs.length?movs.map(m=>`
    <div class="activity-item">
      <div class="activity-icon ${m.tipo}">${m.tipo==='checkin'?'↓':m.tipo==='checkout'?'↑':m.tipo==='tienda'?'🛒':m.tipo==='lavanderia'?'👕':'−'}</div>
      <div style="flex:1"><strong>${m.tipo}</strong>${m.hab?' · Hab '+m.hab:''}${m.descripcion?' · '+m.descripcion:''}${m.cliente?`<br><small style="color:var(--muted)">${m.cliente}</small>`:''}${m.monto?`<span style="float:right;font-size:11px;font-weight:700;color:#2da562">+${formatMoney(m.monto)}</span>`:''}</div>
      <div class="activity-time">${formatTime(m.hora)}</div>
    </div>`).join(''):'<p class="empty-state">Sin movimientos</p>';
}

async function cerrarTurno(){
  const rec=document.getElementById('t-recibe')?.value.trim()||'';
  const obs=document.getElementById('t-obs-out')?.value||'';
  if(!confirm('¿Cerrar el turno y generar informe?')) return;
  const d=await api('POST','/api/hotel/turno/cerrar',{recibeNombre:rec,observOut:obs});
  if(d?.ok){
    const t=d.data; const r=d.data.resumenHabs||{};
    state.turnoActivo=null; renderTurnoStatus(); renderTurnoView(); renderDashboard();
    showToast('Turno cerrado.');
    const w=window.open('','_blank');
    if(w){w.document.write(`<pre style="font-family:monospace;padding:28px;font-size:13px;max-width:560px;margin:auto;line-height:1.7">
┌─────────────────────────────────────────────┐
│            ENTREGA DE TURNO                │
│         ${HOTEL.nombre.toUpperCase().padEnd(30)}  │
└─────────────────────────────────────────────┘

Empleado   : ${t.empleado}
Inicio     : ${formatDate(t.horaIn)} a las ${formatTime(t.horaIn)}
Cierre     : ${formatDate(t.horaOut)} a las ${formatTime(t.horaOut)}
Recibe     : ${t.recibeNombre||'—'}

━━━━━ RESUMEN DE CAJA ━━━━━━━━━━━━━━━━━━━━━━
Base Caja  : ${formatMoney(t.baseCaja||0)}
Recaudado  : ${formatMoney(t.recaudado||0)}
Gastos     : ${formatMoney(t.totalGastos||0)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL CAJA : ${formatMoney((t.baseCaja||0)+(t.recaudado||0)-(t.totalGastos||0))}

━━━━━ ESTADO HABITACIONES ━━━━━━━━━━━━━━━━━
Disponibles   : ${r.disponibles||0}
Ocupadas      : ${r.ocupadas||0}
Por arreglar  : ${r.arreglar||0}
Mantenimiento : ${r.mantenimiento||0}
${r.detalle?.length?'\nDetalle:\n'+r.detalle.map(h=>`  Hab ${h.num}: ${h.estado}`).join('\n'):''}

━━━━━ GASTOS DEL TURNO ━━━━━━━━━━━━━━━━━━━
${(Array.isArray(t.gastos)?t.gastos:[]).map(g=>`  · ${g.descripcion}: ${formatMoney(g.monto)}`).join('\n')||'  Ninguno'}

Novedades: ${t.observOut||'—'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HotelOS · ${new Date().toLocaleString('es-CO')}
</pre>`);w.print();}
  }
}

// ── REPORTES ──────────────────────────────────────────────────────────────────
function switchReporte(tab,el){
  document.querySelectorAll('.reporte-tab').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('reporte-hoy-panel').classList.toggle('hidden',tab!=='hoy');
  document.getElementById('reporte-mensual-panel').classList.toggle('hidden',tab!=='mensual');
  if(tab==='hoy') cargarReporteHoy();
}

async function cargarReporteHoy(){
  const el=document.getElementById('reporte-hoy-output'); if(!el) return;
  el.innerHTML='<p style="color:var(--muted);font-size:13px">Cargando...</p>';
  const d=await api('GET','/api/hotel/turno/hoy');
  if(!d?.ok){el.innerHTML='<p class="empty-state">Error al cargar.</p>';return;}
  const r=d.data;
  el.innerHTML=`
    <div class="kpi-row">
      <div class="kpi-box verde"><span class="kpi-label">Check-ins hoy</span><div class="kpi-val">${r.checkinsHoy}</div></div>
      <div class="kpi-box rojo"><span class="kpi-label">Check-outs hoy</span><div class="kpi-val">${r.checkoutsHoy}</div></div>
      <div class="kpi-box accent"><span class="kpi-label">Recaudado hoy</span><div class="kpi-val">${formatMoney(r.recaudadoHoy)}</div></div>
      <div class="kpi-box rojo"><span class="kpi-label">Gastos hoy</span><div class="kpi-val">${formatMoney(r.gastosHoy)}</div></div>
      <div class="kpi-box verde"><span class="kpi-label">Utilidad del día</span><div class="kpi-val">${formatMoney(r.utilidadHoy)}</div></div>
      <div class="kpi-box accent"><span class="kpi-label">Turnos del día</span><div class="kpi-val">${r.turnosHoy}</div></div>
    </div>
    ${r.turnoActivo?`<div class="panel" style="margin-bottom:16px"><div class="panel-header"><h3>🟢 Turno activo: ${r.turnoActivo.empleado}</h3></div>
      <p style="padding:12px 16px;font-size:13px;color:var(--muted)">Inicio: ${formatTime(r.turnoActivo.horaIn)} · Recaudado: <strong>${formatMoney(r.turnoActivo.recaudado)}</strong></p>
    </div>`:''}
    ${r.checkins.length?`<div class="panel"><div class="panel-header"><h3>Movimientos de hoy</h3></div>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Hab</th><th>Huésped</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${r.checkins.map(c=>`<tr>
        <td>Hab ${c.habitacionNum}</td><td>${c.clienteNombre}</td>
        <td>${formatTime(c.fechaIn)}</td><td>${c.fechaOutReal?formatTime(c.fechaOutReal):'—'}</td>
        <td>${formatMoney(c.totalPagado||0)}</td>
        <td><span class="room-estado-badge ${c.estado==='checkout'?'disponible':'ocupada'}">${c.estado}</span></td>
      </tr>`).join('')}
    </tbody></table></div></div>`:'<p class="empty-state">Sin movimientos hoy.</p>'}`;
}

async function generarReporte(){
  const mes=document.getElementById('rep-mes')?.value;
  const anio=document.getElementById('rep-anio')?.value;
  const d=await api('GET',`/api/hotel/reporte?mes=${mes}&anio=${anio}`);
  const el=document.getElementById('reporte-output'); if(!el||!d?.ok) return;
  const r=d.data;
  const meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  el.innerHTML=`
    <div class="kpi-row">
      <div class="kpi-box"><span class="kpi-label">Check-ins</span><div class="kpi-val">${r.totalCheckins}</div></div>
      <div class="kpi-box"><span class="kpi-label">Check-outs</span><div class="kpi-val">${r.totalCheckouts}</div></div>
      <div class="kpi-box accent"><span class="kpi-label">Hospedaje</span><div class="kpi-val">${formatMoney(r.ingresos)}</div></div>
      <div class="kpi-box verde"><span class="kpi-label">Tienda</span><div class="kpi-val">${formatMoney(r.ingresosTienda||0)}</div></div>
      <div class="kpi-box verde"><span class="kpi-label">Lavandería</span><div class="kpi-val">${formatMoney(r.ingresosLav||0)}</div></div>
      <div class="kpi-box rojo"><span class="kpi-label">Gastos</span><div class="kpi-val">${formatMoney(r.gastosTurnos)}</div></div>
      <div class="kpi-box accent"><span class="kpi-label">Utilidad Total</span><div class="kpi-val verde" style="color:#2da562">${formatMoney(r.utilidad||0)}</div></div>
    </div>
    <div class="panel"><div class="panel-header"><h3>Detalle — ${meses[r.periodo?.mes||0]} ${r.periodo?.anio||anio}</h3></div>
    <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Hab</th><th>Huésped</th><th>Entrada</th><th>Salida</th><th>Noches</th><th>Total</th><th>Estado</th></tr></thead><tbody>
      ${(r.checkins||[]).map(c=>{
        const n=c.fechaOutReal?Math.max(1,Math.ceil((new Date(c.fechaOutReal)-new Date(c.fechaIn))/(1000*60*60*24))):'—';
        return`<tr><td>Hab ${c.habitacionNum}</td><td>${c.clienteNombre}</td><td>${formatDate(c.fechaIn)}</td><td>${c.fechaOutReal?formatDate(c.fechaOutReal):'Activo'}</td><td>${n}</td><td>${formatMoney(c.totalPagado||0)}</td><td><span class="room-estado-badge ${c.estado==='checkout'?'disponible':'ocupada'}">${c.estado}</span></td></tr>`;
      }).join('')||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">Sin movimientos</td></tr>'}
    </tbody></table></div></div>`;
}

// ── CONFIG ────────────────────────────────────────────────────────────────────
function renderConfig(){
  setValue('cfg-nombre',HOTEL.nombre||'');
  setValue('cfg-checkout-hora',HOTEL.checkoutHora||'13:00');
  const monEl=document.getElementById('cfg-moneda');
  if(monEl) monEl.value=HOTEL.moneda||'COP';
  setText('cfg-codigo',HOTEL.codigo||'—');
  if(HOTEL.logo){
    const t=document.getElementById('logo-config-thumb');
    const p=document.getElementById('logo-placeholder');
    if(t){t.src=HOTEL.logo;t.style.display='block';}
    if(p) p.style.display='none';
  }
  renderConfigRooms();
  if(USUARIO.rol==='admin') cargarRecepcionistas();
}

async function guardarConfig(){
  const nombre=document.getElementById('cfg-nombre')?.value.trim();
  const moneda=document.getElementById('cfg-moneda')?.value;
  const checkoutHora=document.getElementById('cfg-checkout-hora')?.value||'13:00';
  const d=await api('PUT','/api/hotel/config',{nombre,moneda,checkoutHora});
  if(d?.ok){HOTEL={...HOTEL,nombre,moneda,checkoutHora};sessionStorage.setItem('hotelos_hotel',JSON.stringify(HOTEL));applyHotelBrand();showToast('Configuración guardada.');}
}

function renderConfigRooms(){
  const el=document.getElementById('config-rooms-list'); if(!el) return;
  const tipos=['Estándar','Sencilla','Doble','Triple','Suite','Junior Suite','Familiar','Ejecutiva'];
  const banos=['Privado','Compartido','Sin baño'];
  // Ordenar habitaciones numéricamente por número
  const sorted=[...state.habitaciones].sort((a,b)=>{
    const na=parseInt(a.numero)||0, nb=parseInt(b.numero)||0;
    return na-nb;
  });
  el.innerHTML=sorted.map(h=>`
    <div class="config-room-item">
      <strong>Hab ${h.numero}</strong>
      <select onchange="updateRoomConfig('${h.numero}','tipo',this.value)">
        ${tipos.map(t=>`<option${(h.tipo||'Estándar')===t?' selected':''}>${t}</option>`).join('')}
      </select>
      <select onchange="updateRoomConfig('${h.numero}','bano',this.value)">
        ${banos.map(b=>`<option${(h.bano||'Privado')===b?' selected':''}>${b}</option>`).join('')}
      </select>
    </div>`).join('');
}

async function updateRoomConfig(numero,campo,valor){
  const h=state.habitaciones.find(r=>r.numero===numero); if(!h) return;
  if(campo==='tipo') h.tipo=valor;
  if(campo==='bano') h.bano=valor;
  await api('PUT',`/api/hotel/habitaciones/${numero}/config`,{tipo:h.tipo,bano:h.bano});
  showToast(`Hab ${numero} actualizada.`);
}

async function cargarRecepcionistas(){
  const d=await api('GET','/api/recepcionistas');
  const el=document.getElementById('recepcionistas-list'); if(!el) return;
  const lista=d?.data||[];
  el.innerHTML=lista.length?`<table class="data-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Estado</th><th></th></tr></thead><tbody>
    ${lista.map(r=>`<tr><td>${r.nombre}</td><td><code>${r.usuario}</code></td>
      <td><span class="room-estado-badge ${r.activo?'disponible':'arreglar'}">${r.activo?'Activo':'Inactivo'}</span></td>
      <td><button class="btn-sm" onclick="toggleRecepcionista(${r.id},${!r.activo})">${r.activo?'Desactivar':'Activar'}</button></td>
    </tr>`).join('')}</tbody></table>`:'<p class="empty-state">No hay recepcionistas.</p>';
}

async function crearRecepcionista(){
  const nombre=document.getElementById('new-rec-nombre')?.value.trim();
  const usuario=document.getElementById('new-rec-user')?.value.trim();
  const password=document.getElementById('new-rec-pass')?.value;
  if(!nombre||!usuario||!password){showToast('Completa todos los campos.','error');return;}
  const d=await api('POST','/api/recepcionistas',{nombre,usuario,password});
  if(d?.ok){showToast(`✓ "${nombre}" creado.`);setValue('new-rec-nombre','');setValue('new-rec-user','');setValue('new-rec-pass','');cargarRecepcionistas();}
  else showToast(d?.mensaje||'Error.','error');
}

async function toggleRecepcionista(id,activo){
  const d=await api('PUT',`/api/recepcionistas/${id}`,{activo});
  if(d?.ok){cargarRecepcionistas();showToast(activo?'Activado.':'Desactivado.');}
}

function cargarLogoConfig(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    const base64=e.target.result;
    const d=await api('PUT','/api/hotel/config',{logo:base64});
    if(d?.ok){HOTEL.logo=base64;sessionStorage.setItem('hotelos_hotel',JSON.stringify(HOTEL));applyHotelBrand();showToast('Logo actualizado.');
      const t=document.getElementById('logo-config-thumb');
      if(t){t.src=base64;t.style.display='block';}
      document.getElementById('logo-placeholder').style.display='none';
    }
  };
  reader.readAsDataURL(file);
}

function exportarDatos(){
  const b=new Blob([JSON.stringify({hotel:HOTEL,usuario:USUARIO,exportado:new Date()},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  a.download=`hotelos_${HOTEL.codigo}_${new Date().toISOString().split('T')[0]}.json`;a.click();
}

// Stubs compatibilidad
function cargarLogoSetup(){}
function completarSetup(){}
function resetearSistema(){if(!confirm('¿Cerrar sesión?'))return;logout();}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function closeModal(){document.getElementById('modal')?.classList.add('hidden');}
function closeModalOutside(e){if(e.target===document.getElementById('modal')) closeModal();}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg,type='success'){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg; el.className=`toast ${type}`; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),3500);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatMoney(n){return new Intl.NumberFormat('es-CO',{style:'currency',currency:HOTEL?.moneda||'COP',maximumFractionDigits:0}).format(n||0);}
function formatDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});}
function formatTime(d){if(!d)return'';return new Date(d).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});}
function estadoLabel(e){return{disponible:'Disponible',ocupada:'Ocupada',arreglar:'Por Arreglar',mantenimiento:'Mantenimiento'}[e]||e;}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function setValue(id,val){const el=document.getElementById(id);if(el)el.value=val;}
function setStyle(id,prop,val){const el=document.getElementById(id);if(el)el.style[prop]=val;}

// ── ARRANCAR ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('splash')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');
  startApp();
});
