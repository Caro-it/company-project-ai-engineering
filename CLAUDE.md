# Instrucciones del proyecto — Hito 1 Nexova

Estás construyendo el sitio web público de **Nexova** para el Hito 1 del bootcamp de AI Engineering de 4Geeks Academy.

La fuente de verdad es `CONTEXT.md` en la raíz del repositorio. **Léelo antes de generar cualquier código.** Si algo de estas instrucciones contradice a `CONTEXT.md`, gana `CONTEXT.md`.

---

## Regla número uno: los textos son literales

Los textos marcados abajo se copian **carácter por carácter** desde `CONTEXT.md`.

**No parafrasees. No "mejores" la redacción. No traduzcas. No inventes copy de marketing.**

El evaluador compara los textos contra el briefing. Una reescritura, por buena que sea, cuenta como fallo de adherencia al contexto.

---

## Datos de la empresa

- Nombre: **Nexova**
- Fundada: **2011**
- Sedes: **Valencia (España)** y **Miami (Florida, EE.UU.)**
- Sector: consultoría de RRHH y adquisición de talento
- Idioma base del sitio: **español**

⚠️ **Nexova NO opera en Chile ni Argentina.** Si encuentras esa referencia en algún archivo, es un placeholder obsoleto. Ignórala.

---

## Archivos del proyecto

| Archivo | Contenido |
|---|---|
| `index.html` | Landing page |
| `application.html` | Formulario de registro de talento |
| `validation.js` | Validación del formulario |

**Los nombres de archivo van en inglés.** No uses `aplicacion.html` ni `validacion.js`.

**No crees `styles.css`.** Todo el diseño con clases utilitarias de Tailwind. Sin bloques `<style>`, sin atributos `style=` (única excepción: barras de progreso con ancho dinámico, que aquí no hay).

---

## Estructura de la landing page

Las secciones van **en este orden exacto**:

### Header
- Nombre "Nexova"
- Navegación con exactamente 4 enlaces: `Inicio | Servicios | Talento | Contacto`

### Hero

Titular, **literal**:
> Construimos equipos excepcionales para empresas en crecimiento

Subtítulo, **literal**:
> Consultora de recursos humanos y adquisición de talento con más de 10 años ayudando a empresas de tecnología, retail y servicios financieros a encontrar y desarrollar el mejor talento.

Botón CTA, texto **literal**: `Únete a nuestro banco de talento` — enlaza a `application.html`

### Servicios (3 columnas)

1. **Headhunting Ejecutivo**
   - Búsqueda y selección de perfiles ejecutivos y mandos medios
   - Proceso personalizado con garantía de reemplazo
2. **Outsourcing de Atención al Cliente**
   - Equipos especializados para empresas tecnológicas
   - Formación continua y supervisión dedicada
3. **Formación Corporativa**
   - Programas de soft skills y liderazgo
   - Cursos presenciales y en línea adaptados a cada organización

### Por qué Nexova (2 columnas)

- **12 años de experiencia** en el mercado latinoamericano
- **Presencia regional:** España y Estados Unidos
- **+500 procesos exitosos** de selección completados
- **Especialización sectorial** en tecnología, retail y finanzas

> Nota: el briefing dice "12 años" y "mercado latinoamericano" aunque la empresa se fundó en 2011 y opera en España y EE.UU. **Cópialo tal cual de todos modos.** No lo corrijas.

### Contacto
- Email: contacto@nexova.com
- Valencia: +34 960 123 456
- Miami: +1 305 555 0191

### Footer
- © 2025 Nexova. Todos los derechos reservados.
- Enlaces a LinkedIn e Instagram

---

## Schema.org

Inserta el JSON-LD de `CONTEXT.md` **sin modificar ni un carácter**, en un `<script type="application/ld+json">` dentro del `<head>` de `index.html`. Es tipo `Organization` con dos direcciones postales (ES y US).

---

## Campos del formulario (`application.html`)

Usa **exactamente** estos `id` y `name`:

| Campo | id / name | Elemento | Obligatorio |
|---|---|---|---|
| Nombre completo | `nombre-completo` | `input type="text"` | Sí |
| Email | `email` | `input type="email"` | Sí |
| Teléfono | `telefono` | `input type="tel"` | Sí |
| País de residencia | `pais` | `select` | Sí |
| Años de experiencia | `anios-experiencia` | `input type="number"` min=0 max=50 | Sí |
| Sector de interés | `sector` | `select` | Sí |
| Nivel de inglés | `nivel-ingles` | `select` | Sí |
| Disponibilidad | `disponibilidad` | 4 × `input type="radio"` | Sí |
| LinkedIn | `linkedin` | `input type="url"` | No |
| Comentarios adicionales | `comentarios` | `textarea` maxlength=500 | No |
| Acepto política de datos | `politica-datos` | `input type="checkbox"` | Sí |

IDs sin tildes ni ñ, en minúsculas, separados por guion.

### Opciones de los selects y radios — literales

- **País:** España / Estados Unidos / Otro
- **Sector:** Tecnología / Retail / Servicios Financieros / Consultoría / Otro
- **Nivel de inglés:** Básico / Intermedio / Avanzado / Nativo
- **Disponibilidad:** Inmediata / 1 mes / 2-3 meses / Solo explorando

### Agrupación en fieldsets

