# 🏨 HotelOS v2 — Supabase + Prisma + Express

---

## 📁 Estructura de carpetas

```
hotelos-supabase/
├── prisma/
│   └── schema.prisma          ← Tablas de la base de datos
├── src/
│   ├── server.js              ← Punto de entrada del servidor
│   ├── prisma.js              ← Cliente de base de datos
│   ├── middleware/
│   │   └── auth.js            ← Verificación de tokens JWT
│   └── routes/
│       ├── auth.js            ← Registro de hotel + Login
│       ├── recepcionistas.js  ← Gestión de recepcionistas
│       └── hotel.js           ← Operaciones (checkin, checkout, turnos...)
├── public/
│   ├── index.html             ← Pantalla de Login / Registro
│   ├── app.html               ← Sistema principal del hotel
│   └── app.js                 ← Lógica del frontend
├── package.json
├── Procfile                   ← Para Railway/Render
└── .env.example               ← Copia esto como .env
```

---

## ⚡ PASO A PASO COMPLETO

### PASO 1 — Crear cuenta en Supabase (gratis)

1. Ve a 👉 https://supabase.com
2. Clic en **"Start your project"** → crea cuenta con Google o GitHub
3. Clic en **"New project"**
4. Ponle un nombre (ej: `hotelos`)
5. Crea una contraseña para la base de datos (¡guárdala!)
6. Selecciona la región más cercana (ej: South America)
7. Clic en **"Create new project"** → espera 2 minutos

### PASO 2 — Obtener las URLs de conexión

1. En tu proyecto de Supabase ve a: **Settings → Database**
2. Baja hasta **"Connection string"**
3. Selecciona la pestaña **"URI"** → copia ese string → es tu `DATABASE_URL`
4. Selecciona la pestaña **"Direct connection"** → copia ese → es tu `DIRECT_URL`
5. En ambos strings reemplaza `[YOUR-PASSWORD]` con la contraseña que creaste

### PASO 3 — Instalar dependencias localmente

```bash
cd hotelos-supabase
npm install
```

### PASO 4 — Crear el archivo .env

Copia el archivo `.env.example` y renómbralo a `.env`:
```bash
cp .env.example .env
```
Luego ábrelo y pega tus URLs de Supabase.

### PASO 5 — Crear las tablas en Supabase

```bash
npm run db:push
```
Esto crea automáticamente todas las tablas en tu base de datos. ✅

### PASO 6 — Subir a GitHub

```bash
git init
git add .
git commit -m "HotelOS v2 inicial"
```
Ve a https://github.com → New repository → crea uno → luego:
```bash
git remote add origin https://github.com/TU_USUARIO/hotelos.git
git push -u origin main
```

### PASO 7 — Desplegar en Railway

1. Ve a 👉 https://railway.app → crea cuenta
2. **"New Project"** → **"Deploy from GitHub Repo"**
3. Selecciona tu repositorio `hotelos`
4. Railway detecta el `Procfile` automáticamente
5. Ve a **"Variables"** y agrega estas 3:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Tu URL de Supabase (con pgbouncer=true) |
| `DIRECT_URL` | Tu URL directa de Supabase |
| `JWT_SECRET` | Una frase larga: `hotelos_mi_clave_2024_abc123` |

6. **IMPORTANTE:** También agrega en Railway:
```
npm run db:generate
```
Como **Build Command** en Settings del servicio.

7. Railway te da una URL pública tipo: `https://hotelos.up.railway.app` 🎉

---

## 🔑 Cómo usar el sistema

### Primera vez — Registrar tu hotel
1. Abre la URL de tu app
2. Clic en **"Registrar Hotel"**
3. Llena los datos y crea tu cuenta administrador
4. El sistema genera un **código único** (ej: `HOTE123`)
5. **⚠️ Guarda ese código** — es obligatorio para iniciar sesión

### Iniciar sesión
- Código del Hotel: el que se generó
- Usuario: el que creaste
- Contraseña: la que configuraste

### Agregar recepcionistas
1. Inicia sesión como **admin**
2. Ve a **Configuración**
3. Sección **Recepcionistas** → agrega los que necesites
4. Ellos inician sesión con el mismo código del hotel

---

## 🌐 API disponible

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/registrar-hotel` | Registra hotel + admin |
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/me` | Mis datos |
| GET | `/api/recepcionistas` | Listar recepcionistas |
| POST | `/api/recepcionistas` | Crear recepcionista |
| PUT | `/api/recepcionistas/:id` | Editar |
| DELETE | `/api/recepcionistas/:id` | Desactivar |
| GET | `/api/hotel/habitaciones` | Listar habitaciones |
| PUT | `/api/hotel/habitaciones/:num/estado` | Cambiar estado |
| POST | `/api/hotel/checkin` | Realizar check-in |
| GET | `/api/hotel/checkins/activos` | Huéspedes activos |
| GET | `/api/hotel/checkins/buscar?q=` | Buscar para checkout |
| POST | `/api/hotel/checkout/:id` | Realizar check-out |
| GET | `/api/hotel/turno/activo` | Turno actual |
| POST | `/api/hotel/turno/iniciar` | Iniciar turno |
| POST | `/api/hotel/turno/gasto` | Agregar gasto |
| POST | `/api/hotel/turno/cerrar` | Cerrar turno |
| GET | `/api/hotel/reporte?mes=&anio=` | Reporte mensual |
| GET | `/api/hotel/config` | Config del hotel |
| PUT | `/api/hotel/config` | Guardar config |
