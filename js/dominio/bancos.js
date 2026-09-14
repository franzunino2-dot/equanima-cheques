// Catálogo de entidades financieras (código BCRA de 3 dígitos, que es el
// prefijo del CBU). Sirve para el selector de banco girado y para deducir el
// banco a partir de un CBU pegado.

export const BANCOS = [
  { cod: '007', nombre: 'Banco de Galicia y Buenos Aires' },
  { cod: '011', nombre: 'Banco de la Nación Argentina' },
  { cod: '014', nombre: 'Banco de la Provincia de Buenos Aires' },
  { cod: '015', nombre: 'Industrial and Commercial Bank of China (ICBC)' },
  { cod: '016', nombre: 'Citibank N.A.' },
  { cod: '017', nombre: 'BBVA Argentina' },
  { cod: '020', nombre: 'Banco de la Provincia de Córdoba' },
  { cod: '027', nombre: 'Banco Supervielle' },
  { cod: '029', nombre: 'Banco de la Ciudad de Buenos Aires' },
  { cod: '030', nombre: 'Banco Central de la República Argentina' },
  { cod: '034', nombre: 'Banco Patagonia' },
  { cod: '044', nombre: 'Banco Hipotecario' },
  { cod: '045', nombre: 'Banco de San Juan' },
  { cod: '060', nombre: 'Banco del Tucumán' },
  { cod: '065', nombre: 'Banco Municipal de Rosario' },
  { cod: '072', nombre: 'Banco Santander Argentina' },
  { cod: '083', nombre: 'Banco del Chubut' },
  { cod: '086', nombre: 'Banco de Santa Cruz' },
  { cod: '093', nombre: 'Banco de La Pampa' },
  { cod: '094', nombre: 'Banco de Corrientes' },
  { cod: '097', nombre: 'Banco Provincia del Neuquén' },
  { cod: '143', nombre: 'Brubank' },
  { cod: '147', nombre: 'Banco Interfinanzas' },
  { cod: '150', nombre: 'HSBC Bank Argentina' },
  { cod: '158', nombre: 'Openbank Argentina' },
  { cod: '165', nombre: 'JPMorgan Chase Bank' },
  { cod: '191', nombre: 'Banco Credicoop Cooperativo' },
  { cod: '198', nombre: 'Banco de Valores' },
  { cod: '247', nombre: 'Banco Roela' },
  { cod: '254', nombre: 'Banco Mariva' },
  { cod: '259', nombre: 'Banco Itaú Argentina' },
  { cod: '262', nombre: 'Bank of America' },
  { cod: '266', nombre: 'BNP Paribas' },
  { cod: '268', nombre: 'Banco Provincia de Tierra del Fuego' },
  { cod: '269', nombre: 'Banco de la República Oriental del Uruguay' },
  { cod: '277', nombre: 'Banco Sáenz' },
  { cod: '281', nombre: 'Banco Meridian' },
  { cod: '285', nombre: 'Banco Macro' },
  { cod: '299', nombre: 'Banco Comafi' },
  { cod: '300', nombre: 'Banco de Inversión y Comercio Exterior (BICE)' },
  { cod: '301', nombre: 'Banco Piano' },
  { cod: '305', nombre: 'Banco Julio' },
  { cod: '309', nombre: 'Banco Rioja' },
  { cod: '310', nombre: 'Banco del Sol' },
  { cod: '311', nombre: 'Nuevo Banco del Chaco' },
  { cod: '312', nombre: 'Banco Voii' },
  { cod: '315', nombre: 'Banco de Formosa' },
  { cod: '319', nombre: 'Banco CMF' },
  { cod: '321', nombre: 'Banco de Santiago del Estero' },
  { cod: '322', nombre: 'Banco Industrial (BIND)' },
  { cod: '330', nombre: 'Nuevo Banco de Santa Fe' },
  { cod: '331', nombre: 'Banco Cetelem Argentina' },
  { cod: '332', nombre: 'Banco de Servicios Financieros' },
  { cod: '336', nombre: 'Banco Bradesco Argentina' },
  { cod: '338', nombre: 'Banco de Servicios y Transacciones' },
  { cod: '339', nombre: 'RCI Banque' },
  { cod: '340', nombre: 'BACS Banco de Crédito y Securitización' },
  { cod: '341', nombre: 'Más Ventas' },
  { cod: '384', nombre: 'Wilobank' },
  { cod: '386', nombre: 'Nuevo Banco de Entre Ríos' },
  { cod: '389', nombre: 'Banco Columbia' },
  { cod: '426', nombre: 'Banco Bica' },
  { cod: '431', nombre: 'Banco Coinag' },
  { cod: '432', nombre: 'Banco de Comercio' },
  { cod: '435', nombre: 'Banco Supervielle (ex Cordial)' },
  { cod: '448', nombre: 'Banco Dino' },
  { cod: '515', nombre: 'Banco Mercedes Cambio' }
];

const PORCOD = {};
BANCOS.forEach(b => { PORCOD[b.cod] = b; });

export function bancoPorCodigo(cod) {
  return PORCOD[String(cod || '').padStart(3, '0')] || null;
}

export function bancoDesdeCBU(cbu) {
  const d = String(cbu || '').replace(/\D/g, '');
  if (d.length < 3) return null;
  return bancoPorCodigo(d.slice(0, 3));
}

export function nombreBanco(cod) {
  const b = bancoPorCodigo(cod);
  return b ? b.nombre : (cod || '—');
}

// Motivos de rechazo típicos de cámara compensadora.
export const MOTIVOS_RECHAZO = [
  'Sin fondos suficientes',
  'Cuenta cerrada',
  'Orden de no pagar',
  'Defecto formal (firma / enmienda)',
  'Firma no registrada o insuficiente',
  'Cheque vencido (fuera de plazo de presentación)',
  'Endoso defectuoso o cadena incompleta',
  'Diferencia entre importe en números y letras',
  'Cheque denunciado (extravío / sustracción)',
  'Cuenta embargada / inhibida',
  'Otro'
];
