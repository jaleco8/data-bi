import type { Rng } from './rng.js';

/** Bancos de frases para reseñas, tickets, NPS y Google reviews. */

type Bank = { pos: string[]; neg: string[] };

const OPENERS: Record<number, string[]> = {
  5: ['Excelente compra.', 'Muy contento con este producto.', 'Superó mis expectativas.', 'Lo recomiendo totalmente.', 'Cinco estrellas sin dudar.', 'Justo lo que buscaba.', 'Me encantó.'],
  4: ['Muy buen producto en general.', 'Buena compra, con un detalle menor.', 'Cumple lo que promete.', 'Bastante bien por el precio.', 'Satisfecho con la compra.'],
  3: ['Está bien, nada especial.', 'Producto correcto pero mejorable.', 'Tiene cosas buenas y malas.', 'Cumple a medias.', 'Ni bueno ni malo.'],
  2: ['No quedé conforme.', 'Esperaba bastante más.', 'Regular tirando a malo.', 'No lo volvería a comprar.', 'Me arrepiento un poco de la compra.'],
  1: ['Muy mala experiencia.', 'Pésima compra.', 'No lo recomiendo para nada.', 'Decepcionante.', 'Una estafa, no lo compren.'],
};

const TITLES: Record<number, string[]> = {
  5: ['Excelente', 'Me encantó', 'Muy recomendable', 'Perfecto', '100% recomendado', 'Gran calidad'],
  4: ['Muy bueno', 'Buena compra', 'Cumple', 'Recomendado'],
  3: ['Regular', 'Aceptable', 'Podría ser mejor', 'Normal'],
  2: ['No me convenció', 'Decepcionado', 'Mala calidad', 'No lo recomiendo'],
  1: ['Pésimo', 'No lo compren', 'Muy malo', 'Terrible experiencia'],
};

