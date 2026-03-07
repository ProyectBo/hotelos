const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');
const { protect } = require('../middleware/auth');

// ── Helpers ───────────────────────────────────────────────────────────────────
function generarCodigo(nombre) {
  const base = nombre.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4).padEnd(4, 'X');
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return base + rand;
}
function generarToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/auth/registrar-hotel
//  Crea: Hotel + Admin + Habitaciones automáticas
// ══════════════════════════════════════════════════════════════════════════════
router.post('/registrar-hotel', async (req, res) => {
  try {
    const {
      nombre, totalHabitaciones, pisos, tarifaBase, moneda, logo,
      adminNombre, adminUsuario, adminPassword
    } = req.body;

    if (!nombre || !totalHabitaciones || !pisos || !adminNombre || !adminUsuario || !adminPassword) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios.' });
    }
    if (adminPassword.length < 6) {
      return res.status(400).json({ ok: false, mensaje: 'Contraseña mínimo 6 caracteres.' });
    }

    // Generar código único
    let codigo;
    for (let i = 0; i < 10; i++) {
      const candidato = generarCodigo(nombre);
      const existe = await prisma.hotel.findUnique({ where: { codigo: candidato } });
      if (!existe) { codigo = candidato; break; }
    }
    if (!codigo) return res.status(500).json({ ok: false, mensaje: 'No se pudo generar código.' });

    const tarifa = parseFloat(tarifaBase) || 50000;

    // Crear Hotel + Admin + Habitaciones en una transacción
    const resultado = await prisma.$transaction(async (tx) => {

      // 1. Hotel
      const hotel = await tx.hotel.create({
        data: {
          codigo,
          nombre,
          totalHabitaciones: parseInt(totalHabitaciones),
          pisos: parseInt(pisos),
          tarifaBase: tarifa,
          moneda: moneda || 'COP',
          logo: logo || null
        }
      });

      // 2. Admin
      const hash = await bcrypt.hash(adminPassword, 12);
      const admin = await tx.usuario.create({
        data: {
          hotelId:      hotel.id,
          nombre:       adminNombre,
          usuario:      adminUsuario.toLowerCase(),
          passwordHash: hash,
          rol:          'admin'
        }
      });

      // 3. Habitaciones automáticas por piso
      const habsPorPiso = Math.ceil(totalHabitaciones / pisos);
      const habitaciones = [];
      let count = 0;
      for (let p = 1; p <= pisos && count < totalHabitaciones; p++) {
        for (let h = 1; h <= habsPorPiso && count < totalHabitaciones; h++) {
          habitaciones.push({
            hotelId:     hotel.id,
            numero:      `${p}${String(h).padStart(2, '0')}`,
            piso:        p,
            tarifaNoche: tarifa
          });
          count++;
        }
      }
      await tx.habitacion.createMany({ data: habitaciones });

      return { hotel, admin };
    });

    const token = generarToken(resultado.admin.id);

    res.status(201).json({
      ok: true,
      mensaje: `Hotel "${nombre}" creado exitosamente.`,
      data: {
        hotel: {
          codigo,
          nombre,
          totalHabitaciones: parseInt(totalHabitaciones),
          pisos: parseInt(pisos),
          tarifaBase: tarifa,
          moneda: moneda || 'COP'
        },
        admin: {
          id:      resultado.admin.id,
          nombre:  resultado.admin.nombre,
          usuario: resultado.admin.usuario,
          rol:     resultado.admin.rol
        },
        token
      }
    });

  } catch (err) {
    console.error('Error registro:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ ok: false, mensaje: 'Ese usuario ya existe. Elige otro.' });
    }
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/auth/login
// ══════════════════════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { hotelCodigo, usuario, password } = req.body;

    if (!hotelCodigo || !usuario || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Código, usuario y contraseña requeridos.' });
    }

    const hotel = await prisma.hotel.findUnique({
      where: { codigo: hotelCodigo.toUpperCase() }
    });
    if (!hotel || !hotel.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Hotel no encontrado.' });
    }

    const user = await prisma.usuario.findUnique({
      where: { hotelId_usuario: { hotelId: hotel.id, usuario: usuario.toLowerCase() } }
    });
    if (!user || !user.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas.' });
    }

    // Actualizar último acceso
    await prisma.usuario.update({
      where: { id: user.id },
      data: { ultimoAcceso: new Date() }
    });

    const token = generarToken(user.id);

    res.json({
      ok: true,
      data: {
        token,
        usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
        hotel:   { codigo: hotel.codigo, nombre: hotel.nombre, totalHabitaciones: hotel.totalHabitaciones, pisos: hotel.pisos, tarifaBase: hotel.tarifaBase, moneda: hotel.moneda, logo: hotel.logo }
      }
    });

  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno.' });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  const { passwordHash, ...user } = req.usuario;
  res.json({ ok: true, data: { usuario: user, hotel: req.hotel } });
});

module.exports = router;
