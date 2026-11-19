/** Datos de referencia del e-commerce ficticio "Mercadia" (5 países LATAM). */

export interface Region {
  name: string;
  w: number;
  cities: string[];
}
export interface Country {
  code: string;
  name: string;
  gaName: string;
  currency: string;
  fx0: number; // unidades por USD al inicio
  fxDriftYear: number; // depreciación anual
  fxVol: number; // volatilidad diaria
  vat: number;
  share: number;
  baseDeliveryDays: number;
  integerCurrency: boolean;
  utcOffset: number; // horas que se suman a la hora local para obtener UTC
  regions: Region[];
  carriers: Array<[string, number]>;
  cardGateway: string;
}

export const COUNTRIES: Country[] = [
  {
    code: 'MX', name: 'México', gaName: 'Mexico', currency: 'MXN', fx0: 17.0, fxDriftYear: 0.07, fxVol: 0.005,
    vat: 0.16, share: 0.38, baseDeliveryDays: 3, integerCurrency: false, utcOffset: 6, cardGateway: 'PayLatam',
    carriers: [['RutaExpress', 0.45], ['VeloxCargo', 0.35], ['PaqueteYa', 0.2]],
    regions: [
      { name: 'Ciudad de México', w: 24, cities: ['Ciudad de México'] },
      { name: 'Estado de México', w: 14, cities: ['Naucalpan', 'Toluca', 'Ecatepec', 'Tlalnepantla'] },
      { name: 'Jalisco', w: 10, cities: ['Guadalajara', 'Zapopan', 'Tlaquepaque'] },
      { name: 'Nuevo León', w: 10, cities: ['Monterrey', 'San Pedro Garza García', 'Guadalupe'] },
      { name: 'Puebla', w: 6, cities: ['Puebla', 'Cholula'] },
      { name: 'Querétaro', w: 5, cities: ['Querétaro', 'San Juan del Río'] },
      { name: 'Yucatán', w: 4, cities: ['Mérida'] },
      { name: 'Baja California', w: 5, cities: ['Tijuana', 'Mexicali', 'Ensenada'] },
      { name: 'Veracruz', w: 5, cities: ['Veracruz', 'Xalapa'] },
      { name: 'Guanajuato', w: 5, cities: ['León', 'Irapuato', 'Celaya'] },
    ],
  },
  {
    code: 'CO', name: 'Colombia', gaName: 'Colombia', currency: 'COP', fx0: 3950, fxDriftYear: 0.04, fxVol: 0.006,
    vat: 0.19, share: 0.2, baseDeliveryDays: 4, integerCurrency: true, utcOffset: 5, cardGateway: 'PayLatam',
    carriers: [['RutaExpress', 0.5], ['Andes Logística', 0.35], ['VeloxCargo', 0.15]],
    regions: [
      { name: 'Bogotá D.C.', w: 30, cities: ['Bogotá'] },
      { name: 'Antioquia', w: 18, cities: ['Medellín', 'Envigado', 'Bello', 'Itagüí'] },
      { name: 'Valle del Cauca', w: 14, cities: ['Cali', 'Palmira', 'Buenaventura'] },
      { name: 'Atlántico', w: 8, cities: ['Barranquilla', 'Soledad'] },
      { name: 'Bolívar', w: 5, cities: ['Cartagena'] },
      { name: 'Santander', w: 6, cities: ['Bucaramanga', 'Floridablanca'] },
      { name: 'Cundinamarca', w: 8, cities: ['Chía', 'Soacha', 'Zipaquirá'] },
      { name: 'Risaralda', w: 4, cities: ['Pereira', 'Dosquebradas'] },
    ],
  },
  {
    code: 'CL', name: 'Chile', gaName: 'Chile', currency: 'CLP', fx0: 880, fxDriftYear: 0.03, fxVol: 0.005,
    vat: 0.19, share: 0.15, baseDeliveryDays: 3, integerCurrency: true, utcOffset: 3, cardGateway: 'Pagora',
    carriers: [['Andes Logística', 0.5], ['VeloxCargo', 0.5]],
    regions: [
      { name: 'Región Metropolitana', w: 55, cities: ['Santiago', 'Providencia', 'Las Condes', 'Maipú', 'Puente Alto', 'Ñuñoa'] },
      { name: 'Valparaíso', w: 12, cities: ['Valparaíso', 'Viña del Mar', 'Quilpué'] },
      { name: 'Biobío', w: 9, cities: ['Concepción', 'Talcahuano', 'Los Ángeles'] },
      { name: 'Antofagasta', w: 6, cities: ['Antofagasta', 'Calama'] },
      { name: 'Araucanía', w: 5, cities: ['Temuco'] },
      { name: 'Los Lagos', w: 5, cities: ['Puerto Montt', 'Osorno'] },
      { name: 'Coquimbo', w: 6, cities: ['La Serena', 'Coquimbo'] },
    ],
  },
  {
    code: 'PE', name: 'Perú', gaName: 'Peru', currency: 'PEN', fx0: 3.75, fxDriftYear: 0.0, fxVol: 0.003,
    vat: 0.18, share: 0.12, baseDeliveryDays: 4, integerCurrency: false, utcOffset: 5, cardGateway: 'PayLatam',
    carriers: [['Andes Logística', 0.6], ['PaqueteYa', 0.4]],
    regions: [
      { name: 'Lima', w: 60, cities: ['Lima', 'Miraflores', 'San Isidro', 'Santiago de Surco', 'San Borja'] },
      { name: 'Callao', w: 6, cities: ['Callao'] },
      { name: 'Arequipa', w: 10, cities: ['Arequipa'] },
      { name: 'La Libertad', w: 8, cities: ['Trujillo'] },
      { name: 'Piura', w: 6, cities: ['Piura'] },
      { name: 'Lambayeque', w: 5, cities: ['Chiclayo'] },
      { name: 'Cusco', w: 5, cities: ['Cusco'] },
    ],
  },
  {
    code: 'AR', name: 'Argentina', gaName: 'Argentina', currency: 'ARS', fx0: 810, fxDriftYear: 0.35, fxVol: 0.008,
    vat: 0.21, share: 0.15, baseDeliveryDays: 5, integerCurrency: false, utcOffset: 3, cardGateway: 'Kuanto',
    carriers: [['PaqueteYa', 0.55], ['VeloxCargo', 0.45]],
    regions: [
      { name: 'Ciudad Autónoma de Buenos Aires', w: 30, cities: ['Buenos Aires'] },
      { name: 'Provincia de Buenos Aires', w: 28, cities: ['La Plata', 'Mar del Plata', 'Quilmes', 'Lomas de Zamora', 'Morón'] },
      { name: 'Córdoba', w: 12, cities: ['Córdoba', 'Villa Carlos Paz'] },
      { name: 'Santa Fe', w: 10, cities: ['Rosario', 'Santa Fe'] },
      { name: 'Mendoza', w: 7, cities: ['Mendoza'] },
      { name: 'Tucumán', w: 4, cities: ['San Miguel de Tucumán'] },
      { name: 'Salta', w: 3, cities: ['Salta'] },
    ],
  },
];

