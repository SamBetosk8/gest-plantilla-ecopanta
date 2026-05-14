# 📊 Ecopanta Plantillas — Sistema de Gestión de Planillas

![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase_10-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

**Plataforma web para la gestión y visualización de planillas operativas de Ecopanta.**

Permite administrar, editar y exportar planillas de datos de forma centralizada, con soporte PWA para acceso offline y sincronización en tiempo real con Firebase.

🔗 **Demo en producción:** [gest-plantilla-ecopanta.vercel.app](https://gest-plantilla-ecopanta.vercel.app)

---

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Stack Tecnológico](#️-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalación y Uso Local](#-instalación-y-uso-local)
- [Variables de Entorno](#-variables-de-entorno)
- [Reglas de Seguridad Firebase](#-reglas-de-seguridad-firebase)
- [Scripts Disponibles](#-scripts-disponibles)
- [PWA — Instalación como App](#-pwa--instalación-como-app)
- [Derechos de Autor](#️-derechos-de-autor)

---

## ✨ Características Principales

### 📋 Gestión de Planillas

| Función | Descripción |
|---|---|
| 🗂️ **Grilla de Datos Interactiva** | Visualización y edición de planillas en tiempo real con `react-data-grid` |
| 📤 **Exportación a Excel** | Descarga de planillas en formato `.xlsx` con `SheetJS` |
| 📄 **Exportación a PDF** | Generación de reportes en PDF con tablas formateadas via `jspdf-autotable` |
| 📈 **Gráficos y KPIs** | Visualización de datos con gráficos interactivos mediante `recharts` |
| 🔄 **Sincronización en Tiempo Real** | Datos siempre actualizados gracias a Firebase Firestore |

### 🔐 Acceso y Seguridad

| Función | Descripción |
|---|---|
| 🔑 **Autenticación** | Acceso controlado mediante Firebase Auth |
| 🛡️ **Roles y Permisos** | Control de acceso a datos según perfil de usuario |
| ☁️ **Almacenamiento en la Nube** | Archivos y documentos gestionados con Firebase Storage |

### 📱 Progressive Web App (PWA)

| Función | Descripción |
|---|---|
| 📲 **Instalable** | Puede instalarse como aplicación nativa en móvil y escritorio |
| ⚡ **Carga Rápida** | Assets cacheados para inicio instantáneo |
| 🔔 **Acceso Directo** | Accesible desde el escritorio o pantalla de inicio del dispositivo |

---

## 🛠️ Stack Tecnológico

| Categoría | Tecnología | Versión |
|---|---|---|
| **Frontend** | React | 18.x |
| **Lenguaje** | TypeScript | ^5.2 |
| **Build Tool** | Vite | 5.x |
| **Estilos** | Tailwind CSS | 4.x |
| **Base de datos** | Firebase Firestore | 10.x |
| **Almacenamiento** | Firebase Storage | 10.x |
| **Autenticación** | Firebase Auth | 10.x |
| **Ruteo** | react-router-dom | 6.x |
| **Grilla de datos** | react-data-grid | 7.0.0-beta |
| **Gráficos** | recharts | 2.x |
| **Exportación Excel** | xlsx (SheetJS) | 0.18 |
| **Exportación PDF** | jspdf + jspdf-autotable | 4.x / 5.x |
| **Iconos** | lucide-react | 0.344 |
| **PWA** | vite-plugin-pwa | 1.x |
| **Deploy** | Vercel | — |

---

## 📁 Estructura del Proyecto

```
gest-plantilla-ecopanta/
├── public/                  # Íconos PWA y archivos estáticos
├── src/
│   ├── components/          # Componentes reutilizables (grillas, modales, filtros)
│   ├── pages/               # Vistas principales del sistema
│   ├── hooks/               # Custom hooks de React
│   ├── services/            # Lógica de conexión con Firebase
│   ├── types/               # Tipos TypeScript compartidos
│   └── main.tsx             # Punto de entrada de la aplicación
├── index.html
├── package.json
├── vite.config.ts           # Configuración de Vite + PWA plugin
├── tsconfig.json
└── vercel.json              # Configuración de deploy en Vercel
```

---

## 🚀 Instalación y Uso Local

### 1. Clonar el repositorio

```bash
git clone https://github.com/SamBetosk8/gest-plantilla-ecopanta.git
cd gest-plantilla-ecopanta
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto (ver [sección de variables de entorno](#-variables-de-entorno)).

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

---

## 🔐 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con tus credenciales de Firebase:

```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_messaging_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
```

> ⚠️ **Importante:** Nunca subas el archivo `.env` al repositorio. Está incluido en `.gitignore` por defecto.

---

## 🔒 Reglas de Seguridad Firebase

### Firebase Firestore

Configura las reglas de Firestore para permitir acceso autenticado:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Firebase Storage

Para permitir lectura y escritura de archivos a usuarios autenticados:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> ⚠️ **Nota:** Ajusta las reglas según los roles y colecciones requeridos en tu arquitectura de seguridad.

---

## 📦 Scripts Disponibles

| Script | Comando | Descripción |
|---|---|---|
| Desarrollo | `npm run dev` | Inicia el servidor local con Vite |
| Build | `npm run build` | Genera el build de producción |
| Lint | `npm run lint` | Ejecuta ESLint sobre el código fuente |
| Preview | `npm run preview` | Previsualiza el build de producción localmente |

---

## 📲 PWA — Instalación como App

Este proyecto incluye soporte **Progressive Web App** mediante `vite-plugin-pwa`. Esto permite:

- Instalarlo como aplicación nativa en **Android**, **iOS** y **escritorio (Windows / macOS)**
- Carga rápida gracias al **service worker** y caché de assets
- Acceso directo desde la pantalla de inicio del dispositivo

Para instalar la app, visita la URL de producción desde tu navegador y acepta el prompt de instalación, o busca la opción "Agregar a pantalla de inicio" / "Instalar aplicación".

---

## ⚖️ Derechos de Autor

© 2026 **Ecopanta**. Todos los derechos reservados.

Este software — incluyendo su código fuente, diseño, interfaz de usuario y arquitectura de base de datos — es propiedad exclusiva de Ecopanta. Queda estrictamente prohibida su copia, reproducción, distribución, modificación o uso no autorizado por terceros sin el consentimiento expreso y por escrito de la empresa.

> Desarrollado como herramienta de uso interno para la gestión operativa y logística de la compañía.