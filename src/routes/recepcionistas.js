const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const prisma  = require('../prisma');
const { protect, soloAdmin } = require('../middleware/auth');

router.use(protect);

// GET — listar recepcionistas del hotel
router.get('/', async (req, res) => {
  try {
    const lista = await prisma.usuario.findMany({
      where: { hotelId: req.hotel.id, rol: 'recepcionista' },
      select: { id: true, nombre: true, usuario: true, activo: true, ultimoAcceso: true, creadoEn: true },
      orderBy: { creadoEn: 'desc' }
    });
    res.json({ ok: true, data: lista });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener recepcionistas.' });
  }
});

// POST — crear recepcionista (solo admin)
router.post('/', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password } = req.body;
    if (!nombre || !usuario || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Nombre, usuario y contraseña requeridos.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, mensaje: 'Contraseña mínimo 6 caracteres.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const nuevo = await prisma.usuario.create({
      data: {
        hotelId:      req.hotel.id,
        nombre,
        usuario:      usuario.toLowerCase(),
        passwordHash: hash,
        rol:          'recepcionista'
      }
    });
    res.status(201).json({
      ok: true,
      mensaje: `Recepcionista "${nombre}" creado.`,
      data: { id: nuevo.id, nombre: nuevo.nombre, usuario: nuevo.usuario, rol: nuevo.rol }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ ok: false, mensaje: 'Ese usuario ya existe en este hotel.' });
    }
    res.status(500).json({ ok: false, mensaje: 'Error al crear recepcionista.' });
  }
});

// PUT — editar (solo admin)
router.put('/:id', soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, usuario, password, activo } = req.body;

    const existe = await prisma.usuario.findFirst({ where: { id, hotelId: req.hotel.id } });
    if (!existe) return res.status(404).json({ ok: false, mensaje: 'Recepcionista no encontrado.' });

    const data = {};
    if (nombre)  data.nombre  = nombre;
    if (usuario) data.usuario = usuario.toLowerCase();
    if (typeof activo === 'boolean') data.activo = activo;
    if (password) {
      if (password.length < 6) return res.status(400).json({ ok: false, mensaje: 'Contraseña mínimo 6 caracteres.' });
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    const actualizado = await prisma.usuario.update({ where: { id }, data });
    res.json({ ok: true, mensaje: 'Actualizado.', data: { id: actualizado.id, nombre: actualizado.nombre, usuario: actualizado.usuario, activo: actualizado.activo } });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar.' });
  }
});

// DELETE — desactivar (solo admin)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existe = await prisma.usuario.findFirst({ where: { id, hotelId: req.hotel.id } });
    if (!existe) return res.status(404).json({ ok: false, mensaje: 'No encontrado.' });
    await prisma.usuario.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true, mensaje: 'Recepcionista desactivado.' });
  } catch {
    res.status(500).json({ ok: false, mensaje: 'Error al desactivar.' });
  }
});

module.exports = router;