export const WAREHOUSES = [
  { code: 'WH-MX-01', name: 'CD Cuautitlán', country: 'MX', city: 'Cuautitlán Izcalli' },
  { code: 'WH-MX-02', name: 'CD Apodaca', country: 'MX', city: 'Apodaca' },
  { code: 'WH-CO-01', name: 'CD Funza', country: 'CO', city: 'Funza' },
  { code: 'WH-CL-01', name: 'CD Pudahuel', country: 'CL', city: 'Pudahuel' },
  { code: 'WH-PE-01', name: 'CD Lurín', country: 'PE', city: 'Lurín' },
  { code: 'WH-AR-01', name: 'CD Pilar', country: 'AR', city: 'Pilar' },
];
/** Regiones del norte de MX que se atienden desde Apodaca. */
export const MX_NORTH = new Set(['Nuevo León', 'Baja California']);

export const CARRIER_OFFSET: Record<string, number> = {
  RutaExpress: 0,
  VeloxCargo: -0.3,
  'Andes Logística': 0.4,
  PaqueteYa: 0.8,
};

export const GBP_LOCATIONS = [
  { id: 'GBP-MX-CDMX', name: 'Mercadia Punto de Retiro Polanco', country: 'MX', city: 'Ciudad de México', type: 'pickup_point' },
  { id: 'GBP-MX-GDL', name: 'Mercadia Showroom Guadalajara', country: 'MX', city: 'Guadalajara', type: 'showroom' },
  { id: 'GBP-MX-MTY', name: 'Mercadia Punto de Retiro Monterrey', country: 'MX', city: 'Monterrey', type: 'pickup_point' },
  { id: 'GBP-MX-CUA', name: 'Mercadia Tienda Bodega Cuautitlán', country: 'MX', city: 'Cuautitlán Izcalli', type: 'warehouse_store' },
  { id: 'GBP-CO-BOG', name: 'Mercadia Punto de Retiro Chapinero', country: 'CO', city: 'Bogotá', type: 'pickup_point' },
  { id: 'GBP-CO-MED', name: 'Mercadia Punto de Retiro Medellín Centro', country: 'CO', city: 'Medellín', type: 'pickup_point' },
  { id: 'GBP-CO-CAL', name: 'Mercadia Punto de Retiro Cali Sur', country: 'CO', city: 'Cali', type: 'pickup_point' },
  { id: 'GBP-CL-SCL', name: 'Mercadia Showroom Providencia', country: 'CL', city: 'Providencia', type: 'showroom' },
  { id: 'GBP-CL-PUD', name: 'Mercadia Tienda Bodega Pudahuel', country: 'CL', city: 'Pudahuel', type: 'warehouse_store' },
  { id: 'GBP-CL-VIN', name: 'Mercadia Punto de Retiro Viña del Mar', country: 'CL', city: 'Viña del Mar', type: 'pickup_point' },
  { id: 'GBP-PE-MIR', name: 'Mercadia Punto de Retiro Miraflores', country: 'PE', city: 'Miraflores', type: 'pickup_point' },
  { id: 'GBP-PE-ARQ', name: 'Mercadia Punto de Retiro Arequipa', country: 'PE', city: 'Arequipa', type: 'pickup_point' },
  { id: 'GBP-AR-PAL', name: 'Mercadia Showroom Palermo', country: 'AR', city: 'Buenos Aires', type: 'showroom' },
  { id: 'GBP-AR-ROS', name: 'Mercadia Punto de Retiro Rosario', country: 'AR', city: 'Rosario', type: 'pickup_point' },
  { id: 'GBP-AR-COR', name: 'Mercadia Punto de Retiro Córdoba', country: 'AR', city: 'Córdoba', type: 'pickup_point' },
];

