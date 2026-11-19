// Widget de chat de IA Pro. Se inserta con una línea en la web del negocio:
//   <script src="https://chat.iapro.top/widget.js" data-negocio="iapro" defer></script>
// Sin dependencias ni cookies. Todo va dentro de un Shadow DOM para que los estilos de la web no lo rompan
// (ni los del widget a la web). El texto del bot se pinta como texto, nunca como HTML: solo los enlaces
// https y los correos se convierten en enlaces.
(() => {
  const script = document.currentScript;
  if (!script || window.__chatIaPro) return;
  window.__chatIaPro = true;
  const negocio = script.dataset.negocio;
  const base = new URL(script.src).origin;
  const clave = `chat-iapro:${negocio}`;

  const guardado = (() => { try { return JSON.parse(sessionStorage.getItem(clave)) ?? {}; } catch { return {}; } })();
  const estado = { conversacion: guardado.conversacion ?? null, mensajes: guardado.mensajes ?? [], abierto: false, ocupado: false };
  const guardar = () => { try { sessionStorage.setItem(clave, JSON.stringify({ conversacion: estado.conversacion, mensajes: estado.mensajes.slice(-40) })); } catch { /* sin almacenamiento */ } };

  const el = (etiqueta, atributos = {}, hijos = []) => {
    const n = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(atributos)) {
      if (k === 'texto') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const h of [].concat(hijos)) if (h) n.append(h);
    return n;
  };

  // Texto plano → nodos; las URL https y los correos pasan a enlace.
  function conEnlaces(texto) {
    const frag = document.createDocumentFragment();
    const re = /(https:\/\/[^\s<>"')]+[^\s<>"').,;:!?])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
    let ultimo = 0;
    for (const m of texto.matchAll(re)) {
      frag.append(texto.slice(ultimo, m.index));
      const href = m[1] ? m[1] : `mailto:${m[2]}`;
      frag.append(el('a', { href, target: '_blank', rel: 'noopener', texto: m[0] }));
      ultimo = m.index + m[0].length;
    }
    frag.append(texto.slice(ultimo));
    return frag;
  }

  const ICONO_CERRAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  async function iniciar() {
    let config;
    try {
      const r = await fetch(`${base}/widget/config?negocio=${encodeURIComponent(negocio)}`);
      if (!r.ok) throw new Error(r.status);
      config = await r.json();
    } catch { return; } // si el servicio no responde, la web sigue igual y sin burbuja

    const acento = config.color;
    const host = el('div', { id: 'chat-iapro' });
    const raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box}
.w{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#F2F4F8;font-size:14px;line-height:1.45}
.lanzador{position:fixed;right:20px;bottom:20px;z-index:2147483000;height:56px;padding:0 22px 0 6px;border:0;border-radius:28px;background:${acento};color:${config.colorTexto};display:flex;align-items:center;gap:10px;font:600 15px/1 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:pointer}
.lanzador img{width:44px;height:44px;border-radius:50%;object-fit:cover;display:block}
.lanzador:focus-visible,.cerrar:focus-visible,.chip:focus-visible,.enviar:focus-visible{outline:2px solid #F2F4F8;outline-offset:2px}
.panel{position:fixed;right:20px;bottom:88px;z-index:2147483001;width:380px;height:min(600px,calc(100vh - 110px));background:#06101E;border:1px solid #22324A;border-radius:8px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.panel.abierto{display:flex}
.cab{display:flex;align-items:center;gap:12px;padding:12px 8px 12px 14px;border-bottom:1px solid #22324A}
.cab img{width:52px;height:52px;border-radius:6px;object-fit:cover;display:block;border:1px solid #22324A}
.cab .t{flex-grow:1;display:flex;flex-direction:column;gap:3px}
.etq{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;color:${acento}}
.nom{font-weight:600;font-size:15px}
.cerrar{width:44px;height:44px;border:0;background:transparent;color:#AEB8C8;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.msgs{flex-grow:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:18px}
.bot{display:flex;flex-direction:column;gap:4px;max-width:320px}
.bot .q{font-size:11px;color:#AEB8C8}
.bot .x{white-space:pre-line;overflow-wrap:anywhere}
.bot a{color:#FFB255}
.yo{align-self:flex-end;max-width:280px;background:${acento};color:${config.colorTexto};border-radius:8px;padding:10px 14px;font-weight:500;white-space:pre-line;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{min-height:36px;padding:0 14px;border:1px solid #3A4A62;background:transparent;color:#F2F4F8;border-radius:18px;font:inherit;font-size:13px;cursor:pointer}
.chip:hover{border-color:${acento}}
.esc{color:#AEB8C8;font-style:italic}
.aviso{padding:0 18px 8px;font-size:11px;line-height:1.4;color:#AEB8C8}
.pie{display:flex;gap:8px;padding:10px 12px 14px;border-top:1px solid #22324A}
.pie label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.pie input{flex-grow:1;min-width:0;height:44px;background:#0C1A2C;border:1px solid #22324A;border-radius:6px;padding:0 14px;color:#F2F4F8;font:inherit;font-size:16px}
.pie input:focus{outline:none;border-color:${acento}}
.enviar{height:44px;padding:0 16px;border:0;border-radius:6px;background:${acento};color:${config.colorTexto};font:inherit;font-weight:600;cursor:pointer}
.enviar:disabled{opacity:.6;cursor:default}
@media (max-width:480px){.panel{right:0;left:0;bottom:0;width:auto;height:100%;max-height:100%;border-radius:0}.panel.abierto+.lanzador{display:none}}
</style>`;

    const w = el('div', { class: 'w' });
    const lista = el('div', { class: 'msgs', 'aria-live': 'polite' });
    const entrada = el('input', { id: 'm', type: 'text', maxlength: String(config.maxCaracteres), autocomplete: 'off', placeholder: 'Escribe tu pregunta…' });
    const enviar = el('button', { class: 'enviar', type: 'submit', texto: 'Enviar' });
    const cerrar = el('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar el chat', onclick: () => alternar(false) });
    cerrar.innerHTML = ICONO_CERRAR;
    const panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': `Chat con el asistente de ${config.nombre}`, onkeydown: (e) => { if (e.key === 'Escape') alternar(false); } }, [
      el('div', { class: 'cab' }, [
        el('img', { src: `${base}${config.avatarBusto}`, alt: '' }),
        el('div', { class: 't' }, [el('div', { class: 'etq', texto: config.etiqueta }), el('div', { class: 'nom', texto: 'Asistente virtual (IA)' })]),
        cerrar,
      ]),
      lista,
      el('div', { class: 'aviso', texto: config.aviso }),
      el('form', { class: 'pie', onsubmit: (e) => { e.preventDefault(); mandar(entrada.value); } }, [el('label', { for: 'm', texto: 'Escribe tu mensaje' }), entrada, enviar]),
    ]);
    const lanzador = el('button', { class: 'lanzador', type: 'button', 'aria-expanded': 'false', onclick: () => alternar(!estado.abierto) }, [
      el('img', { src: `${base}${config.avatarCabeza}`, alt: '' }), config.boton,
    ]);
    w.append(panel, lanzador);
    raiz.append(w);
    document.body.append(host);

    function pintar() {
      lista.replaceChildren();
      lista.append(el('div', { class: 'bot' }, [el('div', { class: 'q', texto: 'Asistente' }), el('div', { class: 'x', texto: config.saludo })]));
      if (!estado.mensajes.some((m) => m.rol === 'yo') && config.botones.length) {
        lista.append(el('div', { class: 'chips' }, config.botones.map((b) => el('button', { class: 'chip', type: 'button', texto: b, onclick: () => mandar(b) }))));
      }
      for (const m of estado.mensajes) {
        if (m.rol === 'yo') lista.append(el('div', { class: 'yo', texto: m.texto }));
        else lista.append(el('div', { class: 'bot' }, [el('div', { class: 'q', texto: 'Asistente' }), el('div', { class: 'x' }, [conEnlaces(m.texto)])]));
      }
      if (estado.ocupado) lista.append(el('div', { class: 'bot' }, [el('div', { class: 'q', texto: 'Asistente' }), el('div', { class: 'x esc', texto: 'Escribiendo…' })]));
      lista.scrollTop = lista.scrollHeight;
      enviar.disabled = estado.ocupado;
    }

    function alternar(abrir) {
      estado.abierto = abrir;
      panel.classList.toggle('abierto', abrir);
      lanzador.setAttribute('aria-expanded', String(abrir));
      if (abrir) { pintar(); entrada.focus(); } else lanzador.focus();
    }

    async function mandar(texto) {
      texto = String(texto ?? '').trim();
      if (!texto || estado.ocupado) return;
      entrada.value = '';
      estado.mensajes.push({ rol: 'yo', texto });
      estado.ocupado = true;
      pintar();
      let respuesta;
      try {
        const r = await fetch(`${base}/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ negocio_id: negocio, conversacion_id: estado.conversacion, mensaje: texto }),
        });
        const datos = await r.json();
        if (r.status === 404 && estado.conversacion) { estado.conversacion = null; estado.ocupado = false; estado.mensajes.pop(); guardar(); return mandar(texto); }
        if (!r.ok) throw new Error(datos.error);
        estado.conversacion = datos.conversacion_id;
        respuesta = datos.respuesta;
      } catch {
        respuesta = config.textoError;
      }
      estado.mensajes.push({ rol: 'bot', texto: respuesta });
      estado.ocupado = false;
      guardar();
      pintar();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