const ASPECTS: Record<string, Record<string, Bank>> = {
  moda: {
    talla: {
      pos: ['La talla es exacta, tal como indica la guía.', 'Me quedó perfecto de talla.', 'La horma es cómoda y la talla corresponde.'],
      neg: ['La talla viene muy pequeña, tuve que pedir una más grande.', 'Talla más grande de lo normal, me queda holgado.', 'La guía de tallas no coincide con la prenda real.'],
    },
    tela: {
      pos: ['La tela es suave y de buena calidad.', 'El material se siente resistente.', 'La tela es fresca, ideal para el calor.'],
      neg: ['La tela es delgada y se transparenta.', 'Después de dos lavados se encogió y perdió forma.', 'Le salieron pelotitas a la semana de uso.'],
    },
    color: {
      pos: ['El color es igual al de las fotos.', 'Los colores son vivos y no se destiñen.'],
      neg: ['El color no se parece al de la foto, es más opaco.', 'Se destiñó en el primer lavado.'],
    },
    costuras: {
      pos: ['Las costuras están bien terminadas.', 'Se nota buena confección.'],
      neg: ['Llegó con una costura descosida.', 'Los hilos sueltos dan mala impresión.'],
    },
  },
  calzado: {
    talla: {
      pos: ['La horma es exacta, pedí mi talla de siempre.', 'Calzan perfecto.'],
      neg: ['Vienen media talla más pequeñas.', 'La horma es muy angosta, me aprietan.'],
    },
    comodidad: {
      pos: ['Son muy cómodas, las uso todo el día.', 'La amortiguación es excelente para correr.'],
      neg: ['Me sacaron ampollas los primeros días.', 'La plantilla es muy dura.'],
    },
    durabilidad: {
      pos: ['Después de meses de uso siguen como nuevas.', 'La suela es muy resistente.'],
      neg: ['La suela se despegó al mes.', 'Se rompieron en la zona del dedo muy rápido.'],
    },
  },
  electronica: {
    bateria: {
      pos: ['La batería dura muchísimo, más de lo anunciado.', 'Carga rápido y aguanta todo el día.'],
      neg: ['La batería dura la mitad de lo que dicen.', 'Se descarga muy rápido incluso sin usarlo.'],
    },
    calidad: {
      pos: ['El sonido es nítido y con buenos graves.', 'La pantalla se ve increíble.', 'La cancelación de ruido funciona muy bien.'],
      neg: ['El sonido se distorsiona a volumen alto.', 'La pantalla tiene un pixel muerto.', 'La cancelación de ruido casi no se nota.'],
    },
    conectividad: {
      pos: ['Se conecta al instante con el celular.', 'El Bluetooth es estable, no se corta.'],
      neg: ['Se desconecta constantemente del Bluetooth.', 'Cuesta mucho emparejarlo con el teléfono.'],
    },
  },
  hogar: {
    potencia: {
      pos: ['Tiene muy buena potencia.', 'Funciona perfecto, rápido y eficiente.'],
      neg: ['Le falta potencia para lo que promete.', 'Se calienta demasiado al usarlo.'],
    },
    materiales: {
      pos: ['Los materiales son de primera.', 'Se siente sólido y bien construido.'],
      neg: ['El plástico se ve frágil.', 'Los materiales son de baja calidad para el precio.'],
    },
    uso: {
      pos: ['Muy fácil de limpiar.', 'Se arma en minutos.', 'No hace casi ruido.'],
      neg: ['Es muy ruidoso.', 'Difícil de limpiar, se acumula suciedad.', 'Las instrucciones de armado son confusas.'],
    },
  },
  belleza: {
    resultado: {
      pos: ['Noté resultados en pocos días.', 'Deja la piel suave e hidratada.', 'Rinde muchísimo.'],
      neg: ['No noté ningún cambio.', 'Me irritó la piel.', 'Dura muy poco el efecto.'],
    },
    aroma: {
      pos: ['El aroma es delicioso y dura todo el día.', 'Huele muy rico, nada invasivo.'],
      neg: ['El olor es demasiado fuerte.', 'El aroma desaparece en una hora.'],
    },
    textura: {
      pos: ['La textura es ligera y se absorbe rápido.', 'No deja sensación grasosa.'],
      neg: ['Es muy grasoso.', 'La textura es pegajosa.'],
    },
  },
  deportes: {
    comodidad: { pos: ['Muy cómodo para entrenar.', 'Se adapta bien al cuerpo.'], neg: ['Incómodo después de un rato.', 'Se mueve mucho al usarlo.'] },
    resistencia: { pos: ['Muy resistente, aguanta uso intenso.', 'Buena calidad de materiales.'], neg: ['Se rompió en la segunda semana.', 'El material se desgasta rápido.'] },
    tamano: { pos: ['El tamaño es justo el indicado.'], neg: ['Es más pequeño de lo que parece en las fotos.'] },
  },
  juguetes: {
    diversion: { pos: ['A mis hijos les encantó.', 'Muy entretenido para toda la familia.'], neg: ['Se aburrieron a los dos días.', 'Las reglas son muy confusas.'] },
    piezas: { pos: ['Todas las piezas vienen completas.', 'Las piezas son de buena calidad.'], neg: ['Faltaban piezas en la caja.', 'Las piezas se rompen con facilidad.'] },
  },
  mascotas: {
    aceptacion: { pos: ['A mi perro le encantó.', 'Mi gato lo come feliz.', 'Mi mascota lo usa todos los días.'], neg: ['Mi perro no lo quiso comer.', 'A mi gato le cayó mal.'] },
    calidad: { pos: ['Buena calidad, se nota resistente.'], neg: ['Lo destruyó en una tarde.', 'La bolsa venía rota.'] },
  },
  super: {
    sabor: { pos: ['El sabor es excelente.', 'Muy rico y fresco.'], neg: ['El sabor es muy artificial.', 'No sabe como esperaba.'] },
    vencimiento: { pos: ['Llegó con fecha de vencimiento lejana.'], neg: ['Llegó próximo a vencer.', 'Venía vencido, inaceptable.'] },
    empaque: { pos: ['Bien empacado.'], neg: ['El empaque llegó roto y derramado.'] },
  },
};

const GENERAL: Record<string, Bank> = {
  envio: {
    pos: ['Llegó antes de lo esperado.', 'El envío fue rápido y bien empacado.', 'Entrega puntual, sin problemas.'],
    neg: ['El envío tardó más de lo prometido.', 'El seguimiento no se actualizaba.'],
  },
  precio: {
    pos: ['Excelente relación calidad-precio.', 'A muy buen precio en oferta.'],
    neg: ['Está caro para lo que ofrece.', 'Por ese precio esperaba más calidad.'],
  },
  empaque: { pos: ['Vino muy bien protegido.'], neg: ['La caja llegó golpeada.', 'El empaque estaba abierto.'] },
};

