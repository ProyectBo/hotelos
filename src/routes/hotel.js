const express = require('express');
const router  = express.Router();
const prisma  = require('../prisma');
const { protect, soloAdmin } = require('../middleware/auth');

router.use(protect);
const hid = (req) => req.hotel.id;

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════════════════
router.get('/config', (req, res) => res.json({ ok: true, data: req.hotel }));

router.put('/config', soloAdmin, async (req, res) => {
  try {
    const { nombre, tarifaBase, moneda, logo, checkoutHora } = req.body;
    const data = {};
    if (nombre        !== undefined) data.nombre       = nombre;
    if (tarifaBase    !== undefined) data.tarifaBase   = parseFloat(tarifaBase);
    if (moneda        !== undefined) data.moneda       = moneda;
    if (logo          !== undefined) data.logo         = logo;
    if (checkoutHora  !== undefined) data.checkoutHora = checkoutHora;
    const hotel = await prisma.hotel.update({ where: { id: hid(req) }, data });
    res.json({ ok: true, data: hotel });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error al guardar configuración.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  HABITACIONES
// ══════════════════════════════════════════════════════════════════════════════
router.get('/habitaciones', async (req, res) => {
  try {
    const habs = await prisma.habitacion.findMany({
      where: { hotelId: hid(req) }, orderBy: [{ piso: 'asc' }, { numero: 'asc' }]
    });
    res.json({ ok: true, data: habs });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.put('/habitaciones/:numero/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    await prisma.habitacion.updateMany({ where: { hotelId: hid(req), numero: req.params.numero }, data: { estado } });
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.put('/habitaciones/:numero/config', soloAdmin, async (req, res) => {
  try {
    const { tipo, bano, tarifaNoche } = req.body;
    const data = {};
    if (tipo        !== undefined) data.tipo        = tipo;
    if (bano        !== undefined) data.bano        = bano;
    if (tarifaNoche !== undefined) data.tarifaNoche = tarifaNoche ? parseFloat(tarifaNoche) : null;
    await prisma.habitacion.updateMany({ where: { hotelId: hid(req), numero: req.params.numero }, data });
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// Observaciones habitación
router.post('/habitaciones/:numero/observacion', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ ok: false, mensaje: 'Texto requerido.' });
    const hab = await prisma.habitacion.findFirst({ where: { hotelId: hid(req), numero: req.params.numero } });
    if (!hab) return res.status(404).json({ ok: false, mensaje: 'Habitación no encontrada.' });
    const obs = Array.isArray(hab.observaciones) ? hab.observaciones : [];
    obs.push({ id: Date.now(), texto: texto.trim(), hora: new Date(), usuario: req.usuario.nombre });
    await prisma.habitacion.update({ where: { id: hab.id }, data: { observaciones: obs } });
    res.json({ ok: true, data: obs });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.delete('/habitaciones/:numero/observacion/:obsId', async (req, res) => {
  try {
    const hab = await prisma.habitacion.findFirst({ where: { hotelId: hid(req), numero: req.params.numero } });
    if (!hab) return res.status(404).json({ ok: false, mensaje: 'Habitación no encontrada.' });
    const obs = (Array.isArray(hab.observaciones) ? hab.observaciones : [])
      .filter(o => String(o.id) !== String(req.params.obsId));
    await prisma.habitacion.update({ where: { id: hab.id }, data: { observaciones: obs } });
    res.json({ ok: true, data: obs });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════════════════════════════════════════
router.get('/clientes', async (req, res) => {
  try {
    const { q } = req.query;
    const where = { hotelId: hid(req) };
    if (q) where.OR = [
      { nombre:    { contains: q, mode: 'insensitive' } },
      { documento: { contains: q, mode: 'insensitive' } }
    ];
    const clientes = await prisma.cliente.findMany({ where, orderBy: { visitas: 'desc' } });
    res.json({ ok: true, data: clientes });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.get('/clientes/doc/:doc', async (req, res) => {
  try {
    const cliente = await prisma.cliente.findFirst({ where: { hotelId: hid(req), documento: req.params.doc } });
    res.json({ ok: true, data: cliente || null });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// Historial completo del cliente
router.get('/clientes/:id/historial', async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id);
    const checkins = await prisma.checkin.findMany({
      where: { hotelId: hid(req), clienteId },
      include: { habitacion: true },
      orderBy: { fechaIn: 'desc' }
    });
    const pedidosTienda = await prisma.pedidoTienda.findMany({
      where: { hotelId: hid(req), clienteId },
      include: { item: true },
      orderBy: { creadoEn: 'desc' }
    });
    const pedidosLav = await prisma.pedidoLavanderia.findMany({
      where: { hotelId: hid(req), clienteId },
      include: { item: true },
      orderBy: { creadoEn: 'desc' }
    });
    res.json({ ok: true, data: { checkins, pedidosTienda, pedidosLav } });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CHECK-IN
// ══════════════════════════════════════════════════════════════════════════════
router.post('/checkin', async (req, res) => {
  try {
    const {
      habitacionNum, clienteDoc, clienteNombre, clienteTel, clienteEmail,
      clienteCiudad, tipoDoc, huespedes, fechaIn, fechaOutEst,
      tarifaNoche, metodoPago, estadoPago, montoPagado, observaciones
    } = req.body;

    if (!habitacionNum || !clienteDoc || !clienteNombre || !tarifaNoche)
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos requeridos.' });

    const hab = await prisma.habitacion.findFirst({ where: { hotelId: hid(req), numero: habitacionNum } });
    if (!hab || hab.estado !== 'disponible')
      return res.status(400).json({ ok: false, mensaje: 'Habitación no disponible.' });

    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });

    const checkin = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.upsert({
        where:  { hotelId_documento: { hotelId: hid(req), documento: clienteDoc } },
        create: { hotelId: hid(req), documento: clienteDoc, nombre: clienteNombre, telefono: clienteTel||'', email: clienteEmail||'', ciudad: clienteCiudad||'', tipoDoc: tipoDoc||'CC', visitas: 1 },
        update: { nombre: clienteNombre, telefono: clienteTel||'', email: clienteEmail||'', ciudad: clienteCiudad||'', visitas: { increment: 1 } }
      });

      const ci = await tx.checkin.create({
        data: {
          hotelId: hid(req), habitacionId: hab.id, clienteId: cliente.id,
          huespedes: parseInt(huespedes)||1, fechaIn: new Date(fechaIn),
          fechaOutEst: fechaOutEst ? new Date(fechaOutEst) : null,
          tarifaNoche: parseFloat(tarifaNoche), metodoPago: metodoPago||'efectivo',
          observaciones: `[Pago: ${estadoPago||'pendiente'}${montoPagado?` · Recibido: ${montoPagado}`:''}] ${observaciones||''}`.trim(),
          recepcionistaIn: req.usuario.nombre,
          turnoId: turno?.id||null
        }
      });

      await tx.habitacion.update({ where: { id: hab.id }, data: { estado: 'ocupada' } });

      if (turno) {
        const movs = Array.isArray(turno.movimientos) ? turno.movimientos : [];
        movs.push({ tipo: 'checkin', hab: habitacionNum, cliente: clienteNombre, hora: new Date() });
        await tx.turno.update({ where: { id: turno.id }, data: { movimientos: movs } });
      }

      return { ...ci, clienteNombre, habitacionNum };
    });

    res.status(201).json({ ok: true, mensaje: 'Check-in realizado.', data: checkin });
  } catch (err) {
    console.error('Checkin error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al realizar check-in.' });
  }
});

router.get('/checkins/activos', async (req, res) => {
  try {
    const activos = await prisma.checkin.findMany({
      where: { hotelId: hid(req), estado: 'activo' },
      include: { cliente: true, habitacion: true }, orderBy: { fechaIn: 'desc' }
    });
    const data = activos.map(c => ({
      ...c, clienteNombre: c.cliente.nombre, clienteDoc: c.cliente.documento,
      habitacionNum: c.habitacion.numero
    }));
    res.json({ ok: true, data });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.get('/checkins/buscar', async (req, res) => {
  try {
    const { q } = req.query;
    const activos = await prisma.checkin.findMany({
      where: {
        hotelId: hid(req), estado: 'activo',
        OR: [
          { habitacion: { numero: { contains: q, mode: 'insensitive' } } },
          { cliente:    { nombre: { contains: q, mode: 'insensitive' } } }
        ]
      },
      include: { cliente: true, habitacion: true }
    });
    const data = activos.map(c => ({
      ...c, clienteNombre: c.cliente.nombre, clienteDoc: c.cliente.documento,
      habitacionNum: c.habitacion.numero
    }));
    res.json({ ok: true, data });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CHECK-OUT
// ══════════════════════════════════════════════════════════════════════════════
router.post('/checkout/:checkinId', async (req, res) => {
  try {
    const id = parseInt(req.params.checkinId);
    const { totalPagado, cargoExtra } = req.body;

    const ci = await prisma.checkin.findFirst({
      where: { id, hotelId: hid(req) }, include: { habitacion: true, cliente: true }
    });
    if (!ci || ci.estado !== 'activo')
      return res.status(400).json({ ok: false, mensaje: 'Checkin no encontrado o ya cerrado.' });

    const total = parseFloat(totalPagado) || 0;

    await prisma.$transaction(async (tx) => {
      await tx.checkin.update({
        where: { id },
        data: { estado: 'checkout', fechaOutReal: new Date(), totalPagado: total, recepcionistaOut: req.usuario.nombre }
      });
      await tx.habitacion.update({ where: { id: ci.habitacionId }, data: { estado: 'arreglar' } });
      const turno = await tx.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
      if (turno) {
        const movs = Array.isArray(turno.movimientos) ? turno.movimientos : [];
        movs.push({ tipo: 'checkout', hab: ci.habitacion.numero, cliente: ci.cliente.nombre, monto: total, hora: new Date() });
        await tx.turno.update({
          where: { id: turno.id },
          data: { recaudado: { increment: total }, movimientos: movs }
        });
      }
    });

    res.json({ ok: true, mensaje: `Check-out Hab ${ci.habitacion.numero} completado.` });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al realizar check-out.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  TURNOS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/turno/activo', async (req, res) => {
  try {
    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    res.json({ ok: true, data: turno || null });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

router.post('/turno/iniciar', async (req, res) => {
  try {
    const existe = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (existe) return res.status(400).json({ ok: false, mensaje: 'Ya hay un turno activo.' });
    const { empleado, baseCaja, observIn } = req.body;
    if (!empleado) return res.status(400).json({ ok: false, mensaje: 'Nombre del empleado requerido.' });
    const turno = await prisma.turno.create({
      data: { hotelId: hid(req), usuarioId: req.usuario.id, empleado, baseCaja: parseFloat(baseCaja)||0, observIn: observIn||'' }
    });
    res.status(201).json({ ok: true, data: turno });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error al iniciar turno.' }); }
});

router.post('/turno/gasto', async (req, res) => {
  try {
    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (!turno) return res.status(400).json({ ok: false, mensaje: 'No hay turno activo.' });
    const { descripcion, monto } = req.body;
    const gastos = Array.isArray(turno.gastos) ? turno.gastos : [];
    const movs   = Array.isArray(turno.movimientos) ? turno.movimientos : [];
    gastos.push({ descripcion, monto: parseFloat(monto), hora: new Date() });
    movs.push({ tipo: 'gasto', descripcion, monto: parseFloat(monto), hora: new Date() });
    const updated = await prisma.turno.update({
      where: { id: turno.id },
      data: { gastos, movimientos: movs, totalGastos: { increment: parseFloat(monto)||0 } }
    });
    res.json({ ok: true, data: updated });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error al agregar gasto.' }); }
});

router.post('/turno/cerrar', async (req, res) => {
  try {
    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (!turno) return res.status(400).json({ ok: false, mensaje: 'No hay turno activo.' });
    const { recibeNombre, observOut } = req.body;

    // Estado actual de habitaciones para el informe
    const habs = await prisma.habitacion.findMany({ where: { hotelId: hid(req) } });
    const resumenHabs = {
      disponibles: habs.filter(h=>h.estado==='disponible').length,
      ocupadas:    habs.filter(h=>h.estado==='ocupada').length,
      arreglar:    habs.filter(h=>h.estado==='arreglar').length,
      mantenimiento: habs.filter(h=>h.estado==='mantenimiento').length,
      detalle: habs.filter(h=>h.estado!=='disponible').map(h=>({ num:h.numero, estado:h.estado }))
    };

    const cerrado = await prisma.turno.update({
      where: { id: turno.id },
      data: { estado: 'cerrado', horaOut: new Date(), recibeNombre: recibeNombre||'', observOut: observOut||'', movimientos: { ...turno.movimientos }, resumenHabs }
    });
    res.json({ ok: true, mensaje: 'Turno cerrado.', data: { ...cerrado, resumenHabs } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al cerrar turno.' });
  }
});

// Reporte diario
router.get('/turno/hoy', async (req, res) => {
  try {
    const hoy   = new Date(); hoy.setHours(0,0,0,0);
    const fin   = new Date(); fin.setHours(23,59,59,999);
    const turnos = await prisma.turno.findMany({
      where: { hotelId: hid(req), horaIn: { gte: hoy, lte: fin } }
    });
    const checkins = await prisma.checkin.findMany({
      where: { hotelId: hid(req), creadoEn: { gte: hoy, lte: fin } },
      include: { cliente: true, habitacion: true }
    });
    const recaudado   = turnos.reduce((s,t) => s+(t.recaudado||0), 0);
    const gastos      = turnos.reduce((s,t) => s+(t.totalGastos||0), 0);
    const totalActivo = (await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } }));
    res.json({ ok: true, data: {
      turnosHoy: turnos.length,
      recaudadoHoy: recaudado,
      gastosHoy: gastos,
      utilidadHoy: recaudado - gastos,
      checkinsHoy: checkins.length,
      checkoutsHoy: checkins.filter(c=>c.estado==='checkout').length,
      turnoActivo: totalActivo,
      checkins: checkins.map(c=>({ ...c, clienteNombre: c.cliente.nombre, habitacionNum: c.habitacion.numero }))
    }});
  } catch { res.status(500).json({ ok: false, mensaje: 'Error.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  REPORTES
// ══════════════════════════════════════════════════════════════════════════════
router.get('/reporte', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    const inicio = new Date(anio, mes, 1);
    const fin    = new Date(anio, parseInt(mes)+1, 0, 23, 59, 59);
    const checkins = await prisma.checkin.findMany({
      where: { hotelId: hid(req), creadoEn: { gte: inicio, lte: fin } },
      include: { cliente: true, habitacion: true }
    });
    const checkouts    = checkins.filter(c=>c.estado==='checkout');
    const ingresos     = checkouts.reduce((s,c)=>s+(c.totalPagado||0), 0);
    const turnos       = await prisma.turno.findMany({ where: { hotelId: hid(req), estado: 'cerrado', creadoEn: { gte: inicio, lte: fin } } });
    const gastosTurnos = turnos.reduce((s,t)=>s+(t.totalGastos||0), 0);
    const pedidosTienda = await prisma.pedidoTienda.findMany({ where: { hotelId: hid(req), creadoEn: { gte: inicio, lte: fin } }, include: { item: true } });
    const pedidosLav    = await prisma.pedidoLavanderia.findMany({ where: { hotelId: hid(req), creadoEn: { gte: inicio, lte: fin } }, include: { item: true } });
    const ingresosTienda = pedidosTienda.filter(p=>p.pagado).reduce((s,p)=>s+p.total, 0);
    const ingresosLav    = pedidosLav.filter(p=>p.pagado).reduce((s,p)=>s+p.total, 0);
    res.json({ ok: true, data: {
      periodo: { mes: parseInt(mes), anio: parseInt(anio) },
      totalCheckins: checkins.length, totalCheckouts: checkouts.length,
      ingresos, gastosTurnos, ingresosTienda, ingresosLav,
      utilidad: ingresos + ingresosTienda + ingresosLav - gastosTurnos,
      checkins: checkins.map(c=>({ ...c, clienteNombre: c.cliente.nombre, clienteDoc: c.cliente.documento, habitacionNum: c.habitacion.numero }))
    }});
  } catch (err) {
    console.error('Reporte error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  TIENDA
// ══════════════════════════════════════════════════════════════════════════════
router.get('/tienda/items', async (req, res) => {
  try {
    const items = await prisma.tiendaItem.findMany({ where: { hotelId: hid(req), activo: true } });
    res.json({ ok: true, data: items });
  } catch { res.status(500).json({ ok: false }); }
});

router.post('/tienda/items', async (req, res) => {
  try {
    const { nombre, precio, stock } = req.body;
    if (!nombre || !precio) return res.status(400).json({ ok: false, mensaje: 'Nombre y precio requeridos.' });
    const item = await prisma.tiendaItem.create({ data: { hotelId: hid(req), nombre, precio: parseFloat(precio), stock: parseInt(stock)||0 } });
    res.json({ ok: true, data: item });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, mensaje: 'Error al crear item.' }); }
});

router.put('/tienda/items/:id', async (req, res) => {
  try {
    const { nombre, precio, stock, activo } = req.body;
    const data = {};
    if (nombre  !== undefined) data.nombre = nombre;
    if (precio  !== undefined) data.precio = parseFloat(precio);
    if (stock   !== undefined) data.stock  = parseInt(stock);
    if (activo  !== undefined) data.activo = activo;
    const item = await prisma.tiendaItem.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ ok: true, data: item });
  } catch { res.status(500).json({ ok: false }); }
});

router.get('/tienda/pedidos', async (req, res) => {
  try {
    const { pendientes } = req.query;
    const where = { hotelId: hid(req) };
    if (pendientes === '1') where.pagado = false;
    const pedidos = await prisma.pedidoTienda.findMany({ where, include: { item: true }, orderBy: { creadoEn: 'desc' } });
    res.json({ ok: true, data: pedidos });
  } catch { res.status(500).json({ ok: false }); }
});

router.post('/tienda/pedidos', async (req, res) => {
  try {
    const { itemId, cantidad, habitacion, clienteId, nota } = req.body;
    const item = await prisma.tiendaItem.findUnique({ where: { id: parseInt(itemId) } });
    if (!item) return res.status(404).json({ ok: false, mensaje: 'Item no encontrado.' });
    const total   = item.precio * parseInt(cantidad||1);
    const pedido  = await prisma.pedidoTienda.create({
      data: { hotelId: hid(req), itemId: item.id, cantidad: parseInt(cantidad||1), total, habitacion: habitacion||'', clienteId: clienteId||null, nota: nota||'' },
      include: { item: true }
    });
    res.json({ ok: true, data: pedido });
  } catch { res.status(500).json({ ok: false }); }
});

router.put('/tienda/pedidos/:id/pagar', async (req, res) => {
  try {
    const pedido = await prisma.pedidoTienda.update({ where: { id: parseInt(req.params.id) }, data: { pagado: true } });
    // Registrar en turno activo
    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (turno) {
      const movs = Array.isArray(turno.movimientos) ? turno.movimientos : [];
      movs.push({ tipo: 'tienda', descripcion: `Tienda Hab ${pedido.habitacion}`, monto: pedido.total, hora: new Date() });
      await prisma.turno.update({ where: { id: turno.id }, data: { recaudado: { increment: pedido.total }, movimientos: movs } });
    }
    res.json({ ok: true, data: pedido });
  } catch { res.status(500).json({ ok: false }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//  LAVANDERÍA
// ══════════════════════════════════════════════════════════════════════════════
router.get('/lavanderia/items', async (req, res) => {
  try {
    const items = await prisma.lavanderiaItem.findMany({ where: { hotelId: hid(req), activo: true } });
    res.json({ ok: true, data: items });
  } catch { res.status(500).json({ ok: false }); }
});

router.post('/lavanderia/items', async (req, res) => {
  try {
    const { nombre, precio } = req.body;
    if (!nombre || !precio) return res.status(400).json({ ok: false, mensaje: 'Nombre y precio requeridos.' });
    const item = await prisma.lavanderiaItem.create({ data: { hotelId: hid(req), nombre, precio: parseFloat(precio) } });
    res.json({ ok: true, data: item });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, mensaje: 'Error al crear item.' }); }
});

router.put('/lavanderia/items/:id', async (req, res) => {
  try {
    const { nombre, precio, activo } = req.body;
    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (precio !== undefined) data.precio = parseFloat(precio);
    if (activo !== undefined) data.activo = activo;
    const item = await prisma.lavanderiaItem.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ ok: true, data: item });
  } catch { res.status(500).json({ ok: false }); }
});

router.get('/lavanderia/pedidos', async (req, res) => {
  try {
    const { pendientes } = req.query;
    const where = { hotelId: hid(req) };
    if (pendientes === '1') where.pagado = false;
    const pedidos = await prisma.pedidoLavanderia.findMany({ where, include: { item: true }, orderBy: { creadoEn: 'desc' } });
    res.json({ ok: true, data: pedidos });
  } catch { res.status(500).json({ ok: false }); }
});

router.post('/lavanderia/pedidos', async (req, res) => {
  try {
    const { itemId, cantidad, habitacion, clienteId, nota } = req.body;
    const item = await prisma.lavanderiaItem.findUnique({ where: { id: parseInt(itemId) } });
    if (!item) return res.status(404).json({ ok: false, mensaje: 'Item no encontrado.' });
    const total  = item.precio * parseInt(cantidad||1);
    const pedido = await prisma.pedidoLavanderia.create({
      data: { hotelId: hid(req), itemId: item.id, cantidad: parseInt(cantidad||1), total, habitacion: habitacion||'', clienteId: clienteId||null, nota: nota||'' },
      include: { item: true }
    });
    res.json({ ok: true, data: pedido });
  } catch { res.status(500).json({ ok: false }); }
});

router.put('/lavanderia/pedidos/:id', async (req, res) => {
  try {
    const { pagado, entregado } = req.body;
    const data = {};
    if (pagado    !== undefined) data.pagado    = pagado;
    if (entregado !== undefined) data.entregado = entregado;
    const pedido = await prisma.pedidoLavanderia.update({ where: { id: parseInt(req.params.id) }, data });
    if (pagado) {
      const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
      if (turno) {
        const movs = Array.isArray(turno.movimientos) ? turno.movimientos : [];
        movs.push({ tipo: 'lavanderia', descripcion: `Lavandería Hab ${pedido.habitacion}`, monto: pedido.total, hora: new Date() });
        await prisma.turno.update({ where: { id: turno.id }, data: { recaudado: { increment: pedido.total }, movimientos: movs } });
      }
    }
    res.json({ ok: true, data: pedido });
  } catch { res.status(500).json({ ok: false }); }
});

module.exports = router;
