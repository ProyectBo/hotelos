const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ ok: false, mensaje: 'No autorizado. Token requerido.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      include: { hotel: true }
    });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario inactivo o no encontrado.' });
    }
    req.usuario = usuario;
    req.hotel   = usuario.hotel;
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido.' });
  }
};

const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ ok: false, mensaje: 'Solo administradores.' });
  }
  next();
};

module.exports = { protect, soloAdmin };