const LATE = [
  'El pedido llegó con {n} días de retraso.',
  'Me prometieron entrega para el {promised} y llegó mucho después.',
  'El envío tardó muchísimo, el seguimiento de {carrier} no se actualizaba.',
  'Tuve que escribir varias veces a soporte porque el paquete no llegaba.',
  'La entrega con {carrier} fue un desastre, casi una semana de atraso.',
];

const DEFECT_STORY = [
  'El vaso se agrietó a las dos semanas de uso.',
  'Empezó a gotear por la base del vaso.',
  'El motor huele a quemado después de unos minutos.',
  'La tapa no sella bien y se derrama todo al licuar.',
  'Dejó de funcionar al mes, tuve que pedir la devolución.',
  'Se escucha un ruido metálico y luego se detiene el motor.',
  'La base del vaso se fisuró y pierde líquido.',
];

const DEFECT_GENERIC = ['Llegó con una falla de fábrica.', 'Dejó de funcionar a los pocos días.', 'Vino con un defecto visible.'];

const CLOSERS_POS = ['Volvería a comprar.', 'Lo compraría de nuevo.', 'Muy recomendado.', 'Gracias Mercadia.', ''];
const CLOSERS_NEG = ['Ojalá mejoren.', 'Pedí la devolución.', 'No vuelvo a comprar esta marca.', 'Espero que me den una solución.', ''];

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export interface ReviewCtx {
  l1Key: string;
  l2Name: string;
  productName: string;
  rating: number;
  lateDays: number;
  carrier: string;
  promised: string;
  storyDefect: boolean;
  genericDefect: boolean;
}

export function reviewText(rng: Rng, c: ReviewCtx): { title: string; body: string } {
  const parts: string[] = [];
  const r = c.rating;
  parts.push(rng.pick(OPENERS[r]));
  if (rng.chance(0.25)) parts.push(`Lo compré para ${rng.pick(['uso diario', 'regalar', 'mi casa', 'el trabajo', 'mi pareja', 'mis hijos', 'reemplazar uno viejo'])}.`);

  if (c.storyDefect) parts.push(rng.pick(DEFECT_STORY));
  else if (c.genericDefect) parts.push(rng.pick(DEFECT_GENERIC));

  const aspects = ASPECTS[c.l1Key] ?? {};
  const keys = rng.shuffle(Object.keys(aspects));
  const nAspects = rng.int(1, Math.min(3, keys.length));
  for (let i = 0; i < nAspects; i++) {
    const bank = aspects[keys[i]];
    const positive = r >= 4 ? rng.chance(0.9) : r === 3 ? rng.chance(0.5) : rng.chance(0.12);
    parts.push(rng.pick(positive ? bank.pos : bank.neg));
  }
  if (c.lateDays >= 2 && (r <= 3 || rng.chance(0.3))) {
    parts.push(fill(rng.pick(LATE), { n: c.lateDays, carrier: c.carrier, promised: c.promised }));
  } else if (rng.chance(0.3)) {
    const g = rng.pick(Object.values(GENERAL));
    parts.push(rng.pick(r >= 4 ? g.pos : r === 3 && rng.chance(0.5) ? g.pos : g.neg));
  }
  const closer = rng.pick(r >= 4 ? CLOSERS_POS : CLOSERS_NEG);
  if (closer) parts.push(closer);

  let title = rng.pick(TITLES[r]);
  if (c.storyDefect && rng.chance(0.6)) title = rng.pick(['Se rompió rápido', 'Defecto en el vaso', 'Gotea', 'Dejó de funcionar']);
  else if (c.lateDays >= 3 && r <= 2 && rng.chance(0.5)) title = rng.pick(['Llegó tarde', 'Envío muy lento', 'Retraso en la entrega']);
  return { title, body: parts.join(' ') };
}

/* ------------------------------------------------------------------ Tickets */

export interface TicketCtx {
  category: string;
  orderNumber: string;
  productName: string;
  carrier: string;
  promised: string;
  daysWaiting: number;
  reason?: string;
  storyDefect: boolean;
}