/** Taxonomía del catálogo. */
export interface L2 {
  name: string;
  nouns: string[];
  price: [number, number]; // rango USD (lognormal entre ambos)
  variants: 'size_apparel' | 'size_shoe' | 'color' | 'none' | 'pack';
  features: string[];
}
export interface L1 {
  name: string;
  key: string;
  share: number;
  returnRate: number;
  qtyBias: number;
  brands: string[];
  children: L2[];
}

export const TAXONOMY: L1[] = [
  {
    name: 'Moda', key: 'moda', share: 0.2, returnRate: 0.11, qtyBias: 0.1,
    brands: ['Urbania', 'Lino & Co', 'Vértice', 'Costa Norte', 'Maré', 'Kalú', 'Doce Hilos', 'Andina Wear'],
    children: [
      { name: 'Camisetas y polos', nouns: ['Camiseta', 'Polo', 'Camiseta oversize'], price: [9, 35], variants: 'size_apparel', features: ['algodón peinado', 'corte regular', 'cuello redondo', 'tejido transpirable'] },
      { name: 'Pantalones y jeans', nouns: ['Jean', 'Pantalón chino', 'Jogger'], price: [20, 70], variants: 'size_apparel', features: ['denim elástico', 'tiro medio', 'cinco bolsillos', 'ajuste slim'] },
      { name: 'Vestidos y faldas', nouns: ['Vestido', 'Falda midi', 'Vestido camisero'], price: [18, 80], variants: 'size_apparel', features: ['tela fluida', 'estampado floral', 'largo midi', 'cintura ajustable'] },
      { name: 'Chaquetas y abrigos', nouns: ['Chaqueta', 'Parka', 'Abrigo', 'Cortavientos'], price: [30, 140], variants: 'size_apparel', features: ['repelente al agua', 'forro térmico', 'capucha desmontable', 'cierre YKK'] },
      { name: 'Ropa interior y pijamas', nouns: ['Pack de bóxers', 'Pijama', 'Brasier', 'Pack de calcetines'], price: [8, 40], variants: 'size_apparel', features: ['algodón suave', 'sin costuras', 'pack x3', 'elástico confortable'] },
      { name: 'Accesorios de moda', nouns: ['Bolso', 'Mochila', 'Cinturón', 'Gorra', 'Bufanda'], price: [10, 75], variants: 'color', features: ['cuero sintético', 'múltiples compartimentos', 'diseño unisex'] },
    ],
  },
  {
    name: 'Calzado', key: 'calzado', share: 0.1, returnRate: 0.1, qtyBias: 0,
    brands: ['Pisada', 'Rúa', 'Trekka', 'Nimbo', 'Sendero', 'Kumbre'],
    children: [
      { name: 'Zapatillas running', nouns: ['Zapatillas running'], price: [45, 140], variants: 'size_shoe', features: ['amortiguación reactiva', 'malla transpirable', 'drop 8 mm', 'suela de caucho'] },
      { name: 'Zapatillas urbanas', nouns: ['Zapatillas urbanas', 'Tenis casuales'], price: [35, 110], variants: 'size_shoe', features: ['suela vulcanizada', 'capellada de lona', 'plantilla acolchada'] },
      { name: 'Botas', nouns: ['Botas', 'Botines', 'Botas de montaña'], price: [50, 150], variants: 'size_shoe', features: ['cuero genuino', 'impermeables', 'suela antideslizante'] },
      { name: 'Sandalias', nouns: ['Sandalias', 'Chanclas'], price: [12, 45], variants: 'size_shoe', features: ['plantilla anatómica', 'secado rápido'] },
      { name: 'Zapatos formales', nouns: ['Zapatos Oxford', 'Mocasines', 'Zapatos de tacón'], price: [40, 120], variants: 'size_shoe', features: ['cuero liso', 'suela de goma', 'acabado mate'] },
    ],
  },
  {
    name: 'Electrónica', key: 'electronica', share: 0.15, returnRate: 0.05, qtyBias: 0,
    brands: ['Sonix', 'Voltra', 'Nexo', 'Pixelia', 'Ondra', 'Kairo Tech', 'Lumen'],
    children: [
      { name: 'Audífonos', nouns: ['Audífonos inalámbricos', 'Audífonos over-ear', 'Audífonos deportivos'], price: [15, 220], variants: 'color', features: ['cancelación activa de ruido', 'Bluetooth 5.3', '30 h de batería', 'estuche de carga'] },
      { name: 'Smartphones', nouns: ['Smartphone'], price: [150, 1100], variants: 'color', features: ['pantalla AMOLED 6.7"', '128 GB', 'cámara 50 MP', 'carga rápida 33W'] },
      { name: 'Tablets', nouns: ['Tablet'], price: [120, 700], variants: 'color', features: ['pantalla 11"', '8 GB RAM', 'lápiz compatible'] },
      { name: 'Smartwatches', nouns: ['Smartwatch', 'Pulsera de actividad'], price: [30, 350], variants: 'color', features: ['GPS integrado', 'monitor de sueño', 'resistente al agua 5 ATM'] },
      { name: 'Parlantes', nouns: ['Parlante portátil', 'Barra de sonido'], price: [25, 300], variants: 'color', features: ['sonido 360°', 'resistente al agua IPX7', 'modo fiesta'] },
      { name: 'Cargadores y cables', nouns: ['Cargador rápido', 'Cable USB-C', 'Power bank'], price: [6, 50], variants: 'none', features: ['65W GaN', 'trenzado de nylon', '20.000 mAh'] },
      { name: 'Laptops', nouns: ['Laptop', 'Notebook ultradelgada'], price: [350, 1600], variants: 'none', features: ['procesador de 8 núcleos', '16 GB RAM', 'SSD 512 GB', 'pantalla 14"'] },
    ],
  },
  {
    name: 'Hogar y Cocina', key: 'hogar', share: 0.15, returnRate: 0.04, qtyBias: 0.05,
    brands: ['Casanova', 'PowerMix', 'Brasa', 'Nido', 'Termia', 'Hogarix', 'Cuchara Roja'],
    children: [
      { name: 'Licuadoras y procesadores', nouns: ['Licuadora', 'Procesador de alimentos', 'Batidora de mano'], price: [25, 160], variants: 'color', features: ['motor de 900 W', 'vaso de vidrio 1.5 L', '6 velocidades', 'cuchillas de acero inoxidable'] },
      { name: 'Cafeteras', nouns: ['Cafetera de goteo', 'Cafetera espresso', 'Prensa francesa'], price: [20, 300], variants: 'color', features: ['15 bares de presión', 'jarra térmica', 'vaporizador de leche'] },
      { name: 'Freidoras de aire', nouns: ['Freidora de aire'], price: [45, 180], variants: 'color', features: ['capacidad 5.5 L', 'panel digital', '8 programas'] },
      { name: 'Ollas y sartenes', nouns: ['Sartén antiadherente', 'Set de ollas', 'Olla a presión'], price: [15, 150], variants: 'none', features: ['apto para inducción', 'recubrimiento cerámico', 'mangos antitérmicos'] },
      { name: 'Ropa de cama', nouns: ['Juego de sábanas', 'Edredón', 'Almohada'], price: [15, 120], variants: 'size_apparel', features: ['algodón 300 hilos', 'hipoalergénico', 'lavable a máquina'] },
      { name: 'Organización', nouns: ['Organizador', 'Repisa', 'Caja de almacenamiento'], price: [8, 60], variants: 'none', features: ['apilable', 'fácil armado', 'material reciclado'] },
      { name: 'Iluminación', nouns: ['Lámpara de pie', 'Lámpara de escritorio', 'Foco inteligente'], price: [10, 120], variants: 'color', features: ['LED regulable', 'control por app', 'luz cálida'] },
    ],
  },
  {
    name: 'Belleza y Cuidado Personal', key: 'belleza', share: 0.1, returnRate: 0.02, qtyBias: 0.2,
    brands: ['Aurea', 'Botánika', 'Serum Lab', 'Velvet', 'Bruma', 'Natíva'],
    children: [
      { name: 'Cuidado facial', nouns: ['Sérum facial', 'Crema hidratante', 'Protector solar', 'Limpiador facial'], price: [8, 60], variants: 'none', features: ['ácido hialurónico', 'FPS 50', 'sin fragancia', 'para piel mixta'] },
      { name: 'Perfumes', nouns: ['Perfume', 'Eau de toilette', 'Body mist'], price: [20, 130], variants: 'none', features: ['notas amaderadas', '100 ml', 'larga duración'] },
      { name: 'Maquillaje', nouns: ['Base de maquillaje', 'Labial', 'Máscara de pestañas', 'Paleta de sombras'], price: [6, 50], variants: 'color', features: ['acabado mate', 'a prueba de agua', 'alta pigmentación'] },
      { name: 'Cuidado capilar', nouns: ['Shampoo', 'Acondicionador', 'Secador de pelo', 'Plancha de pelo'], price: [6, 120], variants: 'none', features: ['sin sulfatos', 'tecnología iónica', 'keratina'] },
      { name: 'Afeitado y depilación', nouns: ['Afeitadora eléctrica', 'Recortadora de barba', 'Depiladora'], price: [15, 150], variants: 'none', features: ['recargable USB', 'cuchillas de titanio', 'uso en seco y húmedo'] },
    ],
  },
  {
    name: 'Deportes y Aire Libre', key: 'deportes', share: 0.08, returnRate: 0.05, qtyBias: 0.05,
    brands: ['Kumbre', 'Fuerza', 'Ola', 'Trekka', 'Pedal'],
    children: [
      { name: 'Fitness en casa', nouns: ['Set de mancuernas', 'Mat de yoga', 'Bandas elásticas', 'Banco de ejercicio'], price: [10, 250], variants: 'none', features: ['antideslizante', 'ajustable', 'incluye guía de ejercicios'] },
      { name: 'Ciclismo', nouns: ['Casco de ciclismo', 'Luces para bicicleta', 'Bicicleta urbana'], price: [15, 600], variants: 'color', features: ['certificación CE', 'recargable', 'cuadro de aluminio'] },
      { name: 'Camping', nouns: ['Carpa', 'Saco de dormir', 'Linterna frontal', 'Mochila de trekking'], price: [12, 300], variants: 'none', features: ['para 4 personas', 'impermeable', 'ultraligera'] },
      { name: 'Ropa deportiva', nouns: ['Calzas deportivas', 'Polera dry-fit', 'Short de running'], price: [12, 60], variants: 'size_apparel', features: ['secado rápido', 'protección UV', 'bolsillo lateral'] },
      { name: 'Suplementos', nouns: ['Proteína en polvo', 'Creatina', 'Bebida isotónica en polvo'], price: [15, 70], variants: 'pack', features: ['1 kg', 'sabor chocolate', 'sin azúcar añadida'] },
    ],
  },
  {
    name: 'Juguetes y Bebés', key: 'juguetes', share: 0.07, returnRate: 0.04, qtyBias: 0.05,
    brands: ['Pequeñín', 'Ludo', 'Bloki', 'Arcoíris', 'Mimo'],
    children: [
      { name: 'Juegos de mesa', nouns: ['Juego de mesa', 'Rompecabezas 1000 piezas', 'Juego de cartas'], price: [10, 60], variants: 'none', features: ['de 2 a 6 jugadores', 'desde 8 años', 'partidas de 30 min'] },
      { name: 'Bloques de construcción', nouns: ['Set de bloques', 'Kit de construcción'], price: [15, 150], variants: 'none', features: ['500 piezas', 'compatible con otras marcas', 'desde 6 años'] },
      { name: 'Muñecas y figuras', nouns: ['Muñeca', 'Figura de acción', 'Peluche'], price: [8, 60], variants: 'none', features: ['articulada', 'incluye accesorios', 'materiales no tóxicos'] },
      { name: 'Coches y sillas para bebé', nouns: ['Coche para bebé', 'Silla de auto', 'Silla de comer'], price: [60, 400], variants: 'color', features: ['plegado con una mano', 'sistema ISOFIX', 'arnés de 5 puntos'] },
      { name: 'Pañales e higiene', nouns: ['Pañales', 'Toallitas húmedas'], price: [8, 40], variants: 'pack', features: ['talla G', 'hipoalergénicas', 'pack económico'] },
    ],
  },
  {
    name: 'Mascotas', key: 'mascotas', share: 0.05, returnRate: 0.02, qtyBias: 0.3,
    brands: ['Patitas', 'Huella', 'Bigotes', 'Canino Pro'],
    children: [
      { name: 'Alimento para perros', nouns: ['Alimento seco para perro', 'Snacks para perro'], price: [10, 80], variants: 'pack', features: ['adulto raza mediana', '15 kg', 'sin colorantes'] },
      { name: 'Alimento para gatos', nouns: ['Alimento seco para gato', 'Alimento húmedo para gato'], price: [8, 60], variants: 'pack', features: ['control de bolas de pelo', '7 kg', 'esterilizados'] },
      { name: 'Juguetes para mascotas', nouns: ['Juguete mordedor', 'Rascador', 'Pelota interactiva'], price: [5, 50], variants: 'none', features: ['caucho natural', 'resistente', 'con hierba gatera'] },
      { name: 'Camas y accesorios', nouns: ['Cama para mascota', 'Correa retráctil', 'Transportadora'], price: [10, 90], variants: 'size_apparel', features: ['lavable', 'acolchada', 'aprobada para viajes'] },
    ],
  },
  {
    name: 'Supermercado', key: 'super', share: 0.1, returnRate: 0.01, qtyBias: 0.8,
    brands: ['Del Valle Alto', 'Granja Sur', 'Cafetal', 'Limpio+', 'Despensa Mía'],
    children: [
      { name: 'Café y té', nouns: ['Café en grano', 'Café molido', 'Té verde', 'Cápsulas de café'], price: [4, 30], variants: 'pack', features: ['tostado medio', 'origen único', '500 g'] },
      { name: 'Snacks', nouns: ['Mix de frutos secos', 'Barras de cereal', 'Chocolate amargo'], price: [2, 15], variants: 'pack', features: ['sin gluten', 'pack x12', '70% cacao'] },
      { name: 'Bebidas', nouns: ['Agua mineral', 'Jugo natural', 'Bebida energética'], price: [2, 20], variants: 'pack', features: ['pack x6', 'sin azúcar', 'botella de vidrio'] },
      { name: 'Limpieza del hogar', nouns: ['Detergente líquido', 'Limpiador multiuso', 'Lavavajillas'], price: [3, 25], variants: 'pack', features: ['biodegradable', '3 L', 'aroma lavanda'] },
      { name: 'Despensa', nouns: ['Aceite de oliva', 'Arroz integral', 'Pasta', 'Quinoa'], price: [2, 25], variants: 'pack', features: ['orgánico', '1 kg', 'extra virgen'] },
    ],
  },
];