1. **Datos personales** — nombre, email, teléfono, país
2. **Perfil profesional** — años de experiencia, sector, nivel de inglés, LinkedIn
3. **Disponibilidad** — los 4 radios (obligatorio: es la única forma accesible de agrupar radios)
4. **Información adicional** — comentarios, checkbox de política de datos

Cada `<fieldset>` con su `<legend>`.

### Aviso obligatorio para empresas

El formulario debe incluir, visible, este texto:

> ¿Eres una empresa buscando talento? Escríbenos a contacto@nexova.com

No lo omitas. Es un requisito explícito del briefing.

### Botones

- Botón principal: enviar formulario
- Botón secundario: limpiar formulario

---

## Reglas de validación (`validation.js`)

1. **Nombre completo:** mínimo 2 palabras
2. **Email:** debe contener @ y un dominio válido
3. **Teléfono:** debe empezar por `+` seguido del código de país
4. **Años de experiencia:** entero entre 0 y 50, ni negativo ni mayor de 50
5. **País, sector, nivel de inglés:** debe haber una opción seleccionada
6. **Disponibilidad:** debe haber un radio marcado
7. **LinkedIn:** opcional, pero si se rellena debe empezar por `http://` o `https://`
8. **Comentarios:** máximo 500 caracteres, **con contador visible** que se actualice al escribir
9. **Política de datos:** el checkbox debe estar marcado

### Comportamiento

- Validación **en tiempo real**: al escribir (`input`) y al perder el foco (`blur`)
- Bloquear el envío si hay algún error (`e.preventDefault()`)
- Mostrar un **resumen de errores** al intentar enviar con fallos
- Mensajes de error anunciados a lectores de pantalla: `aria-live="polite"`, `aria-invalid` en el campo, `aria-describedby` apuntando al mensaje
- Al validar correctamente: **simular** el envío (no hay backend) y mostrar el mensaje de éxito

---

## Mensajes de error — TEXTOS LITERALES

Copia estos textos exactos. **No escribas "Campo inválido" ni variantes genéricas.**
El checklist penaliza explícitamente los mensajes genéricos.

- **Nombre completo:** `El nombre debe contener al menos nombre y apellido`
- **Email:** `Ingresa un email válido (ejemplo: nombre@empresa.com)`
- **Teléfono:** `El teléfono debe incluir código de país (ejemplo: +34 612 345 678)`
- **País:** `Selecciona tu país de residencia`
- **Años de experiencia:** `Los años de experiencia deben estar entre 0 y 50`
- **Sector:** `Selecciona el sector de tu interés`
- **Nivel de inglés:** `Indica tu nivel de inglés`
- **Disponibilidad:** `Selecciona tu disponibilidad`
- **LinkedIn:** `Si incluyes LinkedIn, debe ser una URL válida`
- **Comentarios:** `Los comentarios no pueden exceder 500 caracteres (quedan X)` — sustituye `X` por el número real de caracteres restantes
- **Política de datos:** `Debes aceptar la política de tratamiento de datos para continuar`

---

## Mensaje de éxito — LITERAL

> **¡Gracias por tu interés en Nexova!**
>
> Hemos recibido tu información. Nuestro equipo de selección la revisará y te contactaremos en caso de que tu perfil encaje con alguna de nuestras oportunidades actuales o futuras.
>
> Mientras tanto, síguenos en LinkedIn para estar al día de nuestras vacantes y contenido sobre desarrollo profesional.

---

## Requisitos técnicos

### HTML
- HTML5 semántico: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- **Nunca** un `<div>` donde exista una etiqueta semántica adecuada
- Un solo `<h1>` por página; jerarquía de encabezados sin saltos (h1 → h2 → h3)
- `<html lang="es">`
- Todas las imágenes con `alt` descriptivo (vacío `alt=""` solo si es puramente decorativa)

### Tailwind
- **Mobile-first**: las clases base son para móvil; usa `sm:` `md:` `lg:` para pantallas mayores
- Nunca `@media` escrito a mano
- Los tres breakpoints deben aparecer en el proyecto (móvil, tablet, escritorio)

### Accesibilidad (WCAG 2.1 AA)
- Todo elemento interactivo alcanzable y usable con teclado
- Estados de foco **visibles**: `focus:ring-2` o similar en enlaces, botones e inputs
- Contraste mínimo 4.5:1 en texto normal
- Cada `<input>` con su `<label for="...">` correspondiente
- Skip link al inicio del `<body>` que salte al contenido principal
- `aria-label`, `role`, `aria-describedby` donde aporten — no por decoración

### SEO
- `<title>` y `<meta name="description">` en ambas páginas
- Schema.org JSON-LD en `index.html`

---

## Antes de dar por terminado cualquier archivo, verifica

- [ ] Cero CSS personalizado (ni `<style>`, ni `styles.css`, ni `style=`)
- [ ] Todos los textos del briefing copiados literalmente, sin parafrasear
- [ ] Los 11 campos presentes con los `id` exactos de la tabla
- [ ] Los 11 mensajes de error con el texto exacto
- [ ] Presente el aviso "¿Eres una empresa buscando talento?"
- [ ] Ninguna mención a Chile ni Argentina
- [ ] Enlaces internos apuntando a `application.html` (no `aplicacion.html`)
- [ ] Todos los inputs con `<label for>` asociado
- [ ] Breakpoints `sm:` `md:` `lg:` usados
- [ ] Estados de foco visibles en todo lo interactivo