const TICKET_TEMPLATES: Record<string, { subjects: string[]; bodies: string[] }> = {
  retraso_entrega: {
    subjects: ['Mi pedido no ha llegado', 'Pedido {order} retrasado', '¿Dónde está mi pedido?', 'Entrega atrasada'],
    bodies: [
      'Hola, hice el pedido {order} hace {d} días y aún no llega. El seguimiento de {carrier} no muestra avances desde hace días.',
      'La fecha prometida de entrega era el {promised} y todavía no recibo nada. Necesito el producto con urgencia, ¿me pueden dar una solución?',
      'El tracking dice "en tránsito" hace una semana. Llamé a {carrier} y no me dan información. Pedido {order}.',
      'Es la segunda vez que me pasa con {carrier}. El pedido {order} sigue sin llegar y nadie me responde.',
    ],
  },
  devolucion: {
    subjects: ['Quiero devolver un producto', 'Solicitud de devolución pedido {order}', 'Devolución'],
    bodies: [
      'Buenas, quiero devolver {product} del pedido {order}. Motivo: {reason}. ¿Cómo genero la etiqueta?',
      'Necesito iniciar una devolución de {product}. {reason_text} Quedo atento.',
    ],
  },
  producto_defectuoso: {
    subjects: ['Producto defectuoso', 'Llegó dañado', 'Falla en {product}', 'Garantía'],
    bodies: [
      'Recibí {product} (pedido {order}) y {defect} Quiero un cambio o el reembolso.',
      'Hola, el producto {product} presenta una falla: {defect} ¿Cubre la garantía?',
    ],
  },
  reembolso: {
    subjects: ['No he recibido mi reembolso', 'Reembolso pendiente pedido {order}', 'Estado de mi reembolso'],
    bodies: [
      'Devolví el producto hace {d} días y aún no veo el reembolso en mi tarjeta. Pedido {order}.',
      'Me confirmaron la recepción de la devolución pero el dinero no aparece. ¿Cuánto demora?',
    ],
  },
  pago_rechazado: {
    subjects: ['Me cobraron pero el pedido aparece como fallido', 'Pago rechazado', 'Error al pagar'],
    bodies: [
      'Intenté pagar el pedido {order} y me dice que el pago fue rechazado, pero en mi banco aparece el cargo.',
      'No puedo completar la compra, la tarjeta es rechazada aunque tiene fondos. ¿Hay algún problema con la pasarela?',
    ],
  },
  cancelacion: {
    subjects: ['Quiero cancelar mi pedido', 'Cancelación pedido {order}'],
    bodies: ['Por favor cancelen el pedido {order}, me equivoqué de producto.', 'Necesito cancelar el pedido {order} porque encontré otra opción. ¿Me devuelven el dinero completo?'],
  },
  cambio_talla: {
    subjects: ['Cambio de talla', 'Necesito otra talla'],
    bodies: ['El {product} me quedó {fit}. ¿Puedo cambiarlo por otra talla sin costo?', 'Quiero cambiar la talla del pedido {order}, la guía no coincide.'],
  },
  factura: {
    subjects: ['Solicitud de factura', 'Necesito la factura de mi compra'],
    bodies: ['Hola, necesito la factura del pedido {order} a nombre de mi empresa.', 'No me llegó la factura electrónica del pedido {order}.'],
  },
  consulta_producto: {
    subjects: ['Consulta sobre producto', '¿Es compatible?', 'Duda antes de comprar'],
    bodies: ['¿El {product} tiene garantía oficial? ¿Cuánto dura?', 'Quisiera saber si {product} viene con todos los accesorios de la foto.'],
  },
  cuenta: {
    subjects: ['No puedo iniciar sesión', 'Problema con mi cuenta'],
    bodies: ['No me llega el correo para restablecer la contraseña.', 'Mi cuenta aparece bloqueada después de varios intentos.'],
  },
};

const REASON_TEXT: Record<string, string> = {
  talla_incorrecta: 'La talla no me queda.',
  no_coincide_descripcion: 'No es lo que muestran las fotos.',
  defectuoso: 'Vino con una falla.',
  llego_danado: 'Llegó dañado.',
  cambio_de_opinion: 'Ya no lo necesito.',
  llego_tarde: 'Llegó demasiado tarde, ya no me sirve.',
};

