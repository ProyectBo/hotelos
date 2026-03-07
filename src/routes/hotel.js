const express = require('express');
const router  = express.Router();
const prisma  = require('../prisma');
const { protect, soloAdmin } = require('../middleware/auth');

router.use(protect);

const hid = (req) => req.hotel.id;

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG DEL HOTEL
// ══════════════════════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
  res.json({ ok: true, data: req.hotel });
});

router.put('/config', soloAdmin, async (req, res) => {
  try {
    const { nombre, tarifaBase, moneda, logo } = req.body;
    const data = {};
    if (nombre)     data.nombre     = nombre;
    if (tarifaBase) data.tarifaBase = parseFloat(tarifaBase);
    if (moneda)     data.moneda     = moneda;
    if (logo !== undefined) data.logo = logo;

    const hotel = await prisma.hotel.update({ where: { id: hid(req) }, data });
    res.json({ ok: true, data: hotel });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al guardar configuración.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  HABITACIONES
// ══════════════════════════════════════════════════════════════════════════════
router.get('/habitaciones', async (req, res) => {
  try {
    const habs = await prisma.habitacion.findMany({
      where: { hotelId: hid(req) },
      orderBy: [{ piso: 'asc' }, { numero: 'asc' }]
    });
    res.json({ ok: true, data: habs });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

router.put('/habitaciones/:numero/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    const hab = await prisma.habitacion.updateMany({
      where: { hotelId: hid(req), numero: req.params.numero },
      data:  { estado }
    });
    res.json({ ok: true, data: hab });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

router.put('/habitaciones/:numero/config', soloAdmin, async (req, res) => {
  try {
    const { tipo, bano, tarifaNoche } = req.body;
    const data = {};
    if (tipo) data.tipo = tipo;
    if (bano) data.bano = bano;
    if (tarifaNoche !== undefined) data.tarifaNoche = parseFloat(tarifaNoche);

    await prisma.habitacion.updateMany({
      where: { hotelId: hid(req), numero: req.params.numero },
      data
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
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
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

router.get('/clientes/doc/:doc', async (req, res) => {
  try {
    const cliente = await prisma.cliente.findFirst({
      where: { hotelId: hid(req), documento: req.params.doc }
    });
    res.json({ ok: true, data: cliente || null });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CHECK-IN
// ══════════════════════════════════════════════════════════════════════════════
router.post('/checkin', async (req, res) => {
  try {
    const {
      habitacionNum, clienteDoc, clienteNombre, clienteTel, clienteEmail,
      clienteCiudad, tipoDoc, huespedes, fechaIn, fechaOutEst,
      tarifaNoche, metodoPago, observaciones
    } = req.body;

    if (!habitacionNum || !clienteDoc || !clienteNombre || !tarifaNoche) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos requeridos.' });
    }

    // Verificar habitación disponible
    const hab = await prisma.habitacion.findFirst({
      where: { hotelId: hid(req), numero: habitacionNum }
    });
    if (!hab || hab.estado !== 'disponible') {
      return res.status(400).json({ ok: false, mensaje: 'Habitación no disponible.' });
    }

    // Turno activo
    const turno = await prisma.turno.findFirst({
      where: { hotelId: hid(req), estado: 'activo' }
    });

    const checkin = await prisma.$transaction(async (tx) => {
      // Upsert cliente
      const cliente = await tx.cliente.upsert({
        where:  { hotelId_documento: { hotelId: hid(req), documento: clienteDoc } },
        create: { hotelId: hid(req), documento: clienteDoc, nombre: clienteNombre, telefono: clienteTel || '', email: clienteEmail || '', ciudad: clienteCiudad || '', tipoDoc: tipoDoc || 'CC', visitas: 1 },
        update: { nombre: clienteNombre, telefono: clienteTel || '', email: clienteEmail || '', ciudad: clienteCiudad || '', visitas: { increment: 1 } }
      });

      // Crear checkin
      const ci = await tx.checkin.create({
        data: {
          hotelId:         hid(req),
          habitacionId:    hab.id,
          clienteId:       cliente.id,
          huespedes:       parseInt(huespedes) || 1,
          fechaIn:         new Date(fechaIn),
          fechaOutEst:     fechaOutEst ? new Date(fechaOutEst) : null,
          tarifaNoche:     parseFloat(tarifaNoche),
          metodoPago:      metodoPago || 'efectivo',
          observaciones:   observaciones || '',
          recepcionistaIn: req.usuario.nombre,
          turnoId:         turno?.id || null
        }
      });

      // Marcar ocupada
      await tx.habitacion.update({ where: { id: hab.id }, data: { estado: 'ocupada' } });

      // Movimiento en turno
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

// Checkins activos
router.get('/checkins/activos', async (req, res) => {
  try {
    const activos = await prisma.checkin.findMany({
      where:   { hotelId: hid(req), estado: 'activo' },
      include: { cliente: true, habitacion: true },
      orderBy: { fechaIn: 'desc' }
    });
    // Normalizar para el frontend
    const data = activos.map(c => ({
      ...c,
      clienteNombre: c.cliente.nombre,
      clienteDoc:    c.cliente.documento,
      habitacionNum: c.habitacion.numero
    }));
    res.json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

// Buscar para checkout
router.get('/checkins/buscar', async (req, res) => {
  try {
    const { q } = req.query;
    const activos = await prisma.checkin.findMany({
      where: {
        hotelId: hid(req),
        estado: 'activo',
        OR: [
          { habitacion: { numero: { contains: q, mode: 'insensitive' } } },
          { cliente:    { nombre: { contains: q, mode: 'insensitive' } } }
        ]
      },
      include: { cliente: true, habitacion: true }
    });
    const data = activos.map(c => ({
      ...c,
      clienteNombre: c.cliente.nombre,
      clienteDoc:    c.cliente.documento,
      habitacionNum: c.habitacion.numero
    }));
    res.json({ ok: true, data });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CHECK-OUT
// ══════════════════════════════════════════════════════════════════════════════
router.post('/checkout/:checkinId', async (req, res) => {
  try {
    const id = parseInt(req.params.checkinId);
    const { totalPagado } = req.body;

    const ci = await prisma.checkin.findFirst({
      where: { id, hotelId: hid(req) },
      include: { habitacion: true, cliente: true }
    });
    if (!ci || ci.estado !== 'activo') {
      return res.status(400).json({ ok: false, mensaje: 'Checkin no encontrado o ya cerrado.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.checkin.update({
        where: { id },
        data:  { estado: 'checkout', fechaOutReal: new Date(), totalPagado: parseFloat(totalPagado) || 0, recepcionistaOut: req.usuario.nombre }
      });
      await tx.habitacion.update({
        where: { id: ci.habitacionId },
        data:  { estado: 'arreglar' }
      });
      const turno = await tx.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
      if (turno) {
        const movs = Array.isArray(turno.movimientos) ? turno.movimientos : [];
        movs.push({ tipo: 'checkout', hab: ci.habitacion.numero, cliente: ci.cliente.nombre, monto: parseFloat(totalPagado) || 0, hora: new Date() });
        await tx.turno.update({
          where: { id: turno.id },
          data:  { recaudado: { increment: parseFloat(totalPagado) || 0 }, movimientos: movs }
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
    const turno = await prisma.turno.findFirst({
      where: { hotelId: hid(req), estado: 'activo' }
    });
    res.json({ ok: true, data: turno || null });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error.' });
  }
});

router.post('/turno/iniciar', async (req, res) => {
  try {
    const existe = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (existe) return res.status(400).json({ ok: false, mensaje: 'Ya hay un turno activo.' });

    const { empleado, baseCaja, observIn } = req.body;
    if (!empleado) return res.status(400).json({ ok: false, mensaje: 'Nombre del empleado requerido.' });

    const turno = await prisma.turno.create({
      data: {
        hotelId:   hid(req),
        usuarioId: req.usuario.id,
        empleado,
        baseCaja:  parseFloat(baseCaja) || 0,
        observIn:  observIn || ''
      }
    });
    res.status(201).json({ ok: true, data: turno });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al iniciar turno.' });
  }
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
      data:  { gastos, movimientos: movs, totalGastos: { increment: parseFloat(monto) || 0 } }
    });
    res.json({ ok: true, data: updated });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al agregar gasto.' });
  }
});

router.post('/turno/cerrar', async (req, res) => {
  try {
    const turno = await prisma.turno.findFirst({ where: { hotelId: hid(req), estado: 'activo' } });
    if (!turno) return res.status(400).json({ ok: false, mensaje: 'No hay turno activo.' });

    const { recibeNombre, observOut } = req.body;
    const cerrado = await prisma.turno.update({
      where: { id: turno.id },
      data:  { estado: 'cerrado', horaOut: new Date(), recibeNombre: recibeNombre || '', observOut: observOut || '' }
    });
    res.json({ ok: true, mensaje: 'Turno cerrado.', data: cerrado });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al cerrar turno.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  REPORTES
// ══════════════════════════════════════════════════════════════════════════════
router.get('/reporte', async (req, res) => {
  try {
    const { mes, anio } = req.query;
    const inicio = new Date(anio, mes, 1);
    const fin    = new Date(anio, parseInt(mes) + 1, 0, 23, 59, 59);

    const checkins = await prisma.checkin.findMany({
      where: { hotelId: hid(req), creadoEn: { gte: inicio, lte: fin } },
      include: { cliente: true, habitacion: true }
    });

    const checkouts    = checkins.filter(c => c.estado === 'checkout');
    const ingresos     = checkouts.reduce((s, c) => s + (c.totalPagado || 0), 0);

    const turnos       = await prisma.turno.findMany({
      where: { hotelId: hid(req), estado: 'cerrado', creadoEn: { gte: inicio, lte: fin } }
    });
    const gastosTurnos = turnos.reduce((s, t) => s + (t.totalGastos || 0), 0);

    const data = checkins.map(c => ({
      ...c,
      clienteNombre: c.cliente.nombre,
      clienteDoc:    c.cliente.documento,
      habitacionNum: c.habitacion.numero
    }));

    res.json({
      ok: true, data: {
        periodo: { mes: parseInt(mes), anio: parseInt(anio) },
        totalCheckins:  checkins.length,
        totalCheckouts: checkouts.length,
        ingresos, gastosTurnos,
        utilidad: ingresos - gastosTurnos,
        turnos:   turnos.length,
        checkins: data
      }
    });
  } catch (err) {
    console.error('Reporte error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte.' });
  }
});

module.exports = router;
