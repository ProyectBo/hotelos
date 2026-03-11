// Auto-setup: crea tablas que faltan en Supabase al arrancar el servidor
const prisma = require('./prisma');

async function autoSetup() {
  try {
    // Verificar/crear tabla tienda_items
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS tienda_items (
        id SERIAL PRIMARY KEY,
        "hotelId" INTEGER NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        precio FLOAT NOT NULL,
        stock INTEGER DEFAULT 0,
        activo BOOLEAN DEFAULT true
      )
    `;

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS pedidos_tienda (
        id SERIAL PRIMARY KEY,
        "hotelId" INTEGER NOT NULL,
        "itemId" INTEGER NOT NULL,
        "clienteId" INTEGER,
        habitacion VARCHAR(10) NOT NULL DEFAULT '',
        cantidad INTEGER DEFAULT 1,
        total FLOAT NOT NULL,
        pagado BOOLEAN DEFAULT false,
        nota TEXT,
        "creadoEn" TIMESTAMP DEFAULT NOW()
      )
    `;

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS lavanderia_items (
        id SERIAL PRIMARY KEY,
        "hotelId" INTEGER NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        precio FLOAT NOT NULL,
        activo BOOLEAN DEFAULT true
      )
    `;

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS pedidos_lavanderia (
        id SERIAL PRIMARY KEY,
        "hotelId" INTEGER NOT NULL,
        "itemId" INTEGER NOT NULL,
        "clienteId" INTEGER,
        habitacion VARCHAR(10) NOT NULL DEFAULT '',
        cantidad INTEGER DEFAULT 1,
        total FLOAT NOT NULL,
        pagado BOOLEAN DEFAULT false,
        entregado BOOLEAN DEFAULT false,
        nota TEXT,
        "creadoEn" TIMESTAMP DEFAULT NOW()
      )
    `;

    await prisma.$executeRaw`
      ALTER TABLE habitaciones ADD COLUMN IF NOT EXISTS observaciones JSONB DEFAULT '[]'
    `;

    await prisma.$executeRaw`
      ALTER TABLE hoteles ADD COLUMN IF NOT EXISTS "checkoutHora" VARCHAR(5) DEFAULT '13:00'
    `;

    console.log('✅ Auto-setup completado: tablas verificadas/creadas');
  } catch (err) {
    console.error('⚠️ Auto-setup error (puede ignorarse si las tablas ya existen):', err.message);
  }
}

module.exports = autoSetup;
