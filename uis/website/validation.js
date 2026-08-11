/**
 * validation.js — Validación del formulario de banco de talento de Nexova
 *
 * Valida en tiempo real (input y blur), bloquea el envío si hay errores,
 * muestra un resumen de errores accesible y simula el envío cuando todo es válido.
 */

(function () {
  'use strict';

  var MAX_COMENTARIOS = 500;

  var formulario = document.getElementById('formulario-talento');
  if (!formulario) return;

  var resumenErrores = document.getElementById('resumen-errores');
  var resumenErroresLista = document.getElementById('resumen-errores-lista');
  var mensajeExito = document.getElementById('mensaje-exito');
  var comentarios = document.getElementById('comentarios');
  var contadorComentarios = document.getElementById('contador-comentarios');

  // --------------------------------------------------------------------------
  // Validadores: uno por campo. Devuelven '' si el campo es válido,
  // o el mensaje de error literal del briefing si no lo es.
  // --------------------------------------------------------------------------

  function validarNombreCompleto(valor) {
    var palabras = valor.trim().split(/\s+/).filter(Boolean);
    if (palabras.length < 2) {
      return 'El nombre debe contener al menos nombre y apellido';
    }
    return '';
  }

  function validarEmail(valor) {
    // Debe contener @ y un dominio válido (ejemplo: nombre@empresa.com)
    var patron = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;
    if (!patron.test(valor.trim())) {
      return 'Ingresa un email válido (ejemplo: nombre@empresa.com)';
    }
    return '';
  }

  function validarTelefono(valor) {
    // Debe comenzar con + seguido del código de país y al menos 8 dígitos en total
    var limpio = valor.trim();
    var digitos = limpio.replace(/[^0-9]/g, '');
    if (!/^\+[0-9][0-9\s().-]*$/.test(limpio) || digitos.length < 8) {
      return 'El teléfono debe incluir código de país (ejemplo: +34 612 345 678)';
    }
    return '';
  }

  function validarPais(valor) {
    if (valor === '') {
      return 'Selecciona tu país de residencia';
    }
    return '';
  }

  function validarAniosExperiencia(valor) {
    var texto = valor.trim();
    var numero = Number(texto);
    if (texto === '' || !/^\d+$/.test(texto) || !Number.isInteger(numero) || numero < 0 || numero > 50) {
      return 'Los años de experiencia deben estar entre 0 y 50';
    }
    return '';
  }

  function validarSector(valor) {
    if (valor === '') {
      return 'Selecciona el sector de tu interés';
    }
    return '';
  }

  function validarNivelIngles(valor) {
    if (valor === '') {
      return 'Indica tu nivel de inglés';
    }
    return '';
  }

  function validarDisponibilidad() {
    var marcado = formulario.querySelector('input[name="disponibilidad"]:checked');
    if (!marcado) {
      return 'Selecciona tu disponibilidad';
    }
    return '';
  }

  function validarLinkedin(valor) {
    // Opcional: solo se valida si el usuario lo rellena
    var texto = valor.trim();
    if (texto === '') return '';
    if (!/^https?:\/\/\S+$/.test(texto)) {
      return 'Si incluyes LinkedIn, debe ser una URL válida';
    }
    return '';
  }

  function validarComentarios(valor) {
    if (valor.length > MAX_COMENTARIOS) {
      var restantes = MAX_COMENTARIOS - valor.length;
      return 'Los comentarios no pueden exceder 500 caracteres (quedan ' + restantes + ')';
    }
    return '';
  }

  function validarPoliticaDatos() {
    var checkbox = document.getElementById('politica-datos');
    if (!checkbox.checked) {
      return 'Debes aceptar la política de tratamiento de datos para continuar';
    }
    return '';
  }

  // --------------------------------------------------------------------------
  // Configuración de los 11 campos
  // --------------------------------------------------------------------------

  var campos = [
    {
      id: 'nombre-completo',
      etiqueta: 'Nombre completo',
      validar: validarNombreCompleto
    },
    { id: 'email', etiqueta: 'Email', validar: validarEmail },
    { id: 'telefono', etiqueta: 'Teléfono', validar: validarTelefono },
    { id: 'pais', etiqueta: 'País de residencia', validar: validarPais },
    {
      id: 'anios-experiencia',
      etiqueta: 'Años de experiencia',
      validar: validarAniosExperiencia
    },
    { id: 'sector', etiqueta: 'Sector de interés', validar: validarSector },
    { id: 'nivel-ingles', etiqueta: 'Nivel de inglés', validar: validarNivelIngles },
    {
      id: 'disponibilidad',
      etiqueta: 'Disponibilidad',
      validar: validarDisponibilidad,
      grupoRadio: true,
      idFoco: 'disponibilidad-inmediata'
    },
    { id: 'linkedin', etiqueta: 'LinkedIn', validar: validarLinkedin },
    { id: 'comentarios', etiqueta: 'Comentarios adicionales', validar: validarComentarios },
    {
      id: 'politica-datos',
      etiqueta: 'Acepto política de datos',
      validar: validarPoliticaDatos,
      esCheckbox: true
    }
  ];

  // --------------------------------------------------------------------------
  // Pintado de errores
  // --------------------------------------------------------------------------

  function valorDe(campo) {
    if (campo.grupoRadio) return '';
    var elemento = document.getElementById(campo.id);
    if (campo.esCheckbox) return elemento.checked ? 'on' : '';
    return elemento.value;
  }

  /** Marca o limpia visualmente un campo y anuncia el error a lectores de pantalla. */
  function mostrarError(campo, mensaje) {
    var contenedorError = document.getElementById('error-' + campo.id);
    var elemento = document.getElementById(campo.id);

    contenedorError.textContent = mensaje;

    if (campo.grupoRadio) {
      // El fieldset agrupa los radios: es ahí donde vive el estado de error
      elemento.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
      return;
    }

    elemento.setAttribute('aria-invalid', mensaje ? 'true' : 'false');

    if (mensaje) {
      elemento.classList.add('border-red-700');
      elemento.classList.remove('border-slate-400');
    } else {
      elemento.classList.remove('border-red-700');
      elemento.classList.add('border-slate-400');
    }
  }

  /** Valida un campo y pinta el resultado. Devuelve el mensaje de error ('' si es válido). */
  function validarCampo(campo) {
    var mensaje = campo.validar(valorDe(campo));
    mostrarError(campo, mensaje);
    return mensaje;
  }

  // --------------------------------------------------------------------------
  // Resumen de errores
  // --------------------------------------------------------------------------

  function mostrarResumen(errores) {
    resumenErroresLista.innerHTML = '';

    errores.forEach(function (error) {
      var elementoLista = document.createElement('li');
      var enlace = document.createElement('a');

      enlace.href = '#' + (error.campo.idFoco || error.campo.id);
      enlace.textContent = error.campo.etiqueta + ': ' + error.mensaje;
      enlace.className =
        'underline focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2';
      enlace.addEventListener('click', function (evento) {
        evento.preventDefault();
        document.getElementById(error.campo.idFoco || error.campo.id).focus();
      });

      elementoLista.appendChild(enlace);
      resumenErroresLista.appendChild(elementoLista);
    });

    resumenErrores.classList.remove('hidden');
    resumenErrores.focus();
  }

  function ocultarResumen() {
    resumenErrores.classList.add('hidden');
    resumenErroresLista.innerHTML = '';
  }

  // --------------------------------------------------------------------------
  // Contador de comentarios
  // --------------------------------------------------------------------------

  function actualizarContador() {
    var usados = comentarios.value.length;
    var restantes = MAX_COMENTARIOS - usados;
    contadorComentarios.textContent =
      usados + ' / ' + MAX_COMENTARIOS + ' caracteres (quedan ' + restantes + ')';
  }

  // --------------------------------------------------------------------------
  // Validación en tiempo real: al escribir (input) y al perder el foco (blur)
  // --------------------------------------------------------------------------

  campos.forEach(function (campo) {
    if (campo.grupoRadio) {
      var radios = formulario.querySelectorAll('input[name="disponibilidad"]');
      Array.prototype.forEach.call(radios, function (radio) {
        radio.addEventListener('change', function () {
          validarCampo(campo);
        });
        radio.addEventListener('blur', function () {
          validarCampo(campo);
        });
      });
      return;
    }

    var elemento = document.getElementById(campo.id);
    var eventoEscritura = elemento.tagName === 'SELECT' || campo.esCheckbox ? 'change' : 'input';

    elemento.addEventListener(eventoEscritura, function () {
      validarCampo(campo);
    });
    elemento.addEventListener('blur', function () {
      validarCampo(campo);
    });
  });

  comentarios.addEventListener('input', actualizarContador);

  // --------------------------------------------------------------------------
  // Envío
  // --------------------------------------------------------------------------

  formulario.addEventListener('submit', function (evento) {
    var errores = [];

    campos.forEach(function (campo) {
      var mensaje = validarCampo(campo);
      if (mensaje) {
        errores.push({ campo: campo, mensaje: mensaje });
      }
    });

    if (errores.length > 0) {
      // Bloquea el envío y anuncia el resumen de errores
      evento.preventDefault();
      mensajeExito.classList.add('hidden');
      mostrarResumen(errores);
      return;
    }

    // No hay backend: se simula el envío y se muestra el mensaje de éxito
    evento.preventDefault();
    ocultarResumen();

    formulario.reset();
    campos.forEach(function (campo) {
      mostrarError(campo, '');
    });
    actualizarContador();

    mensajeExito.classList.remove('hidden');
    mensajeExito.focus();
  });

  // --------------------------------------------------------------------------
  // Limpiar formulario
  // --------------------------------------------------------------------------

  formulario.addEventListener('reset', function () {
    // El reset del navegador se aplica después de este evento
    window.setTimeout(function () {
      campos.forEach(function (campo) {
        mostrarError(campo, '');
      });
      ocultarResumen();
      mensajeExito.classList.add('hidden');
      actualizarContador();
    }, 0);
  });

  // Estado inicial del contador
  actualizarContador();
})();