export const MODEL_WORDS = ['Pro', 'Max', 'Lite', 'Plus', 'Air', 'Classic', 'Sport', 'Urban', 'Eco', 'Prime', 'One', 'Flex', 'Go', 'Ultra', 'Mini', 'Studio', 'Trail', 'Neo'];
export const COLORS = ['Negro', 'Blanco', 'Azul', 'Gris', 'Rojo', 'Verde', 'Beige', 'Rosa'];
export const SIZES_APPAREL = ['XS', 'S', 'M', 'L', 'XL'];
export const SIZES_SHOE = ['36', '37', '38', '39', '40', '41', '42', '43', '44'];
export const PACKS = ['Unidad', 'Pack x2', 'Pack x6'];

/** Fuentes de tráfico: participación esperada en pedidos y tasa de conversión base. */
export interface TrafficSource {
  source: string;
  medium: string;
  campaign: string;
  platform?: 'google_ads' | 'meta_ads' | 'tiktok_ads';
  orderShare: number;
  conv: number;
  cpc?: number;
  ctr?: number;
  active?: [string, string]; // ventana de fechas
}

export const TRAFFIC_SOURCES: TrafficSource[] = [
  { source: 'google', medium: 'organic', campaign: '(organic)', orderShare: 0.22, conv: 0.021 },
  { source: '(direct)', medium: '(none)', campaign: '(direct)', orderShare: 0.14, conv: 0.034 },
  { source: 'google', medium: 'cpc', campaign: 'search_brand', platform: 'google_ads', orderShare: 0.12, conv: 0.048, cpc: 0.22, ctr: 0.12 },
  { source: 'google', medium: 'cpc', campaign: 'search_generic', platform: 'google_ads', orderShare: 0.1, conv: 0.024, cpc: 0.55, ctr: 0.045 },
  { source: 'google', medium: 'cpc', campaign: 'shopping_pmax', platform: 'google_ads', orderShare: 0.1, conv: 0.03, cpc: 0.42, ctr: 0.02 },
  { source: 'facebook', medium: 'paid_social', campaign: 'prospecting_broad', platform: 'meta_ads', orderShare: 0.06, conv: 0.011, cpc: 0.38, ctr: 0.012 },
  { source: 'facebook', medium: 'paid_social', campaign: 'retargeting_dpa', platform: 'meta_ads', orderShare: 0.06, conv: 0.032, cpc: 0.33, ctr: 0.018 },
  { source: 'tiktok', medium: 'paid_social', campaign: 'tiktok_awareness', platform: 'tiktok_ads', orderShare: 0.02, conv: 0.007, cpc: 0.18, ctr: 0.008, active: ['2025-03-01', '2099-01-01'] },
  { source: 'email', medium: 'crm', campaign: '__email__', orderShare: 0.05, conv: 0.04 },
  { source: 'afiliados', medium: 'referral', campaign: 'programa_afiliados', orderShare: 0.03, conv: 0.019 },
  // Historia: campaña de video con ROAS muy bajo (jul–sep 2026)
  { source: 'facebook', medium: 'paid_social', campaign: 'Prospecting_Q3_2026_Video', platform: 'meta_ads', orderShare: 0.004, conv: 0.0016, cpc: 0.52, ctr: 0.006, active: ['2026-07-01', '2026-09-30'] },
];

export const DEVICES: Array<{ channel: string; device: string; ga: string | null; share: number; convMult: number }> = [
  { channel: 'web', device: 'desktop', ga: 'desktop', share: 0.27, convMult: 1.3 },
  { channel: 'web', device: 'mobile', ga: 'mobile', share: 0.38, convMult: 0.72 },
  { channel: 'app', device: 'ios', ga: 'app', share: 0.12, convMult: 1.6 },
  { channel: 'app', device: 'android', ga: 'app', share: 0.14, convMult: 1.5 },
  { channel: 'marketplace', device: 'marketplace', ga: null, share: 0.09, convMult: 1 },
];

export const PAYMENT_METHODS: Array<[string, number]> = [
  ['card', 0.55],
  ['debit', 0.15],
  ['wallet', 0.14],
  ['bank_transfer', 0.05],
  ['cash_voucher', 0.07],
  ['bnpl', 0.04],
];

export const RETURN_REASONS = [
  'talla_incorrecta',
  'no_coincide_descripcion',
  'defectuoso',
  'llego_danado',
  'cambio_de_opinion',
  'llego_tarde',
];