export function ticketText(rng: Rng, c: TicketCtx): { subject: string; description: string } {
  const t = TICKET_TEMPLATES[c.category] ?? TICKET_TEMPLATES.consulta_producto;
  const defect = c.storyDefect ? rng.pick(DEFECT_STORY).toLowerCase() : rng.pick(DEFECT_GENERIC).toLowerCase();
  const vars = {
    order: c.orderNumber,
    product: c.productName,
    carrier: c.carrier,
    promised: c.promised,
    d: c.daysWaiting,
    reason: (c.reason ?? '').replace(/_/g, ' '),
    reason_text: REASON_TEXT[c.reason ?? ''] ?? '',
    defect,
    fit: rng.pick(['chico', 'grande', 'muy ajustado']),
  };
  return { subject: fill(rng.pick(t.subjects), vars), description: fill(rng.pick(t.bodies), vars) };
}

export const TICKET_CATEGORIES = Object.keys(TICKET_TEMPLATES);

/* ------------------------------------------------------------------ NPS */

export function npsComment(rng: Rng, score: number, late: boolean): string | null {
  if (rng.chance(0.35)) return null;
  if (score >= 9) return rng.pick(['Siempre llega a tiempo.', 'Buenos precios y mucha variedad.', 'La app es muy fácil de usar.', 'Excelente servicio, los recomiendo.', 'Las devoluciones son muy sencillas.']);
  if (score >= 7) return rng.pick(['Bien, pero el envío podría ser más rápido.', 'Buen servicio, aunque a veces falta stock.', 'Correcto, nada destacable.', 'Me gustaría más opciones de pago.']);
  if (late) return rng.pick(['El pedido llegó tarde y nadie me respondió.', 'La entrega es muy lenta, el transportista no cumple.', 'Prometen fechas que no cumplen.']);
  return rng.pick(['La devolución fue un calvario.', 'El producto no era lo que esperaba.', 'Atención al cliente muy lenta.', 'Me cobraron dos veces y tardaron en devolverme.']);
}

/* ------------------------------------------------------------------ Google Business Profile */

const GBP_POS = [
  'Muy rápido el retiro, me atendieron en 5 minutos.',
  'El personal fue muy amable y resolvió mi duda.',
  'Todo ordenado y limpio, excelente atención.',
  'Retiré mi pedido sin fila, muy práctico.',
  'Buena experiencia, el showroom tiene mucha variedad.',
  'Me ayudaron a cambiar un producto sin problemas.',
];
const GBP_NEG = [
  'Tuve que esperar más de una hora para retirar mi pedido.',
  'El paquete no estaba aunque me llegó el aviso de que estaba listo.',
  'Mala atención en el mostrador, nadie sabía nada.',
  'No hay dónde estacionar y el horario no se cumple.',
  'Cerraron antes del horario publicado.',
];
const GBP_STORY = [
  'Llevo días esperando, el pedido sigue sin llegar al punto de retiro.',
  'Me dicen que el transportista no ha entregado la mercancía, una semana de retraso.',
  'Fui tres veces y mi pedido nunca llegó. El transportista es un desastre.',
];

export function gbpText(rng: Rng, stars: number, story: boolean): string | null {
  if (rng.chance(0.18)) return null;
  if (story && stars <= 2) return rng.pick(GBP_STORY);
  return rng.pick(stars >= 4 ? GBP_POS : stars === 3 ? (rng.chance(0.5) ? GBP_POS : GBP_NEG) : GBP_NEG);
}

export function gbpReply(rng: Rng, stars: number): string | null {
  if (!rng.chance(stars <= 2 ? 0.7 : 0.35)) return null;
  return stars <= 2
    ? rng.pick(['Lamentamos lo ocurrido. Escríbenos por WhatsApp con tu número de pedido para ayudarte.', 'Gracias por tu comentario, ya lo compartimos con el equipo del punto para mejorar.'])
    : rng.pick(['¡Gracias por visitarnos!', 'Nos alegra que hayas tenido una buena experiencia.']);
}

/* ------------------------------------------------------------------ Descripción de producto */

export function productDescription(rng: Rng, name: string, l2Name: string, features: string[], brand: string): string {
  const f = rng.shuffle([...features]).slice(0, rng.int(2, Math.min(4, features.length)));
  const intro = rng.pick([
    `${name} de ${brand}, pensado para quienes buscan calidad y buen precio.`,
    `Descubre ${name}: la opción de ${brand} en ${l2Name.toLowerCase()}.`,
    `${name}. Diseño práctico y materiales duraderos de ${brand}.`,
  ]);
  return `${intro} Características: ${f.join(', ')}. ${rng.pick(['Garantía de 12 meses.', 'Envío a todo el país.', 'Devolución gratis dentro de 30 días.', 'Producto original con boleta o factura.'])}`;
}
